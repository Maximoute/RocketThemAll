import type { NextFunction, Request, Response } from "express";

type RateLimitOptions = {
  windowMs: number;
  max: number;
  keyFn?: (req: Request) => string;
  message?: string;
};

type RateEntry = {
  count: number;
  resetAt: number;
};

function makeKey(req: Request) {
  // req.ip honors Express trust proxy settings and avoids trusting spoofed client headers directly.
  return req.ip || "unknown";
}

export function createRateLimit(options: RateLimitOptions) {
  const cache = new Map<string, RateEntry>();

  // Keep cache bounded for long-running processes.
  setInterval(() => {
    const now = Date.now();
    for (const [key, value] of cache.entries()) {
      if (value.resetAt <= now) {
        cache.delete(key);
      }
    }
  }, Math.max(10_000, options.windowMs)).unref();

  return function rateLimit(req: Request, res: Response, next: NextFunction) {
    const now = Date.now();
    const key = options.keyFn ? options.keyFn(req) : makeKey(req);
    const record = cache.get(key);

    if (!record || record.resetAt <= now) {
      cache.set(key, { count: 1, resetAt: now + options.windowMs });
      return next();
    }

    if (record.count >= options.max) {
      const retryAfter = Math.max(1, Math.ceil((record.resetAt - now) / 1000));
      res.setHeader("Retry-After", String(retryAfter));
      return res.status(429).json({ error: options.message ?? "Too many requests" });
    }

    record.count += 1;
    cache.set(key, record);
    return next();
  };
}

export const globalRateLimit = createRateLimit({
  windowMs: 60_000,
  max: 120,
  message: "Too many requests"
});

export const uploadRateLimit = createRateLimit({
  windowMs: 60_000,
  max: 15,
  message: "Too many upload requests"
});

export const importRateLimit = createRateLimit({
  windowMs: 60_000,
  max: 10,
  message: "Too many import requests"
});

export const actionRateLimit = createRateLimit({
  windowMs: 10_000,
  max: 10,
  message: "Action rate limit exceeded"
});
