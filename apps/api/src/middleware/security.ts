import type { NextFunction, Request, Response } from "express";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);
const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

export function resolveFrontendOrigin(
  configuredOrigin: string | undefined,
  nodeEnv = process.env.NODE_ENV
) {
  const raw = configuredOrigin?.trim();
  if (!raw && nodeEnv === "production") {
    throw new Error("FRONTEND_ORIGIN or NEXTAUTH_URL is required in production");
  }

  let parsed: URL;
  try {
    parsed = new URL(raw || "http://localhost:3000");
  } catch {
    throw new Error("FRONTEND_ORIGIN must be an absolute http(s) origin");
  }

  if (
    !["http:", "https:"].includes(parsed.protocol) ||
    parsed.username ||
    parsed.password ||
    (parsed.pathname !== "/" && parsed.pathname !== "") ||
    parsed.search ||
    parsed.hash
  ) {
    throw new Error("FRONTEND_ORIGIN must be an absolute http(s) origin without a path");
  }
  if (
    nodeEnv === "production" &&
    parsed.protocol !== "https:" &&
    !LOOPBACK_HOSTS.has(parsed.hostname)
  ) {
    throw new Error("FRONTEND_ORIGIN must use https in production");
  }

  return parsed.origin;
}

function headerOrigin(value: string | undefined) {
  if (!value) return null;
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

export function securityHeaders(_req: Request, res: Response, next: NextFunction) {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
  res.setHeader("Cross-Origin-Resource-Policy", "same-origin");
  res.setHeader(
    "Content-Security-Policy",
    "default-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'"
  );
  res.removeHeader("X-Powered-By");
  next();
}

export function browserMutationGuard(allowedOrigin: string) {
  return function guard(req: Request, res: Response, next: NextFunction) {
    if (SAFE_METHODS.has(req.method.toUpperCase())) return next();

    const fetchSite = req.header("sec-fetch-site")?.toLowerCase();
    if (fetchSite === "cross-site") {
      return res.status(403).json({ error: "Cross-site request blocked" });
    }

    const originHeader = req.header("origin");
    const refererHeader = req.header("referer");
    const requestOrigin = headerOrigin(originHeader) ?? headerOrigin(refererHeader);
    if ((originHeader || refererHeader) && requestOrigin !== allowedOrigin) {
      return res.status(403).json({ error: "Request origin is not allowed" });
    }

    if (!req.is("application/json") && !req.is("application/*+json")) {
      return res.status(415).json({ error: "Content-Type must be application/json" });
    }

    return next();
  };
}
