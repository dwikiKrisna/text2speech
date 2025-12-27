import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Use webpack for better compatibility
  serverExternalPackages: ['msedge-tts'],
};

export default nextConfig;
