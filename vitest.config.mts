// ABOUTME: Config di vitest: risolve l'alias "@/" come fa Next, così i test possono
// ABOUTME: importare anche i moduli sotto src/app (server action comprese).

import { fileURLToPath } from "node:url";
import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    // Gli spec in e2e/ girano con Playwright (`make test-e2e-full`): senza
    // questa esclusione vitest li raccoglie per il suffisso .spec.ts.
    exclude: [...configDefaults.exclude, "e2e/**"],
  },
});
