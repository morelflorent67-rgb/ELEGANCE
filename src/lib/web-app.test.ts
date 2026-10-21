import { describe, expect, it } from "vitest";
import { MANIFEST_ICON_SIZES, clientManifest, tabletManifest } from "./web-app";

describe("D-69 : application installable", () => {
  it("le site des clients s'ouvre sur l'accueil, en plein écran, sur fond noir", () => {
    expect(clientManifest()).toMatchObject({
      short_name: "Elegance",
      start_url: "/",
      scope: "/",
      display: "standalone",
      background_color: "#0b0a09",
    });
  });

  it("la tablette s'ouvre sur le planning et reste dans /equipe", () => {
    expect(tabletManifest()).toMatchObject({
      short_name: "Elegance",
      start_url: "/equipe",
      scope: "/equipe",
      display: "standalone",
    });
  });

  it("les deux portent l'icône E en 192 et 512 px", () => {
    for (const manifest of [clientManifest(), tabletManifest()]) {
      expect(manifest.icons?.map((icon) => icon.src)).toEqual(
        MANIFEST_ICON_SIZES.map((size) => `/icon/${size}`),
      );
    }
  });
});
