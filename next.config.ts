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
      urlPattern: /\/api\/cek-mutasi-bca(?:\?.*)?$/,
      handler: 'NetworkOnly',
      method: 'GET',
    }, {
      urlPattern: /\/api\/cek-mutasi-bca(?:\?.*)?$/,
      handler: 'NetworkOnly',
      method: 'POST',
    }, {
      urlPattern: /\/api\/(admin|v1)\//,
      handler: 'NetworkOnly',
      method: 'GET',
    }],
  },
});

const nextConfig: NextConfig = {
  serverExternalPackages: ['puppeteer-core', '@sparticuz/chromium'],
  outputFileTracingIncludes: {
    '/api/cek-mutasi-bca': ['./node_modules/@sparticuz/chromium/bin/**/*'],
  },
};

export default withPWA(nextConfig);
