import { PHONE_FIELD } from "./phone-field";

// Les textes sont comparés à ceux du site par `src/modules/mobile/app-sync.test.ts` (côté site).
describe("champ Téléphone (D-126)", () => {
  it("est annoncé facultatif, avec une aide qui dit à quoi sert le numéro", () => {
    expect(PHONE_FIELD).toEqual({
      label: "Téléphone",
      aside: "facultatif",
      hint: "Pour que le salon puisse vous prévenir en cas d'imprévu.",
    });
  });
});
