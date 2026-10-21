import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { OVERDUE_AFTER_HOURS, outboxHealth } from "../../src/modules/mail/health";
import { NOW, connectTestDb } from "./helpers";

// Surveillance de la file d'envoi (lot 8) : /api/health signale un email qui aurait dû partir et n'est pas parti.

const t = connectTestDb();
beforeEach(() => t.reset());
afterAll(() => t.close());

const hoursBefore = (hours: number) => new Date(NOW.getTime() - hours * 3_600_000);
let n = 0;

async function addEmail(options: {
  status?: "pending" | "sent" | "failed";
  nextAttemptAt: Date;
  held?: boolean;
  createdAt?: Date;
}) {
  n++;
  await t.sql`
    insert into email_outbox (type, to_email, status, next_attempt_at, held_for_manager, dedupe_key, created_at)
    values ('confirmation', 'client@example.com', ${options.status ?? "pending"}, ${options.nextAttemptAt},
            ${options.held ?? false}, ${`sante-${n}`}, ${options.createdAt ?? options.nextAttemptAt})`;
}

describe("outboxHealth", () => {
  it("file vide ou à jour : rien à signaler", async () => {
    await addEmail({ nextAttemptAt: hoursBefore(1) }); // dû depuis peu : le prochain passage l'enverra
    await addEmail({ nextAttemptAt: new Date(NOW.getTime() + 3_600_000) }); // rappel programmé
    await addEmail({ status: "sent", nextAttemptAt: hoursBefore(100) });
    expect(await outboxHealth(t.db, NOW)).toEqual({ overdue: 0, failedLastWeek: 0 });
  });

  it("compte les emails dus depuis trop longtemps (cron arrêté, Brevo injoignable)", async () => {
    await addEmail({ nextAttemptAt: hoursBefore(OVERDUE_AFTER_HOURS + 1) });
    await addEmail({ nextAttemptAt: hoursBefore(OVERDUE_AFTER_HOURS + 30) });
    expect((await outboxHealth(t.db, NOW)).overdue).toBe(2);
  });

  it("ne compte pas un email retenu pour le gérant (R-43) : il attend sa confirmation, pas un envoi", async () => {
    await addEmail({ nextAttemptAt: hoursBefore(OVERDUE_AFTER_HOURS + 5), held: true });
    expect((await outboxHealth(t.db, NOW)).overdue).toBe(0);
  });

  it("compte les échecs définitifs des 7 derniers jours seulement", async () => {
    await addEmail({ status: "failed", nextAttemptAt: hoursBefore(2) });
    await addEmail({ status: "failed", nextAttemptAt: hoursBefore(24 * 8) });
    expect(await outboxHealth(t.db, NOW)).toEqual({ overdue: 0, failedLastWeek: 1 });
  });
});
