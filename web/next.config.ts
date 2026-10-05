import type { NextConfig } from "next";

const apiProxyTarget = process.env.API_PROXY_TARGET;

const nextConfig: NextConfig = {
  // Testing from a phone on the same Wi-Fi: `npm run dev:lan` with DEV_LAN_HOST
  // set to this PC's LAN address (see README). Dev-only; ignored by builds.
  allowedDevOrigins: process.env.DEV_LAN_HOST ? [process.env.DEV_LAN_HOST] : [],

  // Optional same-origin mode: with API_PROXY_TARGET set, the browser calls
  // /api/* on this server and Next forwards it to the backend. One host and
  // port for the browser: no CORS, and the refresh cookie stays first-party.
  // Used for phone access over Wi-Fi and by scripts/start-local.ps1.
  // NEXT_PUBLIC_API_URL is forced to "" here because an empty env var can't be
  // relied on: PowerShell deletes a variable set to "", and some hosts refuse it.
  ...(apiProxyTarget ? { env: { NEXT_PUBLIC_API_URL: "" } } : {}),
  async rewrites() {
    return apiProxyTarget ? [{ source: "/api/:path*", destination: `${apiProxyTarget}/api/:path*` }] : [];
  },
};

export default nextConfig;
