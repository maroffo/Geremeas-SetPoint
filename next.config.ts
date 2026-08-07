import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Build autosufficiente per il deploy in container (Cloud Run).
  output: "standalone",
};

export default nextConfig;
