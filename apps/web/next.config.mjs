import path from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const isDevelopment = process.env.NODE_ENV !== "production";
const contentSecurityPolicy = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "form-action 'self'",
  `script-src 'self' 'unsafe-inline'${isDevelopment ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "font-src 'self' data:",
  `img-src 'self' data: blob: https://cdn.discordapp.com https://media.discordapp.net${isDevelopment ? " http://localhost:* http://127.0.0.1:*" : ""}`,
  `connect-src 'self'${isDevelopment ? " ws: wss:" : ""}`,
  "media-src 'self'",
  "worker-src 'self' blob:"
].join("; ");

const browserSecurityHeaders = [
  { key: "Content-Security-Policy", value: contentSecurityPolicy },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
  { key: "Origin-Agent-Cluster", value: "?1" }
];

const nextConfig = {
  // Next's standalone tracer creates symlinks. Windows workspaces hosted by
  // OneDrive can reject those links with EPERM even after compilation. Docker
  // builds run on Linux and keep the production standalone artifact.
  ...(process.platform === "win32" && process.env.RTA_FORCE_STANDALONE !== "true"
    ? {}
    : { output: "standalone" }),
  distDir: process.env.NODE_ENV === "development" ? ".next-dev" : ".next",
  poweredByHeader: false,
  outputFileTracingRoot: repositoryRoot,
  typedRoutes: false,
  serverExternalPackages: ["@prisma/client", ".prisma/client"],
  transpilePackages: ["@rta/auth", "@rta/database", "@rta/services", "@rta/shared"],
  async headers() {
    return [{ source: "/:path*", headers: browserSecurityHeaders }];
  },
  webpack(config) {
    config.resolve.extensionAlias = {
      ...(config.resolve.extensionAlias ?? {}),
      ".js": [".ts", ".tsx", ".js"],
      ".mjs": [".mts", ".mjs"],
      ".cjs": [".cts", ".cjs"]
    };
    return config;
  },
  images: {
    // Game media is rendered with plain <img> elements from our public media
    // origin. Keeping the Next.js optimizer local-only prevents its endpoint
    // from ever becoming a server-side URL fetcher (SSRF).
    remotePatterns: [],
    dangerouslyAllowSVG: false,
    contentDispositionType: "attachment"
  }
};

export default nextConfig;
