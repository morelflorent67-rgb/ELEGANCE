import { expect, test } from "@playwright/test";

test("la page d'accueil s'affiche avec le logo et le bouton d'appel", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("img", { name: "Elegance" })).toBeVisible();
  await expect(page.getByRole("heading", { name: /Bien plus qu.une coupe/ })).toBeVisible();
  await expect(page.getByRole("link", { name: "Appeler le salon" })).toHaveAttribute(
    "href",
    "tel:+33388977468",
  );
});

test("aucun défilement horizontal", async ({ page }) => {
  await page.goto("/");
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBe(0);
});

test("le site de test n'est pas indexable", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
});
