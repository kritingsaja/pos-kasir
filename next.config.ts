import type { NextConfig } from "next";
import withPWAInit from "@ducanh2912/next-pwa";

const withPWA = withPWAInit({
  dest: "public",
  cacheOnFrontEndNav: true,
  aggressiveFrontEndNavCaching: true,
  reloadOnOnline: true,
  extendDefaultRuntimeCaching: true,
  disable: process.env.NODE_ENV === "development",
  workboxOptions: {
    disableDevLogs: true,
    runtimeCaching: [{
      urlPattern: /\/api\/(admin|v1)\//,
      handler: 'NetworkOnly',
      method: 'GET',
    }],
  },
});

const nextConfig: NextConfig = {
  // Add any specific config here
};

export default withPWA(nextConfig);
