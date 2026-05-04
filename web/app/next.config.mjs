const nextConfig = {
  distDir: process.env.NODE_ENV === "development" ? ".next-dev" : ".next",
  poweredByHeader: false,
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
      }
    ],
    dangerouslyAllowSVG: false,
    contentDispositionType: "attachment"
  },
  experimental: {
    typedRoutes: false
  }
};

export default nextConfig;
