import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  /* config options here */
  reactCompiler: true,
  serverExternalPackages: ['puppeteer', 'gologin'],
  // Use webpack instead of Turbopack for better compatibility
  // Turbopack has issues with Google Fonts and some packages
  webpack: (config, { isServer }) => {
    if (isServer) {
      // Ignore vertx module (used by 'when' package in gologin)
      // This is a vert.x runtime module that doesn't exist in Node.js
      config.resolve = config.resolve || {};
      config.resolve.fallback = {
        ...config.resolve.fallback,
        vertx: false,
      };
    }
    return config;
  },
};

export default nextConfig;
