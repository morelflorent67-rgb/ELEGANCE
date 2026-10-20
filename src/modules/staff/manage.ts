import { and, asc, eq, ne, sql } from "drizzle-orm";
import { z } from "zod";
import type { Database } from "@/db/types";
import { service, serviceStaff, staff } from "@/db/schema";
import { DomainError } from "@/lib/domain-error";
import { recordAudit } from "@/modules/audit/record";

// L'équipe vue par le gérant (R-02, R-13). Chaque fonction est une transaction : l'action et sa trace au journal
// existent ensemble ou pas du tout (principe 6). `actorId` est le compte équipe qui a saisi le code gérant (R-73).
// Un membre n'est jamais supprimé : les rendez-vous passés le gardent (R-16). Il est « retiré » (désactivé).

export type StaffRole = "barber" | "apprentice";

export interface NewStaffMember {
  firstName: string;
  role: StaffRole;
}

export interface ManagedStaff {
  id: string;
  firstName: string;
  role: StaffRole;
  active: boolean;
  /** Prestations de la carte (non retirées) qu'il réalise. */
  serviceCount: number;
}

const nameSchema = z.string().trim().min(1).max(40);
const roleSchema = z.enum(["barber", "apprentice"]);

function parseName(value: string): string {
  const parsed = nameSchema.safeParse(value);
  if (!parsed.success) throw new DomainError("invalid_staff");
  return parsed.data;
}

/** Deux changements de l'équipe en même temps ne se mélangent pas (prénoms uniques, ordre). */
const lockTeam = (tx: Database) => tx.execute(sql`select pg_advisory_xact_lock(hashtext('team'))`);

/** Le prénom sert à signer (R-74) et à choisir un coiffeur : deux membres actifs ne le partagent pas. */
async function assertNameFree(tx: Database, firstName: string, exceptId?: string) {
  const [clash] = await tx
    .select({ id: staff.id })
    .from(staff)
    .where(
      and(
        eq(staff.active, true),
        sql`lower(${staff.firstName}) = lower(${firstName})`,
        ...(exceptId ? [ne(staff.id, exceptId)] : []),
      ),
    )
    .limit(1);
  if (clash) throw new DomainError("staff_name_taken");
}

async function lockMember(tx: Database, id: string) {
  const [row] = await tx.select().from(staff).where(eq(staff.id, id)).for("update");
  if (!row) throw new DomainError("unknown_staff");
  return row;
}

/** Toute l'équipe, retirés compris, dans l'ordre d'affichage : l'écran « Équipe » du gérant. */
export async function listStaffForManager(db: Database): Promise<ManagedStaff[]> {
  const rows = await db
    .select({
      id: staff.id,
      firstName: staff.firstName,
      role: staff.role,
      active: staff.active,
      serviceCount: sql<number>`(
        select count(*)::int from ${serviceStaff} ss join ${service} s on s.id = ss.service_id
        where ss.staff_id = "staff"."id" and s.active
      )`,
    })
    .from(staff)
    .orderBy(asc(staff.sortOrder), asc(staff.firstName));
  return rows;
}

/**
 * Ajoute un membre, à la fin de l'équipe (R-02). Il est habilité d'office pour toutes les prestations de la carte de
 * son rôle (R-12, R-13) : le gérant ajuste ensuite prestation par prestation. Retourne son identifiant.
 */
export async function createStaffMember(
  db: Database,
  input: NewStaffMember,
  actorId: string,
): Promise<string> {
  const firstName = parseName(input.firstName);
  const role = roleSchema.safeParse(input.role);
  if (!role.success) throw new DomainError("invalid_staff");

  return db.transaction(async (tx) => {
    await lockTeam(tx);
    await assertNameFree(tx, firstName);
    const [{ next }] = await tx
      .select({ next: sql<number>`coalesce(max(${staff.sortOrder}), 0) + 1` })
      .from(staff);
    const [created] = await tx
      .insert(staff)
      .values({ firstName, role: role.data, sortOrder: next })
      .returning({ id: staff.id });

    const services = await tx
      .select({ id: service.id })
      .from(service)
      .where(and(eq(service.active, true), eq(service.performedBy, role.data)));
    if (services.length > 0) {
      await tx
        .insert(serviceStaff)
        .values(services.map((s) => ({ serviceId: s.id, staffId: created.id })));
    }
    await recordAudit(tx, {
      actorType: "manager",
      actorId,
      action: "staff.created",
      entity: "staff",
      entityId: created.id,
      after: { firstName, role: role.data, serviceCount: services.length },
    });
    return created.id;
  });
}

/** Change le prénom. Le rôle ne change pas après coup : il porte les habilitations (R-12, R-18). */
export async function renameStaffMember(
  db: Database,
  id: string,
  firstNameInput: string,
  actorId: string,
): Promise<void> {
  const firstName = parseName(firstNameInput);
  await db.transaction(async (tx) => {
    await lockTeam(tx);
    const row = await lockMember(tx, id);
    if (row.firstName === firstName) return;
    if (row.active) await assertNameFree(tx, firstName, id);

    await tx.update(staff).set({ firstName }).where(eq(staff.id, id));
    await recordAudit(tx, {
      actorType: "manager",
      actorId,
      action: "staff.renamed",
      entity: "staff",
      entityId: id,
      before: { firstName: row.firstName },
      after: { firstName },
    });
  });
}

/**
 * Retire un membre de l'équipe (il part) ou le remet (D-57). Retiré, il n'a plus de colonne, ne reçoit plus de
 * réservation et ne peut plus signer. Ses rendez-vous à venir restent en place : ils sont à traiter.
 * Refusé s'il est le dernier à réaliser une prestation réservable en ligne : il faut d'abord la passer « sur appel »
 * ou la retirer de la carte, sinon un client la choisirait sans personne pour la faire (R-13, R-20).
 */
export async function setStaffActive(
  db: Database,
  id: string,
  active: boolean,
  actorId: string,
): Promise<void> {
  await db.transaction(async (tx) => {
    await lockTeam(tx);
    const row = await lockMember(tx, id);
    if (row.active === active) return;

    if (active) {
      await assertNameFree(tx, row.firstName, id);
    } else {
      const orphaned = await tx.execute(sql`
        select s.id from ${service} s
        where s.active and s.bookable_online
          and exists (select 1 from ${serviceStaff} ss where ss.service_id = s.id and ss.staff_id = ${id})
          and not exists (
            select 1 from ${serviceStaff} ss2 join ${staff} st on st.id = ss2.staff_id
            where ss2.service_id = s.id and st.active and st.id <> ${id}
          )
        limit 1`);
      if (orphaned.length > 0) throw new DomainError("staff_needed_for_service");
    }

    await tx.update(staff).set({ active }).where(eq(staff.id, id));
    await recordAudit(tx, {
      actorType: "manager",
      actorId,
      action: active ? "staff.reactivated" : "staff.deactivated",
      entity: "staff",
      entityId: id,
      before: { active: row.active },
      after: { active },
    });
  });
}

/**
 * Monte ou descend un membre parmi l'équipe active. L'ordre d'affichage départage « Sans préférence » à égalité
 * (R-20, D-40). Au bout de la liste, ne fait rien. L'ordre est renuméroté de 1 à n.
 */
export async function moveStaffMember(
  db: Database,
  id: string,
  direction: "up" | "down",
  actorId: string,
): Promise<void> {
  await db.transaction(async (tx) => {
    await lockTeam(tx);
    const all = await tx
      .select({ id: staff.id, active: staff.active, sortOrder: staff.sortOrder })
      .from(staff)
      .orderBy(asc(staff.sortOrder), asc(staff.firstName), asc(staff.id))
      .for("update");
    const target = all.find((s) => s.id === id);
    if (!target) throw new DomainError("unknown_staff");
    if (!target.active) return;

    const shown = all.filter((s) => s.active);
    const from = shown.findIndex((s) => s.id === id);
    const to = direction === "up" ? from - 1 : from + 1;
    if (to < 0 || to >= shown.length) return;
    [shown[from], shown[to]] = [shown[to], shown[from]];

    // Les membres retirés gardent leur place : on remplit les emplacements des membres actifs.
    let cursor = 0;
    const reordered = all.map((s) => (s.active ? shown[cursor++] : s));
    for (const [index, member] of reordered.entries()) {
      const position = index + 1;
      if (all.find((a) => a.id === member.id)!.sortOrder !== position) {
        await tx.update(staff).set({ sortOrder: position }).where(eq(staff.id, member.id));
      }
    }
    await recordAudit(tx, {
      actorType: "manager",
      actorId,
      action: "staff.moved",
      entity: "staff",
      entityId: id,
      before: { position: all.findIndex((s) => s.id === id) + 1 },
      after: { position: reordered.findIndex((s) => s.id === id) + 1 },
    });
  });
}
