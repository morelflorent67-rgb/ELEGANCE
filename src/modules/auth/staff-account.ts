// Création ou mise à jour du compte « équipe » de la tablette (R-72, D-50), pour `scripts/staff-account.mjs`.
// Aucun import `@/` ni import relatif : Node charge ce fichier directement (comme `import-file.ts`). Le mot de passe
// arrive déjà haché (`hashPassword`, voir `password.ts`).
import type postgres from "postgres";

export type StaffAccountResult = "created" | "updated" | "customer_account";

/** Crée le compte, ou change le mot de passe d'un compte équipe existant (ses sessions sont fermées). */
export async function upsertStaffAccount(
  sql: postgres.Sql,
  email: string,
  passwordHash: string,
): Promise<StaffAccountResult> {
  const key = email.trim().toLowerCase();
  return sql.begin(async (tx) => {
    const [existing] = await tx`select id, role from auth_user where email = ${key} for update`;
    if (!existing) {
      await tx`insert into auth_user (email, password_hash, role) values (${key}, ${passwordHash}, 'staff')`;
      return "created";
    }
    if (existing.role !== "staff") return "customer_account";
    await tx`update auth_user set password_hash = ${passwordHash}, updated_at = now() where id = ${existing.id}`;
    await tx`delete from auth_session where user_id = ${existing.id}`;
    return "updated";
  });
}
