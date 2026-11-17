import { formatDuration, formatPrice } from "./money";

describe("prix et durées", () => {
  it("prix entiers sans décimales, sinon deux décimales", () => {
    expect(formatPrice(2800)).toBe("28 €");
    expect(formatPrice(1250)).toBe("12,50 €");
    expect(formatPrice(0)).toBe("0 €");
  });
  it("durées", () => {
    expect(formatDuration(30)).toBe("30 min");
    expect(formatDuration(75)).toBe("1 h 15");
    expect(formatDuration(120)).toBe("2 h");
  });
});
