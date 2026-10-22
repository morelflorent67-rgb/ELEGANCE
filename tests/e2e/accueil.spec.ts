import { expect, test, type Page } from "@playwright/test";
import { refreshVitrine, resetData, sql } from "./helpers";

// Lot 12 : la page client unique (D-72, D-94) : l'arrivée, les horaires en direct, l'accès, les liens légaux.

test.beforeEach(async () => {
  await resetData();
});

const noHorizontalScroll = async (page: Page) =>
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    ),
  ).toBe(0);

const hoursHeading = (page: Page) => page.locator("#horaires-titre");

test("l'arrivée : logo, signature, Réserver, Appeler et Mes rendez-vous", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("img", { name: "Elegance Strasbourg" }).first()).toBeVisible();
  await expect(
    page.getByRole("heading", { level: 1, name: /Bien plus.*qu.une coupe/ }),
  ).toBeVisible();
  await expect(page.getByText("Coiffure homme et barbe · Schiltigheim")).toBeVisible();
  await expect(page.locator("#arrivee-reserver")).toHaveAttribute("href", "/reservation");
  await expect(page.getByRole("link", { name: "Appeler", exact: true }).first()).toHaveAttribute(
    "href",
    "tel:+33388977468",
  );
  await expect(page.getByRole("link", { name: "Mes rendez-vous" })).toHaveAttribute(
    "href",
    "/compte/rendez-vous",
  );
  // D-94 : ni menu, ni galerie, ni section équipe.
  await expect(page.getByRole("button", { name: "Menu" })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "L'équipe" })).toHaveCount(0);
  await noHorizontalScroll(page);
});

test("le site de test n'est pas indexable", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
});

test("R-01 : la semaine vient de la base, sept jours, dimanche et lundi fermés", async ({
  page,
}) => {
  await page.goto("/");
  const week = page.getByRole("list", { name: "Horaires de la semaine" });
  await week.scrollIntoViewIfNeeded();
  for (const day of ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi", "Dimanche"]) {
    // Le jour actuel ajoute « (aujourd'hui) » pour les lecteurs d'écran.
    await expect(week.getByRole("listitem").filter({ hasText: day })).toHaveCount(1);
  }
  await expect(week.getByText("Fermé")).toHaveCount(2);
  await expect(week.getByText("10 h – 12 h")).toHaveCount(5);
  await expect(
    page.getByText("Du mardi au samedi : 10 h – 12 h et 13 h – 19 h, sur rendez-vous."),
  ).toBeVisible();
});

test("R-01 : l'état du salon s'écrit en direct, d'après l'heure de Paris", async ({ page }) => {
  // Jeudi 22 octobre 2099, 10 h 40 à Paris (8 h 40 UTC, heure d'été jusqu'au 25 octobre).
  await page.clock.setFixedTime(new Date("2099-10-22T08:40:00Z"));
  await page.goto("/");
  await expect(hoursHeading(page)).toHaveAttribute(
    "aria-label",
    "Ouvert maintenant. Jusqu'à 12 h · reprise à 13 h",
  );
  // Le jour actuel est mis en valeur.
  await expect(page.getByText("(aujourd’hui)")).toHaveCount(1);
  await expect(
    page.getByRole("listitem").filter({ hasText: "Jeudi" }).getByText("(aujourd’hui)"),
  ).toBeAttached();

  // Samedi soir : ouvre mardi.
  await page.clock.setFixedTime(new Date("2099-10-24T18:00:00Z"));
  await page.goto("/");
  await expect(hoursHeading(page)).toHaveAttribute(
    "aria-label",
    "Ouvre mardi à 10 h. Du mardi au samedi",
  );
});

test("R-03 : des horaires modifiés et une fermeture à venir sont annoncés", async ({ page }) => {
  await sql`delete from opening_hours where weekday = 6`;
  await sql`insert into opening_hours (weekday, opens_at, closes_at) values (6, '10:00', '17:00')`;
  await sql`insert into closure (starts_on, ends_on, reason) values ('2099-12-24', '2099-12-26', 'Fêtes')`;
  await refreshVitrine();
  await page.goto("/");
  const week = page.getByRole("list", { name: "Horaires de la semaine" });
  await expect(
    week.getByRole("listitem").filter({ hasText: "Samedi" }).getByText("10 h – 17 h"),
  ).toBeAttached();
  await expect(
    page.getByText(
      "Mardi – vendredi : 10 h – 12 h et 13 h – 19 h ; Samedi : 10 h – 17 h. Sur rendez-vous.",
    ),
  ).toBeAttached();
  await expect(page.getByText("Du 24 au 26 décembre")).toBeAttached();

  // Le jour même de la fermeture, le salon est fermé et le dit.
  await page.clock.setFixedTime(new Date("2099-12-24T09:40:00Z"));
  await page.goto("/");
  await expect(hoursHeading(page)).toHaveAttribute(
    "aria-label",
    "Ouvre mardi à 10 h. Fermeture exceptionnelle aujourd'hui",
  );
});

test("D-98 : l'accès donne l'adresse, l'itinéraire, Waze et les transports, sans carte tierce", async ({
  page,
}) => {
  const external: string[] = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (!["127.0.0.1", "localhost"].includes(url.hostname)) external.push(url.hostname);
  });
  await page.goto("/");
  const access = page.locator('section[aria-labelledby="acces-titre"]');
  await access.scrollIntoViewIfNeeded();
  await expect(access.getByText("162 route de Bischwiller, 67300 Schiltigheim")).toBeVisible();
  await expect(access.getByRole("link", { name: /Itinéraire/ })).toHaveAttribute(
    "href",
    /google\.com\/maps\/dir/,
  );
  await expect(access.getByRole("link", { name: "Waze" })).toHaveAttribute("href", /waze\.com/);
  for (const text of ["Hôtel de ville", "Bus 60 · C3", "Arrêt Mairie", "Piste cyclable"]) {
    await expect(access.getByText(text)).toBeVisible();
  }
  await expect(access.getByRole("link", { name: "© contributeurs OpenStreetMap" })).toBeVisible();
  // Aucune carte ni police chargée ailleurs que sur le site.
  expect(external).toEqual([]);
});

test("D-72 : les pages légales en liens discrets, en bas de page", async ({ page }) => {
  await page.goto("/");
  const footer = page.getByRole("contentinfo");
  for (const [label, href] of [
    ["Mentions légales", "/mentions-legales"],
    ["Confidentialité", "/confidentialite"],
    ["Conditions", "/conditions"],
  ]) {
    await expect(footer.getByRole("link", { name: label })).toHaveAttribute("href", href);
  }
});

test("la barre Réserver + Appeler monte quand le bouton de l'arrivée sort de l'écran", async ({
  page,
}) => {
  await page.goto("/");
  const bar = page.locator("#barre-reserver");
  await expect(bar).toHaveAttribute("data-show", "false");
  await page.getByRole("list", { name: "Horaires de la semaine" }).scrollIntoViewIfNeeded();
  await expect(bar).toHaveAttribute("data-show", "true");
  await expect(bar.getByRole("link", { name: /Réserver/ })).toHaveAttribute("href", "/reservation");
  await expect(bar.getByRole("link", { name: "Appeler le salon" })).toHaveAttribute(
    "href",
    "tel:+33388977468",
  );
  await page.evaluate(() => window.scrollTo(0, 0));
  await expect(bar).toHaveAttribute("data-show", "false");
});

test("l'ouverture ne se rejoue pas dans la même visite", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("html")).not.toHaveClass(/opening-skip/);
  await page.goto("/conditions");
  await page.goto("/");
  // Deuxième passage dans la visite : l'état final est posé avant l'affichage.
  await expect(page.locator("html")).toHaveClass(/opening-skip/);
});

test("premier geste : l'ouverture passe à l'état final", async ({ page }) => {
  await page.goto("/");
  // Le premier geste n'est écouté qu'une fois la page hydratée : on réessaie jusqu'à ce qu'il compte.
  await expect(async () => {
    await page.keyboard.press("Tab");
    await expect(page.locator("html")).toHaveClass(/opening-skip/, { timeout: 500 });
  }).toPass({ timeout: 8000 });
});

test("prefers-reduced-motion : tout est visible tout de suite", async ({ browser }) => {
  const context = await browser.newContext({ reducedMotion: "reduce" });
  const page = await context.newPage();
  await page.goto("http://127.0.0.1:3100/");
  const reserve = page.locator("#arrivee-reserver");
  await expect(reserve).toBeVisible();
  // L'animation est ramenée à 1 ms : la fin (opacité 1) est atteinte presque aussitôt.
  await expect
    .poll(() => reserve.evaluate((el) => getComputedStyle(el).opacity), { timeout: 1000 })
    .toBe("1");
  await context.close();
});

test("D-72 : sur ordinateur, la même page dans une colonne de téléphone, le fond vit autour", async ({
  browser,
}) => {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  await page.goto("http://127.0.0.1:3100/");
  const column = await page.locator("#arrivee-reserver").evaluate((el) => {
    const col = el.closest(".max-w-\\[430px\\]") as HTMLElement;
    return col.getBoundingClientRect().toJSON();
  });
  expect(column.width).toBe(430);
  expect(Math.round(column.x)).toBe(Math.round((1440 - 430) / 2));
  await expect(page.locator(".bg-live")).toBeVisible();
  await noHorizontalScroll(page);
  await context.close();
});

test("D-94 : les anciennes pages Prestations et Le salon mènent à l'accueil", async ({ page }) => {
  for (const path of ["/prestations", "/salon"]) {
    await page.goto(path);
    await expect(page).toHaveURL(/127\.0\.0\.1:3100\/$/);
  }
});
