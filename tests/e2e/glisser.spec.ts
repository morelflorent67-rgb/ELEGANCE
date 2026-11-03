import { expect, test, type Locator, type Page } from "@playwright/test";
import {
  addAppointment,
  addCustomer,
  chooseAuthor,
  loginTablet,
  openDay,
  parisIso,
  pastOpenDay,
  resetData,
  sql,
} from "./helpers";

// R-95 : glisser-déposer d'un RDV dans le planning (D-110). Le planning se déplace par appui long au toucher et par
// glissement à la souris ; le dépôt ouvre une confirmation, rien ne bouge avant. Parcours de la tablette en paysage.

test.beforeEach(async ({ page }) => {
  test.skip((page.viewportSize()?.width ?? 0) < 768, "parcours de la tablette");
  await resetData();
});

const PX_PER_MINUTE = 1.6;
const block = (page: Page, time: string, staff: string) =>
  page.getByRole("button", { name: new RegExp(`^${time}, .*avec ${staff}`) });
const column = (page: Page, staff: string) =>
  page.getByRole("group", { name: `Rendez-vous de ${staff}` });
const ghost = (page: Page) => page.locator("[data-drop-ghost]");

async function box(locator: Locator) {
  const b = await locator.boundingBox();
  if (!b) throw new Error("élément invisible");
  return b;
}

/** Glisse à la souris d'un bloc jusqu'à l'heure et la colonne voulues ; relâche seulement si `drop`. */
async function mouseDrag(
  page: Page,
  from: Locator,
  to: { staff: string; minutesLater: number },
  drop = true,
) {
  const start = await box(from);
  const col = await box(column(page, to.staff));
  const x = start.x + start.width / 2;
  const y = start.y + 10;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + 6, y + 6, { steps: 2 });
  await page.mouse.move(col.x + col.width / 2, y + to.minutesLater * PX_PER_MINUTE, { steps: 12 });
  if (drop) await page.mouse.up();
}

async function setup(page: Page, extra?: (email: string) => Promise<void>) {
  const day = openDay(5);
  const thomas = await addCustomer("Thomas", "Durand");
  const id = await addAppointment(thomas.email, {
    startsAt: parisIso(day, "10:00"),
    staff: "Orhan",
    service: "Coupe homme", // 30 min
  });
  await extra?.(thomas.email);
  await loginTablet(page);
  await page.goto(`/equipe?jour=${day}`);
  await expect(block(page, "10:00", "Orhan")).toBeVisible();
  return { day, id };
}

const startOf = async (id: string) =>
  (await sql`select staff_id, starts_at from appointment where id = ${id}`)[0];

test.describe("R-95 : glisser un RDV à la souris", () => {
  test("le bloc suit le pointeur, s'aligne sur la grille, et le dépôt demande confirmation avant de déplacer", async ({
    page,
  }) => {
    const { day, id } = await setup(page);
    await mouseDrag(page, block(page, "10:00", "Orhan"), { staff: "Enes", minutesLater: 4 * 60 + 7 }, false);
    // 10:00 + 4 h 07 : aligné sur la demie la plus proche, 14:00.
    await expect(ghost(page)).toContainText("14:00 – 14:30");
    await expect(ghost(page)).not.toHaveAttribute("data-problem", /.+/);
    await page.mouse.up();

    const dialog = page.getByRole("dialog", { name: "Confirmer le déplacement" });
    await expect(dialog).toContainText("Déplacer le rendez-vous de Thomas");
    await expect(dialog).toContainText("avec Enes");
    // Rien n'a bougé avant la confirmation.
    expect((await startOf(id)).starts_at.toISOString()).toBe(
      new Date(parisIso(day, "10:00")).toISOString(),
    );

    await expect(dialog.getByRole("button", { name: "Déplacer", exact: true })).toBeDisabled(); // R-74
    await chooseAuthor(page, "Kaan", "Qui déplace ?");
    await dialog.getByRole("button", { name: "Déplacer", exact: true }).click();
    await expect(
      page.getByRole("status").filter({ hasText: "Rendez-vous de Thomas déplacé à 14:00 avec Enes" }),
    ).toBeVisible();

    const moved = await startOf(id);
    expect(moved.starts_at.toISOString()).toBe(new Date(parisIso(day, "14:00")).toISOString());
    const [enes] = await sql`select id from staff where first_name = 'Enes'`;
    expect(moved.staff_id).toBe(enes.id);
    const [entry] = await sql`select actor_type from audit_log where action = 'appointment.rescheduled'`;
    expect(entry.actor_type).toBe("staff");
    // Le client est prévenu (email de modification en file).
    expect(await sql`select 1 from email_outbox where type = 'modification'`).toHaveLength(1);
    // Le planning montre le RDV à sa nouvelle place.
    await expect(block(page, "14:00", "Enes")).toBeVisible();
    await expect(block(page, "10:00", "Orhan")).toHaveCount(0);
  });

  test("« Annuler » dans la confirmation ne déplace rien", async ({ page }) => {
    const { day, id } = await setup(page);
    await mouseDrag(page, block(page, "10:00", "Orhan"), { staff: "Taha", minutesLater: 180 });
    const dialog = page.getByRole("dialog", { name: "Confirmer le déplacement" });
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: "Annuler", exact: true }).click();
    await expect(dialog).toHaveCount(0);
    expect((await startOf(id)).starts_at.toISOString()).toBe(new Date(parisIso(day, "10:00")).toISOString());
    expect(await sql`select 1 from email_outbox where type = 'modification'`).toHaveLength(0);
  });

  test("un endroit déjà pris est signalé et le dépôt ne fait rien", async ({ page }) => {
    const { id } = await setup(page, async (email) => {
      await addAppointment(email, {
        startsAt: parisIso(openDay(5), "14:00"),
        staff: "Enes",
        service: "Coupe homme",
      });
    });
    await mouseDrag(page, block(page, "10:00", "Orhan"), { staff: "Enes", minutesLater: 4 * 60 }, false);
    await expect(ghost(page)).toHaveAttribute("data-problem", "occupied");
    await expect(ghost(page)).toContainText("Déjà pris");
    await page.mouse.up();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    const [orhan] = await sql`select id from staff where first_name = 'Orhan'`;
    expect((await startOf(id)).staff_id).toBe(orhan.id);
  });

  test("une absence et la pause sont signalées", async ({ page }) => {
    await setup(page, async () => {
      const [enes] = await sql`select id from staff where first_name = 'Enes'`;
      await sql`insert into absence (staff_id, starts_at, ends_at, reason)
                values (${enes.id}, ${parisIso(openDay(5), "15:00")}, ${parisIso(openDay(5), "17:00")}, 'rdv médecin')`;
    });
    await mouseDrag(page, block(page, "10:00", "Orhan"), { staff: "Enes", minutesLater: 5 * 60 }, false);
    await expect(ghost(page)).toHaveAttribute("data-problem", "absent");
    await mouseDrag(page, block(page, "10:00", "Orhan"), { staff: "Enes", minutesLater: 2 * 60 }, false);
    await expect(ghost(page)).toHaveAttribute("data-problem", "closed"); // 12:00, pendant la pause
    await page.mouse.up();
    await expect(page.getByRole("dialog")).toHaveCount(0);
  });

  test("déposer à la même place ne demande rien, et un simple clic ouvre toujours la fiche", async ({ page }) => {
    await setup(page);
    await mouseDrag(page, block(page, "10:00", "Orhan"), { staff: "Orhan", minutesLater: 5 });
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page.getByRole("complementary").getByText("Thomas Durand")).toHaveCount(0);
    await page.waitForTimeout(500);
    await block(page, "10:00", "Orhan").click();
    await expect(page.getByRole("complementary").getByText("Thomas Durand")).toBeVisible();
  });

  test("un RDV terminé ne se glisse pas", async ({ page }) => {
    const day = pastOpenDay(3);
    const thomas = await addCustomer("Thomas", "Durand");
    await addAppointment(thomas.email, { startsAt: parisIso(day, "10:00") });
    await loginTablet(page);
    await page.goto(`/equipe?jour=${day}`);
    await mouseDrag(page, block(page, "10:00", "Orhan"), { staff: "Enes", minutesLater: 120 }, false);
    await expect(ghost(page)).toHaveCount(0);
    await page.mouse.up();
    await expect(page.getByRole("dialog")).toHaveCount(0);
  });
});

test.describe("R-95 : glisser au toucher (appui long)", () => {
  /** Joue un geste tactile avec des événements de pointeur (Safari et Chrome les traitent pareil). */
  async function touch(
    page: Page,
    from: Locator,
    steps: { dx: number; dy: number; wait?: number }[],
    holdMs: number,
  ) {
    const start = await box(from);
    await from.evaluate(
      async (el, args) => {
        const { x, y, steps: moves, holdMs: hold } = args;
        const fire = (target: EventTarget, type: string, px: number, py: number) =>
          target.dispatchEvent(
            new PointerEvent(type, {
              pointerId: 7,
              pointerType: "touch",
              isPrimary: true,
              bubbles: true,
              cancelable: true,
              clientX: px,
              clientY: py,
              button: 0,
              buttons: type === "pointerup" ? 0 : 1,
            }),
          );
        let cx = x;
        let cy = y;
        fire(el, "pointerdown", cx, cy);
        await new Promise((r) => setTimeout(r, hold));
        for (const m of moves) {
          cx += m.dx;
          cy += m.dy;
          fire(window, "pointermove", cx, cy);
          await new Promise((r) => setTimeout(r, m.wait ?? 30));
        }
        fire(window, "pointerup", cx, cy);
      },
      { x: start.x + start.width / 2, y: start.y + 10, steps, holdMs },
    );
  }

  test("un appui long puis un glissement déplace le bloc, la confirmation suit", async ({ page }) => {
    const { id } = await setup(page);
    const orhan = await box(column(page, "Orhan"));
    const enes = await box(column(page, "Enes"));
    const dx = enes.x - orhan.x;
    await touch(
      page,
      block(page, "10:00", "Orhan"),
      [
        { dx: 0, dy: 0, wait: 10 },
        { dx: dx / 2, dy: 100, wait: 30 },
        { dx: dx / 2, dy: 3 * 60 * PX_PER_MINUTE - 100, wait: 30 },
      ],
      350,
    );
    const dialog = page.getByRole("dialog", { name: "Confirmer le déplacement" });
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText("13:00");
    await chooseAuthor(page, "Orhan", "Qui déplace ?");
    await dialog.getByRole("button", { name: "Déplacer", exact: true }).click();
    await expect(page.getByRole("status").filter({ hasText: "déplacé à 13:00 avec Enes" })).toBeVisible();
    const [enesRow] = await sql`select id from staff where first_name = 'Enes'`;
    expect((await startOf(id)).staff_id).toBe(enesRow.id);
  });

  test("un doigt qui bouge avant la fin de l'appui long fait défiler : aucun glissement", async ({ page }) => {
    const { id, day } = await setup(page);
    await touch(
      page,
      block(page, "10:00", "Orhan"),
      [{ dx: 0, dy: 40, wait: 400 }, { dx: 0, dy: 200 }],
      0,
    );
    await expect(ghost(page)).toHaveCount(0);
    await expect(page.getByRole("dialog")).toHaveCount(0);
    expect((await startOf(id)).starts_at.toISOString()).toBe(new Date(parisIso(day, "10:00")).toISOString());
  });
});
