import { describe, expect, it } from "vitest";
import { duration } from "./motion";

describe("motion", () => {
  it("garde les outils de la réservation sous le plafond de 280 ms", () => {
    expect(duration.base).toBeLessThanOrEqual(280);
  });
});
