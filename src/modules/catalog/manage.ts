import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import type { Database } from "@/db/types";
import { service, serviceStaff, staff } from "@/db/schema";
import { DomainError } from "@/lib/domain-error";
import { recordAudit } from "@/modules/audit/record";

// La carte vue par le gérant (R-11, R-13). Chaque fonction est une transaction : l'action et sa trace au journal
// existent ensemble ou pas du tout (principe 6). `actorId` est le compte équipe qui a saisi le code gérant (R-73).

export type StaffRole = "barber" | "apprentice";

/** Ce que le gérant peut changer sur une prestation existante. Le rôle (qui la réalise) ne change pas : R-12, R-18. */
export interface ServiceFields {
  name: string;
  category: string | null;
  priceCents: number;
  durationMin: number;
  bookableOnline: boolean;
}

export interface ServiceInput extends ServiceFields {
  performedBy: StaffRole;
  /** Coiffeurs habilités (R-13) : des membres actifs du rôle de la prestation. */
  staffIds: string[];
}

export interface ManagedService extends ServiceFields {
  id: string;
  performedBy: StaffRole;
  active: boolean;
  sortOrder: number;
  /** Habilités parmi les membres actifs. */
  staffIds: string[];
  /** Ceux qu'on peut habiliter : membres actifs du rôle de la prestation, dans l'ordre d'affichage. */
  candidates: { id: string; firstName: string }[];
}

const MAX_PRICE_CENTS = 1_000_000; // 10 000 €, garde-fou contre une faute de frappe
const MAX_DURATION_MIN = 480;

const fieldsSchema = z.object({
  name: z.string().trim().min(1).max(80),
  category: z
    .string()
    .trim()
    .max(40)
    .nullable()
    .transform((value) => value || null),
  priceCents: z.number().int().min(0).max(MAX_PRICE_CENTS), // R-10, R-15
  durationMin: z
    .number()
    .int()
    .min(15)
    .max(MAX_DURATION_MIN)
    .refine((minutes) => minutes % 15 === 0), // R-10 : multiple de 15 minutes
  bookableOnline: z.boolean(),
});

function parseFields(input: ServiceFields): ServiceFields {
  const parsed = fieldsSchema.safeParse({
    name: input.name,
    category: input.category,
    priceCents: input.priceCents,
    durationMin: input.durationMin,
    bookableOnline: input.bookableOnline,
  });
  if (!parsed.success) throw new DomainError("invalid_service");
  return parsed.data;
}

type Tx = Database;

const snapshot = (row: typeof service.$inferSelect) => ({
  name: row.name,
  category: row.category,
  priceCents: row.priceCents,
  durationMin: row.durationMin,
  bookableOnline: row.bookableOnline,
});

async function lockService(tx: Tx, id: string) {
  const [row] = await tx.select().from(service).where(eq(service.id, id)).for("update");
  if (!row) throw new DomainError("unknown_service");
  return row;
}

/** Membres actifs du rôle, dans l'ordre d'affichage. */
async function activeMembers(tx: Tx, role: StaffRole) {
  return tx
    .select({ id: staff.id, firstName: staff.firstName })
    .from(staff)
    .where(and(eq(staff.active, true), eq(staff.role, role)))
    .orderBy(asc(staff.sortOrder), asc(staff.firstName));
}

/** Habilités parmi les membres actifs, triés pour pouvoir comparer et journaliser. */
async function currentStaffIds(tx: Tx, serviceId: string): Promise<string[]> {
  const rows = await tx
    .select({ id: serviceStaff.staffId })
    .from(serviceStaff)
    .innerJoin(staff, eq(staff.id, serviceStaff.staffId))
    .where(and(eq(serviceStaff.serviceId, serviceId), eq(staff.active, true)));
  return rows.map((r) => r.id).sort();
}

/** R-12, R-13, R-18 : des membres actifs, du rôle de la prestation. */
async function assertHabilitable(tx: Tx, role: StaffRole, staffIds: string[]): Promise<string[]> {
  const unique = [...new Set(staffIds)];
  if (unique.length === 0) return [];
  const found = await tx
    .select({ id: staff.id, role: staff.role })
    .from(staff)
    .where(and(inArray(staff.id, unique), eq(staff.active, true)));
  if (found.length !== unique.length) throw new DomainError("unknown_staff");
  if (found.some((member) => member.role !== role)) throw new DomainError("staff_role_mismatch");
  return unique.sort();
}

/** Une prestation proposée en ligne et affichée dans la carte a besoin d'au moins un coiffeur (R-13, R-20). */
function assertBookable(active: boolean, bookableOnline: boolean, staffCount: number) {
  if (active && bookableOnline && staffCount === 0) throw new DomainError("no_staff_for_service");
}

/** Toutes les prestations, retirées comprises, avec leurs habilités : l'écran « Carte et tarifs » du gérant. */
export async function listServicesForManager(db: Database): Promise<ManagedService[]> {
  const [services, members, links] = await Promise.all([
    db.select().from(service).orderBy(asc(service.sortOrder), asc(service.name)),
    db
      .select({ id: staff.id, firstName: staff.firstName, role: staff.role })
      .from(staff)
      .where(eq(staff.active, true))
      .orderBy(asc(staff.sortOrder), asc(staff.firstName)),
    db.select().from(serviceStaff),
  ]);
  const activeIds = new Set(members.map((m) => m.id));
  return services.map((s) => ({
    id: s.id,
    ...snapshot(s),
    performedBy: s.performedBy,
    active: s.active,
    sortOrder: s.sortOrder,
    staffIds: links
      .filter((l) => l.serviceId === s.id && activeIds.has(l.staffId))
      .map((l) => l.staffId)
      .sort(),
    candidates: members
      .filter((m) => m.role === s.performedBy)
      .map((m) => ({ id: m.id, firstName: m.firstName })),
  }));
}

/** Ajoute une prestation, à la fin de la carte (R-11). Retourne son identifiant. */
export async function createService(
  db: Database,
  input: ServiceInput,
  actorId: string,
): Promise<string> {
  const fields = parseFields(input);
  return db.transaction(async (tx) => {
    const staffIds = await assertHabilitable(tx, input.performedBy, input.staffIds);
    assertBookable(true, fields.bookableOnline, staffIds.length);

    const [{ next }] = await tx
      .select({ next: sql<number>`coalesce(max(${service.sortOrder}), 0) + 1` })
      .from(service);
    const [created] = await tx
      .insert(service)
      .values({ ...fields, performedBy: input.performedBy, sortOrder: next })
      .returning({ id: service.id });
    if (staffIds.length > 0) {
      await tx
        .insert(serviceStaff)
        .values(staffIds.map((staffId) => ({ serviceId: created.id, staffId })));
    }
    await recordAudit(tx, {
      actorType: "manager",
      actorId,
      action: "service.created",
      entity: "service",
      entityId: created.id,
      after: { ...fields, performedBy: input.performedBy, staffIds },
    });
    return created.id;
  });
}

/** Ce que « Modifier » enregistre : les champs, et si `staffIds` est donné, la liste des habilités dans la même transaction. */
export interface ServiceChanges extends ServiceFields {
  staffIds?: string[];
}

/**
 * Modifie nom, groupe, prix, durée et réservabilité en ligne (R-11, R-17), et au besoin les habilités (R-13) en une
 * seule fois : la règle « un coiffeur au moins pour une prestation en ligne » se juge sur l'état final. Les rendez-vous
 * déjà pris gardent leur prix, leur durée et le nom d'origine (R-16) : ils les ont copiés à la réservation.
 */
export async function updateService(
  db: Database,
  id: string,
  input: ServiceChanges,
  actorId: string,
): Promise<void> {
  const fields = parseFields(input);
  await db.transaction(async (tx) => {
    const row = await lockService(tx, id);
    const nextStaff = input.staffIds
      ? await assertHabilitable(tx, row.performedBy, input.staffIds)
      : await currentStaffIds(tx, id);
    assertBookable(row.active, fields.bookableOnline, nextStaff.length);

    const before = snapshot(row);
    if (JSON.stringify(before) !== JSON.stringify(fields)) {
      await tx.update(service).set(fields).where(eq(service.id, id));
      await recordAudit(tx, {
        actorType: "manager",
        actorId,
        action: "service.updated",
        entity: "service",
        entityId: id,
        before,
        after: fields,
      });
    }
    if (input.staffIds) await replaceStaff(tx, row, nextStaff, actorId);
  });
}

/**
 * Retire une prestation de la carte, ou l'y remet (R-11). Elle n'est jamais supprimée : l'historique des rendez-vous
 * la garde (R-16). Retirée, elle ne se réserve plus, mais les rendez-vous déjà pris tiennent.
 */
export async function setServiceActive(
  db: Database,
  id: string,
  active: boolean,
  actorId: string,
): Promise<void> {
  await db.transaction(async (tx) => {
    const row = await lockService(tx, id);
    if (row.active === active) return;
    if (active) assertBookable(true, row.bookableOnline, (await currentStaffIds(tx, id)).length);

    await tx.update(service).set({ active }).where(eq(service.id, id));
    await recordAudit(tx, {
      actorType: "manager",
      actorId,
      action: active ? "service.reactivated" : "service.deactivated",
      entity: "service",
      entityId: id,
      before: { active: row.active },
      after: { active },
    });
  });
}

/**
 * Remplace la liste des coiffeurs habilités (R-13). Seuls des membres actifs du rôle de la prestation sont acceptés
 * (R-12, R-18). Les habilitations d'un membre désactivé ne sont pas touchées : il les retrouve s'il revient.
 * Les rendez-vous déjà pris ne bougent pas ; ceux qui ne respectent plus la liste sont à traiter (D-57).
 */
export async function setServiceStaff(
  db: Database,
  id: string,
  staffIds: string[],
  actorId: string,
): Promise<void> {
  await db.transaction(async (tx) => {
    const row = await lockService(tx, id);
    const next = await assertHabilitable(tx, row.performedBy, staffIds);
    assertBookable(row.active, row.bookableOnline, next.length);
    await replaceStaff(tx, row, next, actorId);
  });
}

async function replaceStaff(
  tx: Tx,
  row: typeof service.$inferSelect,
  next: string[],
  actorId: string,
): Promise<void> {
  const before = await currentStaffIds(tx, row.id);
  if (JSON.stringify(before) === JSON.stringify(next)) return;

  const members = await activeMembers(tx, row.performedBy);
  const removed = members.map((m) => m.id).filter((memberId) => !next.includes(memberId));
  if (removed.length > 0) {
    await tx
      .delete(serviceStaff)
      .where(and(eq(serviceStaff.serviceId, row.id), inArray(serviceStaff.staffId, removed)));
  }
  const added = next.filter((memberId) => !before.includes(memberId));
  if (added.length > 0) {
    await tx
      .insert(serviceStaff)
      .values(added.map((staffId) => ({ serviceId: row.id, staffId })))
      .onConflictDoNothing();
  }
  await recordAudit(tx, {
    actorType: "manager",
    actorId,
    action: "service.staff_changed",
    entity: "service",
    entityId: row.id,
    before: { staffIds: before },
    after: { staffIds: next },
  });
}

/**
 * Monte ou descend une prestation de la carte, parmi les prestations affichées. Au bout de la liste, ne fait rien.
 * L'ordre est renuméroté de 1 à n pour rester propre.
 */
export async function moveService(
  db: Database,
  id: string,
  direction: "up" | "down",
  actorId: string,
): Promise<void> {
  await db.transaction(async (tx) => {
    // Verrou sur toute la carte : deux déplacements simultanés ne se mélangent pas.
    const all = await tx
      .select({ id: service.id, active: service.active, sortOrder: service.sortOrder })
      .from(service)
      .orderBy(asc(service.sortOrder), asc(service.name), asc(service.id))
      .for("update");
    const target = all.find((s) => s.id === id);
    if (!target) throw new DomainError("unknown_service");
    if (!target.active) return;

    const shown = all.filter((s) => s.active);
    const from = shown.findIndex((s) => s.id === id);
    const to = direction === "up" ? from - 1 : from + 1;
    if (to < 0 || to >= shown.length) return;
    [shown[from], shown[to]] = [shown[to], shown[from]];

    // Les prestations retirées gardent leur place : on remplit les emplacements des prestations affichées.
    let cursor = 0;
    const reordered = all.map((s) => (s.active ? shown[cursor++] : s));
    for (const [index, s] of reordered.entries()) {
      const position = index + 1;
      if (all.find((a) => a.id === s.id)!.sortOrder !== position) {
        await tx.update(service).set({ sortOrder: position }).where(eq(service.id, s.id));
      }
    }
    await recordAudit(tx, {
      actorType: "manager",
      actorId,
      action: "service.moved",
      entity: "service",
      entityId: id,
      before: { position: all.findIndex((s) => s.id === id) + 1 },
      after: { position: reordered.findIndex((s) => s.id === id) + 1 },
    });
  });
}
