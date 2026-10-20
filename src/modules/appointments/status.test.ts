import { describe, expect, it } from "vitest";
import { isHonored, planningStatus, type StoredStatus } from "./status";

const at = (time: string) => new Date(`2026-11-03T${time}:00Z`);
const rdv = (status: StoredStatus) => ({ status, startsAt: at("09:00"), endsAt: at("09:30") });

describe("R-51 : un RDV passé est honoré par défaut", () => {
  it("un RDV confirmé n'est pas honoré avant la fin, puis l'est sans rien enregistrer", () => {
    expect(planningStatus(rdv("confirmed"), at("08:59"))).toBe("upcoming");
    expect(planningStatus(rdv("confirmed"), at("09:00"))).toBe("in_progress");
    expect(planningStatus(rdv("confirmed"), at("09:29"))).toBe("in_progress");
    expect(planningStatus(rdv("confirmed"), at("09:30"))).toBe("honored");
    expect(planningStatus(rdv("confirmed"), at("18:00"))).toBe("honored");
  });

  it("le lapin reste un lapin, avant comme après la fin", () => {
    expect(planningStatus(rdv("no_show"), at("09:10"))).toBe("no_show");
    expect(planningStatus(rdv("no_show"), at("18:00"))).toBe("no_show");
  });

  it("un RDV annulé reste annulé, quel que soit le moment", () => {
    expect(planningStatus(rdv("cancelled_by_customer"), at("18:00"))).toBe("cancelled");
    expect(planningStatus(rdv("cancelled_by_salon"), at("08:00"))).toBe("cancelled");
  });

  it("un RDV déjà enregistré comme honoré le reste", () => {
    expect(planningStatus(rdv("honored"), at("08:00"))).toBe("honored");
  });
});

describe("R-53 : seuls les RDV honorés comptent au chiffre d'affaires", () => {
  it("compte un RDV passé non signalé, pas un lapin, un RDV annulé ou un RDV à venir", () => {
    const now = at("12:00");
    expect(isHonored(rdv("confirmed"), now)).toBe(true);
    expect(isHonored(rdv("no_show"), now)).toBe(false);
    expect(isHonored(rdv("cancelled_by_salon"), now)).toBe(false);
    expect(isHonored(rdv("confirmed"), at("08:00"))).toBe(false);
  });
});
