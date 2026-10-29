import { configHeader } from '@/utils/constants';
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  crossOrigin: "anonymous",
  // Separate retained pre-CORS CDN entries from this public asset policy.
  deploymentId: "jectstore-cors-v1-20261028",
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
