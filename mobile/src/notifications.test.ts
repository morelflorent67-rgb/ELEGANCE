import { routeFor } from "@/notifications";

describe("routeFor : l'écran qu'ouvre une notification", () => {
  const id = "123e4567-e89b-42d3-a456-426614174000";

  it("ouvre l'offre d'une place libérée", () => {
    expect(routeFor({ kind: "offer", offerId: id })).toBe(`/attente/${id}`);
  });

  it("ouvre Mes rendez-vous pour un rendez-vous", () => {
    expect(routeFor({ kind: "appointment", appointmentId: id })).toBe("/rendez-vous");
  });

  it("ignore ce qu'il ne comprend pas, y compris un identifiant qui ressemble à un chemin", () => {
    expect(routeFor(undefined)).toBeNull();
    expect(routeFor({ kind: "autre" })).toBeNull();
    expect(routeFor({ kind: "offer", offerId: "../compte" })).toBeNull();
  });
});
