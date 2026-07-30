import path from "node:path";

import type { NextConfig } from "next";

const privateRouteHeaders = [
  { key: "Cache-Control", value: "private, no-store" },
  { key: "X-Robots-Tag", value: "noindex, nofollow, noarchive" },
];

const publicRouteHeaders = [
  { key: "Cache-Control", value: "public, max-age=0, must-revalidate" },
  { key: "X-SkillUp-Cacheable", value: "public" },
];

const nextConfig: NextConfig = {
  compress: true,
  output: "standalone",
  outputFileTracingRoot: path.join(process.cwd(), "../.."),
  poweredByHeader: false,
  reactStrictMode: true,
  transpilePackages: ["@skillup/discoverability", "@skillup/ui"],
  typedRoutes: true,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
      {
        source: "/en",
        headers: publicRouteHeaders,
      },
      {
        source: "/en/(skills|categories|paths)/:path*",
        headers: publicRouteHeaders,
      },
      {
        source: "/offline",
        headers: publicRouteHeaders,
      },
      {
        source: "/:locale(en|ur)/(sign-in|onboarding|progress)",
        headers: privateRouteHeaders,
      },
      {
        source: "/:locale(en|ur)/learn/:path*",
        headers: privateRouteHeaders,
      },
    ];
  },
};

export default nextConfig;
