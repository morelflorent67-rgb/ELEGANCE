import { defineConfig, devices } from "@playwright/test";

const port = 3100;

export default defineConfig({
  testDir: "./tests/e2e",
  // Les parcours partagent une base de test et un serveur : un test à la fois.
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: { baseURL: `http://127.0.0.1:${port}`, trace: "retain-on-failure" },
  // Deux formats suivis par le projet : mobile pour les clients, tablette paysage pour le salon.
  projects: [
    { name: "mobile", use: { ...devices["Pixel 7"], viewport: { width: 390, height: 844 } } },
    {
      name: "tablette",
      use: { ...devices["iPad Pro 11"], viewport: { width: 1194, height: 834 } },
    },
  ],
  // Base temporaire + authentification en mémoire + site de production : voir scripts/e2e-server.mjs.
  webServer: {
    command: "node scripts/e2e-server.mjs",
    url: `http://127.0.0.1:${port}`,
    reuseExistingServer: !process.env.CI,
    timeout: 400_000,
  },
});
