import { routeAfterSlot, stepsFor } from "./flow";

const ok = { blocked: false, upcoming: 1, maxUpcoming: 5 };

describe("enchaînement de la réservation (comme le site)", () => {
  it("cinq étapes, trois quand on déplace un rendez-vous", () => {
    expect(stepsFor(false)).toEqual([1, 2, 3, 4, 5]);
    expect(stepsFor(true)).toEqual([2, 3, 5]);
  });

  it("après le créneau : le compte si on n'est pas connecté, sinon le récapitulatif", () => {
    expect(routeAfterSlot({ moving: false, signedIn: false, booking: null })).toBe("/reserver/compte");
    expect(routeAfterSlot({ moving: false, signedIn: true, booking: ok })).toBe("/reserver/recap");
  });

  it("un client bloqué (R-52) ou au maximum de RDV (R-25) le sait tout de suite", () => {
    expect(routeAfterSlot({ moving: false, signedIn: true, booking: { ...ok, blocked: true } })).toBe("/reserver/bloque");
    expect(routeAfterSlot({ moving: false, signedIn: true, booking: { ...ok, upcoming: 5 } })).toBe("/reserver/limite");
  });

  it("déplacer un rendez-vous va droit au récapitulatif, même au maximum", () => {
    expect(routeAfterSlot({ moving: true, signedIn: true, booking: { ...ok, upcoming: 5 } })).toBe("/reserver/recap");
  });
});
