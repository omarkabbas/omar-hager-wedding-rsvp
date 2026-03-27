import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      bodySizeLimit: '10mb', // This allows up to 10MB to pass through Next.js
    },
  },
  // If you have other options like images or redirects, they go here
};

export default nextConfig;