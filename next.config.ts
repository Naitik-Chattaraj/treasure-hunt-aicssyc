import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  env: {
    NEXT_USE_MOCK: process.env.NEXT_USE_MOCK,
  },
};

export default nextConfig;
