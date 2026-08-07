import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Build autosufficiente per il deploy in container (Cloud Run).
  output: "standalone",
  experimental: {
    serverActions: {
      // Sopra il cap applicativo della locandina (2MB), che resta il vero
      // limite: senza questo, Next taglia i body a 1MB con un errore opaco.
      bodySizeLimit: "3mb",
    },
  },
};

export default nextConfig;
