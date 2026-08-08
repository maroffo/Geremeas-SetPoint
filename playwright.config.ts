// ABOUTME: Config Playwright del full-flow: un solo worker (SQLite ha un solo writer)
// ABOUTME: e webServer standalone su porta dedicata con database temporaneo e PIN noti.

import { defineConfig, devices } from "@playwright/test";
import { ADMIN_PIN, BASE_URL, E2E_PORT, SCOREKEEPER_PIN } from "./e2e/env";

export default defineConfig({
  testDir: "./e2e",
  // Lo spec percorre un solo torneo dall'iscrizione al podio: parallelismo e
  // retry ripartirebbero da un database già sporco, non da uno stato pulito.
  workers: 1,
  fullyParallel: false,
  retries: 0,
  timeout: 180_000,
  reporter: [["list"]],
  use: {
    baseURL: BASE_URL,
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "bash scripts/e2e-full-server.sh",
    url: BASE_URL,
    // Il server sotto test è la standalone appena buildata: mai riusare un
    // processo già in ascolto, avrebbe il database di un'altra run.
    reuseExistingServer: false,
    timeout: 240_000,
    stdout: "ignore",
    stderr: "pipe",
    env: {
      E2E_FULL_PORT: String(E2E_PORT),
      E2E_ADMIN_PIN: ADMIN_PIN,
      E2E_SCOREKEEPER_PIN: SCOREKEEPER_PIN,
    },
  },
});
