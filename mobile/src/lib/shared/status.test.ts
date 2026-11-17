import { openStatus, zonedNow } from "./status";

const week = { 2: [{ opensAt: "10:00", closesAt: "19:00" }], 3: [{ opensAt: "10:00", closesAt: "19:00" }] };

describe("état du salon (copie du site)", () => {
  it("ouvert un mardi à 15 h, à l'heure de Paris", () => {
    const now = zonedNow(new Date("2026-11-17T14:00:00Z")); // 15 h à Paris
    expect(openStatus(week, [], now).open).toBe(true);
  });
  it("fermé le lundi : annonce la réouverture", () => {
    const now = zonedNow(new Date("2026-11-16T14:00:00Z"));
    const status = openStatus(week, [], now);
    expect(status.open).toBe(false);
    expect(status.headline).toBe("Ouvre demain à 10 h");
  });
});
