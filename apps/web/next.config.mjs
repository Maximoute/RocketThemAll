import path from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const configuredImageOrigin = (() => {
  try {
    return new URL(process.env.RTA_PUBLIC_BASE_URL ?? "http://localhost:3000");
  } catch {
    throw new Error("RTA_PUBLIC_BASE_URL must be an absolute http(s) URL");
  }
})();

if (!["http:", "https:"].includes(configuredImageOrigin.protocol)) {
  throw new Error("RTA_PUBLIC_BASE_URL must use http or https");
}

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
    // Keep remote sources explicit to limit image optimizer abuse surface.
    remotePatterns: [
      {
        protocol: "http",
        hostname: "localhost",
        port: "9000",
        pathname: "/card-images/**"
      },
      {
        protocol: "http",
        hostname: "minio",
        port: "9000",
        pathname: "/card-images/**"
      },
      {
        protocol: configuredImageOrigin.protocol.slice(0, -1),
        hostname: configuredImageOrigin.hostname,
        port: configuredImageOrigin.port,
        pathname: "/media/**"
      }
    ],
    dangerouslyAllowSVG: false,
    contentDispositionType: "attachment"
  }
};

export default nextConfig;
