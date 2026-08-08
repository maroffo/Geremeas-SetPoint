// ABOUTME: Config di vitest: risolve l'alias "@/" come fa Next, così i test possono
// ABOUTME: importare anche i moduli sotto src/app (server action comprese).

import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
});
