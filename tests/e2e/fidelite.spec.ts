import { expect, test, type Page } from "@playwright/test";
import {
  addAppointment,
  addCustomer,
  chooseAuthor,
  loginTablet,
  newClient,
  parisIso,
  pastOpenDay,
  refreshVitrine,
  resetData,
  setManagerCode,
  signUpClient,
  sql,
} from "./helpers";

// D-114, R-96 à R-100 : la carte de fidélité. Le client voit sa carte (mobile), le salon utilise la coupe offerte sur
// la fiche RDV (tablette), le gérant règle et corrige.

test.beforeEach(async () => {
  await resetData();
  // Le décompte commence avant les RDV posés par les tests.
  await sql`update salon_settings set loyalty_started_at = '2020-01-01T00:00:00Z'`;
  await refreshVitrine();
});

const isPhone = (page: Page) => (page.viewportSize()?.width ?? 0) < 768;
const tabletOnly = (page: Page) => test.skip(isPhone(page), "parcours de la tablette");
const CODE = "246810";

async function pastVisits(email: string, count: number) {
  for (let i = 0; i < count; i++) {
    await addAppointment(email, { startsAt: parisIso(pastOpenDay(2 + i * 3), "10:00") });
  }
}

test.describe("côté client : la carte de fidélité", () => {
  test("R-96 : trois passages honorés = 30 points, la carte se remplit et dit combien de passages restent", async ({
    page,
  }) => {
    const client = newClient();
    await signUpClient(page, client);
    await pastVisits(client.email, 3);
    await page.goto("/compte/rendez-vous");
    const card = page.getByRole("region", { name: "Ma carte de fidélité" });
    await expect(card.getByText("30 / 100 points")).toBeVisible();
    await expect(card.getByText("Encore 7 passages avant votre coupe offerte.")).toBeVisible();
    await expect(card.locator('[data-fill="1"]')).toHaveCount(3);
    await expect(card.locator('[data-fill="0"]')).toHaveCount(7);
    await card.getByText("Historique").click();
    await expect(
      card.getByRole("list", { name: "Historique des points" }).getByRole("listitem"),
    ).toHaveCount(3);
  });

  test("à 100 points : « Votre coupe offerte vous attend »", async ({ page }) => {
    const client = newClient();
    await signUpClient(page, client);
    const [row] = await sql`select id from customer where lower(email) = ${client.email.toLowerCase()}`;
    await sql`insert into loyalty_entry (customer_id, kind, points, actor_type, reason)
              values (${row.id}, 'adjust', 100, 'manager', 'Test')`;
    await page.goto("/compte/rendez-vous");
    await expect(page.getByText("Votre coupe offerte vous attend")).toBeVisible();
  });

  test("l'accueil annonce le programme, construit depuis la base ; arrêté, il disparaît", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByTestId("loyalty-pitch")).toHaveText(
      "Carte de fidélité · 10 passages = une coupe offerte",
    );
    await sql`update salon_settings set loyalty_enabled = false`;
    await refreshVitrine();
    await page.goto("/");
    await expect(page.getByTestId("loyalty-pitch")).toHaveCount(0);
  });

  test("les conditions décrivent le programme", async ({ page }) => {
    await page.goto("/conditions");
    await expect(page.getByRole("heading", { name: /Programme de fidélité/ })).toBeVisible();
    await expect(page.getByText("À 100 points, une coupe est offerte")).toBeVisible();
  });
});

test.describe("tablette : la coupe offerte", () => {
  async function openFiche(page: Page, points: number, service = "Coupe homme") {
    const day = pastOpenDay(3);
    const thomas = await addCustomer("Thomas", "Durand");
    if (points > 0) {
      await sql`insert into loyalty_entry (customer_id, kind, points, actor_type, reason)
                values (${thomas.id}, 'adjust', ${points}, 'manager', 'Test')`;
    }
    const id = await addAppointment(thomas.email, { startsAt: parisIso(day, "10:00"), service });
    await loginTablet(page);
    await page.goto(`/equipe?jour=${day}&rdv=${id}`);
    return { id, fiche: page.getByRole("complementary") };
  }

  test("R-98 : à 100 points, « Utiliser la coupe offerte » (confirmation + prénom) met le montant à 0", async ({
    page,
  }) => {
    tabletOnly(page);
    const { id, fiche } = await openFiche(page, 100);
    await expect(fiche.getByText("100 / 100 points")).toBeVisible(); // le passage en cours ne compte pas
    await fiche.getByRole("button", { name: "Utiliser la coupe offerte" }).click();
    await expect(fiche.getByRole("button", { name: "Confirmer" })).toBeDisabled();
    await chooseAuthor(page, "Kaan", "Qui confirme ?");
    await fiche.getByRole("button", { name: "Confirmer" }).click();
    await expect(fiche.getByText("Coupe offerte utilisée")).toBeVisible();
    await expect(fiche.getByText("Rien à encaisser")).toBeVisible();
    await expect(fiche.getByRole("button", { name: /^Encaisser/ })).toHaveCount(0);

    const [appt] = await sql`select adjusted_amount_cents from appointment where id = ${id}`;
    expect(appt.adjusted_amount_cents).toBe(0);
    const [audit] = await sql`select actor_type from audit_log where action = 'loyalty.redeemed'`;
    expect(audit.actor_type).toBe("staff");
  });

  test("R-99 : on peut annuler la coupe offerte, les points et le montant reviennent", async ({ page }) => {
    tabletOnly(page);
    const { id, fiche } = await openFiche(page, 100);
    await fiche.getByRole("button", { name: "Utiliser la coupe offerte" }).click();
    await chooseAuthor(page, "Orhan", "Qui confirme ?");
    await fiche.getByRole("button", { name: "Confirmer" }).click();
    await expect(fiche.getByText("Coupe offerte utilisée")).toBeVisible();
    await fiche.getByRole("button", { name: "Annuler la coupe offerte" }).click();
    await chooseAuthor(page, "Enes", "Qui confirme ?");
    await fiche.getByRole("button", { name: "Annuler la coupe offerte" }).last().click();
    await expect(fiche.getByRole("button", { name: "Utiliser la coupe offerte" })).toBeVisible();
    const [appt] = await sql`select adjusted_amount_cents from appointment where id = ${id}`;
    expect(appt.adjusted_amount_cents).toBeNull();
  });

  test("sous le seuil, aucun bouton ; le solde reste affiché", async ({ page }) => {
    tabletOnly(page);
    const { fiche } = await openFiche(page, 50);
    await expect(fiche.getByText("50 / 100 points")).toBeVisible();
    await expect(fiche.getByRole("button", { name: "Utiliser la coupe offerte" })).toHaveCount(0);
  });

  test("une coupe « tarif formation » n'est pas éligible", async ({ page }) => {
    tabletOnly(page);
    const { fiche } = await openFiche(page, 100, "Coupe, tarif formation");
    await expect(fiche.getByText(/\/ 100 points/)).toBeVisible();
    await expect(fiche.getByRole("button", { name: "Utiliser la coupe offerte" })).toHaveCount(0);
    await expect(fiche.getByText(/aucune coupe ou coupe & barbe/)).toBeVisible();
  });
});

test.describe("espace gérant", () => {
  async function unlock(page: Page) {
    await page.goto("/equipe/gerant");
    await page.getByLabel("Code à 6 chiffres").fill(CODE);
    await page.getByRole("button", { name: "Déverrouiller" }).click();
    await expect(page.getByRole("heading", { name: "Gérer le salon" })).toBeVisible();
  }

  test("la fiche client montre le solde, l'historique, et la correction exige un motif", async ({ page }) => {
    tabletOnly(page);
    await setManagerCode(CODE);
    const thomas = await addCustomer("Thomas", "Durand");
    await addAppointment(thomas.email, { startsAt: parisIso(pastOpenDay(3), "10:00") });
    await loginTablet(page);
    await unlock(page);
    await page.getByLabel("Chercher un client").fill("thomas dur");
    await page.getByRole("link", { name: /Thomas Durand/ }).click();
    await expect(page).toHaveURL(new RegExp(`/equipe/gerant/clients/${thomas.id}`));
    await expect(page.getByLabel("Solde de points")).toHaveText("10 / 100 points");
    const submit = page.getByRole("button", { name: "Enregistrer la correction" });
    await page.getByLabel("Points à ajouter ou retirer").fill("25");
    await expect(submit).toBeDisabled();
    await page.getByLabel("Motif de la correction").fill("Carte papier du salon");
    await submit.click();
    await expect(page.getByLabel("Solde de points")).toHaveText("35 / 100 points");
    await expect(page.getByText("Correction du gérant").first()).toBeVisible();
    // R-100 : jamais sous 0.
    await page.getByLabel("Points à ajouter ou retirer").fill("-500");
    await page.getByLabel("Motif de la correction").fill("Trop");
    await page.getByRole("button", { name: "Enregistrer la correction" }).click();
    await expect(page.getByText("Le solde ne peut pas descendre sous 0 point.")).toBeVisible();
  });

  test("la carte permet d'arrêter le programme", async ({ page }) => {
    tabletOnly(page);
    await setManagerCode(CODE);
    await loginTablet(page);
    await unlock(page);
    await page.getByRole("link", { name: /Carte et tarifs/ }).click();
    const toggle = page.getByRole("switch", { name: "Programme de fidélité" });
    await expect(toggle).toHaveAttribute("aria-checked", "true");
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-checked", "false");
    const [settings] = await sql`select loyalty_enabled from salon_settings`;
    expect(settings.loyalty_enabled).toBe(false);
  });
});
