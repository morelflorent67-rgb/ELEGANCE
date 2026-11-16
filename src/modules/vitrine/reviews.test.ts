import { describe, expect, it } from "vitest";
import { reviewHeadline } from "./reviews";

describe("D-112 : bandeau d'avis", () => {
  it("arrondit à la centaine inférieure", () => {
    expect(reviewHeadline(1043)).toBe("Plus de 1 000 avis");
    expect(reviewHeadline(1000)).toBe("Plus de 1 000 avis");
    expect(reviewHeadline(1999)).toBe("Plus de 1 900 avis");
    expect(reviewHeadline(1250)).toBe("Plus de 1 200 avis");
    expect(reviewHeadline(350)).toBe("Plus de 300 avis");
  });

  it("est masqué sans réglage ou sous 100 avis", () => {
    expect(reviewHeadline(null)).toBeNull();
    expect(reviewHeadline(undefined)).toBeNull();
    expect(reviewHeadline(0)).toBeNull();
    expect(reviewHeadline(99)).toBeNull();
  });
});
