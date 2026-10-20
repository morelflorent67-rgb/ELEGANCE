import { createHmac } from "node:crypto";
import { expect, test } from "@playwright/test";
import { addCustomer, resetData, sql } from "./helpers";

// R-64 : « Ne plus recevoir ces invitations ». Le lien de l'email est signé avec le secret du serveur de test
// (scripts/e2e-server.mjs).
const SECRET = "secret-des-tests-de-bout-en-bout";
const tokenFor = (customerId: string) =>
  createHmac("sha256", SECRET).update(`avis-desinscription:${customerId}`).digest("base64url");

test.beforeEach(async () => {
  await resetData();
});

test.describe("R-64 : se désabonner des invitations à un avis", () => {
  test("le lien de l'email demande confirmation, puis le client ne reçoit plus d'invitation", async ({
    page,
  }) => {
    const thomas = await addCustomer("Thomas", "Durand");
    await page.goto(`/avis/desinscription?c=${thomas.id}&t=${tokenFor(thomas.id)}`);
    await expect(
      page.getByRole("heading", { name: "Ne plus recevoir ces invitations ?" }),
    ).toBeVisible();
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);

    // Ouvrir le lien ne change rien : un analyseur de messagerie qui le suivrait ne désabonne personne.
    const [before] = await sql`select review_opt_out from customer where id = ${thomas.id}`;
    expect(before.review_opt_out).toBe(false);

    await page.getByRole("button", { name: "Ne plus recevoir" }).click();
    await expect(page.getByRole("heading", { name: "C’est noté" })).toBeVisible();
    await expect(page.getByText("continuent d’arriver")).toBeVisible();
    const [after] = await sql`select review_opt_out from customer where id = ${thomas.id}`;
    expect(after.review_opt_out).toBe(true);
    const [entry] =
      await sql`select actor_type from audit_log where action = 'customer.review_opt_out'`;
    expect(entry.actor_type).toBe("customer");
  });

  test("un lien falsifié ou incomplet ne change rien", async ({ page }) => {
    const thomas = await addCustomer("Thomas", "Durand");
    for (const url of [
      `/avis/desinscription?c=${thomas.id}&t=faux`,
      `/avis/desinscription?c=${thomas.id}`,
      "/avis/desinscription",
      `/avis/desinscription?c=pas-un-id&t=${tokenFor(thomas.id)}`,
    ]) {
      await page.goto(url);
      await expect(page.getByRole("heading", { name: "Ce lien n’est plus valable" })).toBeVisible();
      await expect(page.getByRole("button", { name: "Ne plus recevoir" })).toHaveCount(0);
    }
    const [row] = await sql`select review_opt_out from customer where id = ${thomas.id}`;
    expect(row.review_opt_out).toBe(false);
  });

  test("le jeton d'un client ne désabonne pas un autre", async ({ page }) => {
    const thomas = await addCustomer("Thomas", "Durand");
    const adam = await addCustomer("Adam", "Karaca");
    await page.goto(`/avis/desinscription?c=${adam.id}&t=${tokenFor(thomas.id)}`);
    await expect(page.getByRole("heading", { name: "Ce lien n’est plus valable" })).toBeVisible();
    const [row] = await sql`select review_opt_out from customer where id = ${adam.id}`;
    expect(row.review_opt_out).toBe(false);
  });
});
