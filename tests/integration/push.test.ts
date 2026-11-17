import { generateKeyPairSync, verify } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { anonymizeCustomer } from "../../src/modules/customers/profile";
import { cancelAppointment, createAppointment, salonCancelAppointment } from "../../src/modules/booking";
import { processOutbox, type EmailMessage, type EmailTransport } from "../../src/modules/mail";
import { apnsBody, apnsJwt, apnsResult } from "../../src/modules/push/apns";
import { registerDevice, unregisterDevice } from "../../src/modules/push/devices";
import { createFakePush } from "../../src/modules/push/transport";
import { joinWaitlist, processWaitlist } from "../../src/modules/waitlist";
import { COUPE, ENES, NOW, ORHAN, connectTestDb, createCustomer, paris } from "./helpers";

// R-102, D-124 : les notifications de l'app iPhone. Elles accompagnent les emails (rappel, place libérée, RDV déplacé ou
// annulé par le salon) : mêmes règles d'abandon et de report, et elles ne remplacent jamais l'email.

const t = connectTestDb();
const options = { baseUrl: "https://exemple.fr", secret: "secret-de-test" };
const TOKEN_A = "a".repeat(64);
const TOKEN_B = "b".repeat(64);
const SATURDAY = "2026-11-07";

let customerId: string;

beforeEach(async () => {
  await t.reset();
  customerId = await createCustomer(t.sql, { name: "Thomas" });
  await t.sql`update salon_settings set change_cutoff_hours = 48, reminder_hours = 72`;
});
afterAll(() => t.close());

function mailer() {
  const sent: EmailMessage[] = [];
  const transport: EmailTransport = {
    async send(message) {
      sent.push(message);
    },
  };
  return { transport, sent };
}

const book = (startsAt = paris(SATURDAY, "10:00")) =>
  createAppointment(
    t.db,
    { customerId, serviceIds: [COUPE], staffId: ORHAN, startsAt, source: "online" },
    NOW,
  );

/** Un passage du programme d'envoi à `now`, avec un faux Apple. */
async function run(now: Date, reply?: Parameters<typeof createFakePush>[0]) {
  const push = createFakePush(reply);
  const { transport, sent } = mailer();
  await processOutbox(t.db, { ...options, transport, push, now });
  return { push, emails: sent };
}

describe("appareils (R-102)", () => {
  it("enregistre un jeton, le rattache à un autre client s'il change de compte, et refuse un jeton invalide", async () => {
    const other = await createCustomer(t.sql, { name: "Autre" });
    expect(await registerDevice(t.db, customerId, TOKEN_A)).toBe(true);
    expect(await registerDevice(t.db, other, TOKEN_A.toUpperCase())).toBe(true);
    expect(await registerDevice(t.db, customerId, "pas-un-jeton")).toBe(false);
    const rows = await t.sql`select token, customer_id from push_device`;
    expect(rows).toEqual([{ token: TOKEN_A, customer_id: other }]);
  });

  it("n'oublie un jeton que pour son propre client (déconnexion)", async () => {
    const other = await createCustomer(t.sql, { name: "Autre" });
    await registerDevice(t.db, customerId, TOKEN_A);
    await unregisterDevice(t.db, other, TOKEN_A);
    expect(await t.sql`select 1 from push_device`).toHaveLength(1);
    await unregisterDevice(t.db, customerId, TOKEN_A);
    expect(await t.sql`select 1 from push_device`).toHaveLength(0);
  });

  it("la suppression du compte (R-75) efface les appareils", async () => {
    await registerDevice(t.db, customerId, TOKEN_A);
    await anonymizeCustomer(t.db, { customerId, actor: { type: "manager", id: null }, onImminent: "cancel" }, NOW);
    expect(await t.sql`select 1 from push_device`).toHaveLength(0);
  });
});

describe("rappel (R-61, R-102)", () => {
  it("part avec l'email du rappel, à tous les appareils du client, et dit quel RDV ouvrir", async () => {
    await registerDevice(t.db, customerId, TOKEN_A);
    await registerDevice(t.db, customerId, TOKEN_B);
    const created = await book();
    // Le rappel est dû 72 h avant le RDV de samedi 10 h.
    const { push, emails } = await run(paris("2026-11-04", "11:00"));
    expect(emails.some((m) => m.subject.startsWith("Rappel"))).toBe(true);
    expect(push.sent.map((s) => s.token).sort()).toEqual([TOKEN_A, TOKEN_B]);
    const message = push.sent[0].message;
    expect(message.title).toBe("Rappel de rendez-vous");
    expect(message.body).toContain("10:00");
    expect(message.data).toEqual({ kind: "appointment", appointmentId: created.id });
  });

  it("n'envoie rien si le client n'a aucun appareil : l'email part quand même", async () => {
    await book();
    const { push, emails } = await run(paris("2026-11-04", "11:00"));
    expect(emails.some((m) => m.subject.startsWith("Rappel"))).toBe(true);
    expect(push.sent).toHaveLength(0);
  });

  it("n'envoie rien si le RDV est annulé avant l'envoi (comme l'email)", async () => {
    await registerDevice(t.db, customerId, TOKEN_A);
    const created = await book();
    await cancelAppointment(t.db, { customerId, appointmentId: created.id }, NOW);
    const { push } = await run(paris("2026-11-04", "11:00"));
    expect(push.sent).toHaveLength(0);
  });

  it("attend, comme l'email, qu'un RDV « à traiter » soit traité", async () => {
    await registerDevice(t.db, customerId, TOKEN_A);
    await book();
    await t.sql`insert into absence (staff_id, starts_at, ends_at, reason)
                values (${ORHAN}, ${paris(SATURDAY, "00:00")}, ${paris(SATURDAY, "23:59")}, 'maladie')`;
    const { push } = await run(paris("2026-11-04", "11:00"));
    expect(push.sent).toHaveLength(0);
  });

  it("oublie l'appareil qu'Apple ne connaît plus, sans toucher à l'email", async () => {
    await registerDevice(t.db, customerId, TOKEN_A);
    await registerDevice(t.db, customerId, TOKEN_B);
    await book();
    const { emails } = await run(paris("2026-11-04", "11:00"), (token) => (token === TOKEN_A ? "invalid_token" : "sent"));
    expect(emails.some((m) => m.subject.startsWith("Rappel"))).toBe(true);
    const rows = await t.sql`select token from push_device`;
    expect(rows).toEqual([{ token: TOKEN_B }]);
  });
});

describe("RDV annulé par le salon (R-102)", () => {
  it("prévient le client ; une annulation faite par le client lui-même ne déclenche aucune notification", async () => {
    await registerDevice(t.db, customerId, TOKEN_A);
    const bySalon = await book(paris(SATURDAY, "10:00"));
    await salonCancelAppointment(t.db, { appointmentId: bySalon.id, authorStaffId: ENES }, NOW);
    const byClient = await book(paris(SATURDAY, "11:00"));
    await cancelAppointment(t.db, { customerId, appointmentId: byClient.id }, NOW);

    const { push } = await run(NOW);
    const titles = push.sent.map((s) => s.message.title);
    expect(titles).toEqual(["Rendez-vous annulé par le salon"]);
    expect(push.sent[0].message.data).toEqual({ kind: "appointment", appointmentId: bySalon.id });
  });
});

describe("place libérée (R-82, R-102)", () => {
  it("la notification ouvre l'offre", async () => {
    const holder = await createCustomer(t.sql, { name: "Tenant" });
    const TUESDAY = "2026-11-03";
    await t.sql`insert into absence (staff_id, starts_at, ends_at, reason) values (${ENES}, ${paris(TUESDAY, "00:00")}, ${paris(TUESDAY, "23:59")}, 'plein')`;
    await t.sql`insert into absence (staff_id, starts_at, ends_at, reason) values
      (${ORHAN}, ${paris(TUESDAY, "00:00")}, ${paris(TUESDAY, "10:00")}, 'avant'),
      (${ORHAN}, ${paris(TUESDAY, "10:30")}, ${paris(TUESDAY, "23:59")}, 'après')`;
    const [row] = await t.sql`
      insert into appointment (customer_id, staff_id, starts_at, ends_at, status, source)
      values (${holder}, ${ORHAN}, ${paris(TUESDAY, "10:00")}, ${paris(TUESDAY, "10:30")}, 'confirmed', 'salon') returning id`;
    await t.sql`insert into appointment_item (appointment_id, service_id, name_snapshot, price_cents, duration_min, position)
                values (${row.id}, ${COUPE}, 'Coupe homme', 1800, 30, 0)`;
    await joinWaitlist(t.db, { customerId, serviceIds: [COUPE], staffId: "any", days: [TUESDAY], window: "day" }, NOW);
    await registerDevice(t.db, customerId, TOKEN_A);
    await t.sql`update appointment set status = 'cancelled_by_salon' where id = ${row.id}`;
    await processWaitlist(t.db, NOW);
    const [offer] = await t.sql`select id from waitlist_offer`;

    const { push, emails } = await run(NOW);
    expect(emails.some((m) => m.subject.includes("place"))).toBe(true);
    expect(push.sent).toHaveLength(1);
    expect(push.sent[0].message.title).toBe("Une place s'est libérée");
    expect(push.sent[0].message.data).toEqual({ kind: "offer", offerId: offer.id });
  });
});

describe("APNs : jeton, corps et réponses d'Apple", () => {
  const { privateKey, publicKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
  const pem = privateKey.export({ type: "pkcs8", format: "pem" }).toString();

  it("signe un jeton ES256 que la clé publique vérifie (clé écrite avec des \\n comme dans deploy/.env)", () => {
    const jwt = apnsJwt({ key: pem.replace(/\n/g, "\\n"), keyId: "ABC123DEFG", teamId: "TEAM123456" }, 1_700_000_000);
    const [header, claims, signature] = jwt.split(".");
    expect(JSON.parse(Buffer.from(header, "base64url").toString())).toEqual({ alg: "ES256", kid: "ABC123DEFG" });
    expect(JSON.parse(Buffer.from(claims, "base64url").toString())).toEqual({ iss: "TEAM123456", iat: 1_700_000_000 });
    const ok = verify("sha256", Buffer.from(`${header}.${claims}`), { key: publicKey, dsaEncoding: "ieee-p1363" }, Buffer.from(signature, "base64url"));
    expect(ok).toBe(true);
  });

  it("le corps ne contient que le texte et ce que l'app ouvre", () => {
    const body = JSON.parse(apnsBody({ title: "T", body: "B", data: { kind: "offer", offerId: "o1" } }));
    expect(body).toEqual({ aps: { alert: { title: "T", body: "B" }, sound: "default" }, data: { kind: "offer", offerId: "o1" } });
  });

  it("distingue l'appareil disparu d'une panne passagère", () => {
    expect(apnsResult(200, undefined)).toBe("sent");
    expect(apnsResult(410, "Unregistered")).toBe("invalid_token");
    expect(apnsResult(400, "BadDeviceToken")).toBe("invalid_token");
    expect(apnsResult(503, "ServiceUnavailable")).toBe("failed");
    expect(apnsResult(403, "ExpiredProviderToken")).toBe("failed");
  });
});
