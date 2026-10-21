import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

// Contrôles manuels sur les services réels (`pnpm smoke:db`) : jamais lancés par `pnpm test` ni l'intégration continue.
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      // « server-only » refuse d'être importé hors de Next : ici, les modules serveur sont appelés directement.
      "server-only": fileURLToPath(new URL("./tests/smoke/empty.ts", import.meta.url)),
    },
  },
  test: {
    name: "smoke",
    include: ["tests/smoke/**/*.test.ts"],
    environment: "node",
    testTimeout: 60_000,
  },
});
