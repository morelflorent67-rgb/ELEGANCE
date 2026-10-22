import { expect, test, type Page } from "@playwright/test";
import {
  addAppointment,
  addCustomer,
  chooseAuthor,
  loginTablet,
  openDay,
  parisIso,
  pastOpenDay,
  resetData,
  setManagerCode,
  sql,
} from "./helpers";

// R-89 à R-93 : l'encaissement au terminal SumUp Solo depuis la fiche RDV (D-105). Le serveur de test utilise un faux
// terminal, que /api/e2e/payment commande comme le client qui paie (ou pas).

test.beforeEach(async ({ request }) => {
  await resetData();
  await request.post("/api/e2e/payment", { data: { action: "reset" } });
  await sql`update salon_settings set payment_merchant_code = 'MABC1234', payment_reader_id = 'rdr-1'`;
});

const CODE = "246810";
const TIMEOUT = { timeout: 15_000 };

async function openFiche(page: Page) {
  const day = pastOpenDay(3);
  const thomas = await addCustomer("Thomas", "Durand");
  const id = await addAppointment(thomas.email, {
    startsAt: parisIso(day, "10:00"),
    service: "Coupe & taille de barbe", // 28 €
  });
  await loginTablet(page);
  await page.goto(`/equipe?jour=${day}&rdv=${id}`);
  return { id, day, fiche: page.getByRole("complementary") };
}

test.describe("R-89 à R-93 : encaisser depuis la fiche", () => {
  test("le montant part au terminal, le paiement revient tout seul et devient le montant encaissé", async ({
    page,
    request,
  }) => {
    const { id, fiche } = await openFiche(page);
    await fiche.getByRole("button", { name: "Encaisser · 28 €" }).click();
    // Sans nom, impossible d'envoyer (R-74).
    await expect(fiche.getByRole("button", { name: "Envoyer au terminal" })).toBeDisabled();
    await chooseAuthor(page, "Kaan", "Qui encaisse ?");
    await fiche.getByRole("button", { name: "Envoyer au terminal" }).click();
    await expect(fiche.getByText("En attente du client sur le terminal · 28 €")).toBeVisible();

    const sent = await (
      await request.post("/api/e2e/payment", { data: { action: "last" } })
    ).json();
    expect(sent.sent).toHaveLength(1);
    expect(sent.sent[0].amountCents).toBe(2800);

    await request.post("/api/e2e/payment", { data: { action: "complete", status: "successful" } });
    await expect(fiche.getByText("Encaissé · 28 €")).toBeVisible(TIMEOUT);
    await expect(fiche.getByRole("button", { name: /^Encaisser/ })).toHaveCount(0);

    const [row] = await sql`select status, amount_cents from payment where appointment_id = ${id}`;
    expect(row).toMatchObject({ status: "successful", amount_cents: 2800 });
    const [entry] = await sql`select actor_type from audit_log where action = 'appointment.paid'`;
    expect(entry.actor_type).toBe("staff");
  });

  test("un paiement refusé laisse le RDV à encaisser et propose de réessayer", async ({
    page,
    request,
  }) => {
    const { id, fiche } = await openFiche(page);
    await fiche.getByRole("button", { name: "Encaisser · 28 €" }).click();
    await chooseAuthor(page, "Orhan", "Qui encaisse ?");
    await fiche.getByRole("button", { name: "Envoyer au terminal" }).click();
    await expect(fiche.getByText("En attente du client sur le terminal")).toBeVisible();

    await request.post("/api/e2e/payment", { data: { action: "complete", status: "failed" } });
    await expect(fiche.getByText("Le paiement n’a pas abouti")).toBeVisible(TIMEOUT);
    await expect(fiche.getByRole("button", { name: "Réessayer l’encaissement · 28 €" })).toBeVisible();
    const [row] = await sql`select adjusted_amount_cents from appointment where id = ${id}`;
    expect(row.adjusted_amount_cents).toBeNull();
  });

  test("annuler sur le terminal clôt l'encaissement", async ({ page }) => {
    const { fiche } = await openFiche(page);
    await fiche.getByRole("button", { name: "Encaisser · 28 €" }).click();
    await chooseAuthor(page, "Enes", "Qui encaisse ?");
    await fiche.getByRole("button", { name: "Envoyer au terminal" }).click();
    await expect(fiche.getByText("En attente du client sur le terminal")).toBeVisible();

    await expect(fiche.getByRole("button", { name: "Annuler sur le terminal" })).toBeDisabled();
    await chooseAuthor(page, "Kaan", "Qui annule ?");
    await fiche.getByRole("button", { name: "Annuler sur le terminal" }).click();
    await expect(fiche.getByText("Encaissement annulé")).toBeVisible();
    const [row] = await sql`select status from payment`;
    expect(row.status).toBe("cancelled");
  });

  test("terminal éteint : message clair, rien n'est enregistré", async ({ page, request }) => {
    const { id, fiche } = await openFiche(page);
    await request.post("/api/e2e/payment", { data: { action: "offline", value: true } });
    await fiche.getByRole("button", { name: "Encaisser · 28 €" }).click();
    await chooseAuthor(page, "Kaan", "Qui encaisse ?");
    await fiche.getByRole("button", { name: "Envoyer au terminal" }).click();
    await expect(fiche.getByRole("alert")).toContainText("Le terminal ne répond pas");
    const [row] = await sql`select adjusted_amount_cents from appointment where id = ${id}`;
    expect(row.adjusted_amount_cents).toBeNull();
  });

  test("terminal pas encore relié : le message renvoie au gérant", async ({ page }) => {
    await sql`update salon_settings set payment_merchant_code = null, payment_reader_id = null`;
    const { fiche } = await openFiche(page);
    await fiche.getByRole("button", { name: "Encaisser · 28 €" }).click();
    await chooseAuthor(page, "Kaan", "Qui encaisse ?");
    await fiche.getByRole("button", { name: "Envoyer au terminal" }).click();
    await expect(fiche.getByRole("alert")).toContainText("pas encore relié");
  });

  test("un RDV à venir n'a pas de bouton « Encaisser »", async ({ page }) => {
    const thomas = await addCustomer("Thomas", "Durand");
    const day = openDay(5);
    const id = await addAppointment(thomas.email, { startsAt: parisIso(day, "10:00") });
    await loginTablet(page);
    await page.goto(`/equipe?jour=${day}&rdv=${id}`);
    await expect(page.getByRole("complementary").getByText("À venir", { exact: true })).toBeVisible();
    await expect(page.getByRole("complementary").getByRole("button", { name: /^Encaisser/ })).toHaveCount(0);
  });
});

test.describe("R-91 : le rappel de SumUp", () => {
  const HOOK = "/api/sumup/webhook/secret-du-rappel-de-test";

  test("une adresse sans le bon secret est introuvable", async ({ request }) => {
    const response = await request.post("/api/sumup/webhook/mauvais", {
      data: { payload: { client_transaction_id: "x" } },
    });
    expect(response.status()).toBe(404);
  });

  test("un identifiant inconnu ou absent est refusé sans rien changer", async ({ request }) => {
    const unknown = await request.post(HOOK, { data: { payload: { client_transaction_id: "inconnu" } } });
    expect(unknown.status()).toBe(202);
    const missing = await request.post(HOOK, { data: {} });
    expect(missing.status()).toBe(400);
  });

  test("le rappel enregistre le paiement terminé, sans attendre la tablette, et se rejoue sans effet", async ({
    page,
    request,
  }) => {
    const { id, fiche } = await openFiche(page);
    await fiche.getByRole("button", { name: "Encaisser · 28 €" }).click();
    await chooseAuthor(page, "Kaan", "Qui encaisse ?");
    await fiche.getByRole("button", { name: "Envoyer au terminal" }).click();
    await expect(fiche.getByText("En attente du client sur le terminal")).toBeVisible();
    const [pending] = await sql`select provider_reference from payment`;

    // Annoncé par SumUp mais pas encore vrai chez lui : sans effet.
    const early = await request.post(HOOK, {
      data: { type: "solo.transaction.updated", payload: { client_transaction_id: pending.provider_reference, status: "successful" } },
    });
    expect(early.status()).toBe(200);
    expect((await sql`select status from payment`)[0].status).toBe("pending");

    await request.post("/api/e2e/payment", { data: { action: "complete", status: "successful" } });
    for (let i = 0; i < 2; i++) {
      await request.post(HOOK, {
        data: { type: "solo.transaction.updated", payload: { client_transaction_id: pending.provider_reference } },
      });
    }
    const [row] = await sql`select status from payment where appointment_id = ${id}`;
    expect(row.status).toBe("successful");
    expect(await sql`select 1 from audit_log where action = 'appointment.paid'`).toHaveLength(1);
  });
});

test.describe("D-105 : relier le terminal dans l'espace gérant", () => {
  test("le gérant relie puis délie le terminal", async ({ page }) => {
    test.skip((page.viewportSize()?.width ?? 0) < 768, "parcours de la tablette");
    await sql`update salon_settings set payment_merchant_code = null, payment_reader_id = null`;
    await setManagerCode(CODE);
    await loginTablet(page);
    await page.goto("/equipe/gerant");
    await page.getByLabel("Code à 6 chiffres").fill(CODE);
    await page.getByRole("button", { name: "Déverrouiller" }).click();
    await page.getByRole("link", { name: /Terminal d’encaissement/ }).click();
    await expect(page.getByRole("heading", { name: "Terminal d’encaissement" })).toBeVisible();

    await page.getByLabel("Code marchand").fill("MABC1234");
    await page.getByLabel("Code d’appairage").fill("INVALID");
    await page.getByRole("button", { name: "Relier le terminal" }).click();
    await expect(page.locator("p[role=alert]")).toContainText("a refusé ce code");

    await page.getByLabel("Code d’appairage").fill("ZX81QA");
    await page.getByRole("button", { name: "Relier le terminal" }).click();
    await expect(page.getByText("Terminal relié")).toBeVisible();
    await expect(page.getByText("Code marchand · MABC1234")).toBeVisible();

    await page.getByRole("button", { name: "Délier le terminal" }).click();
    await expect(page.getByRole("button", { name: "Relier le terminal" })).toBeVisible();
  });
});
