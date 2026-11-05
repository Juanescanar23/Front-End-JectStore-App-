import { configHeader } from '@/utils/constants';
import type { NextConfig } from "next";
import { randomUUID } from "node:crypto";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  crossOrigin: "anonymous",
  // Separate retained pre-CORS CDN entries from this public asset policy.
  deploymentId: "jectstore-cors-v1-20261028",
  // Each immutable build must keep its own manifest when old assets are retained.
  generateBuildId: async () => {
    for (let attempt = 0; attempt < 16; attempt++) {
      const id = randomUUID();
      if (!/ad/i.test(id)) return id;
    }
    throw new Error("Could not generate an unambiguous release ID.");
  },
  typescript: {
    ignoreBuildErrors: false,
  },
  images: {
    unoptimized: true,
    remotePatterns: [
      {
        protocol: "https",
        hostname: "app.jectstore.com",
        pathname: "/**",
      },
      {
        protocol: "https",
        hostname: "**.jectstore.com",
        pathname: "/**",
      },
    ],
  },
  async headers() {
    return configHeader;
  },
  compress: true, 
  experimental: {
    optimizePackageImports: ["lodash", "date-fns"],
    serverActions: {
      bodySizeLimit: "2mb",
    },
  },
};

export default nextConfig;
