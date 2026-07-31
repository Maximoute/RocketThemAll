import type { NextFunction, Request, Response } from "express";

type RateLimitOptions = {
  windowMs: number;
  max: number;
  maxKeys?: number;
  keyFn?: (req: Request) => string;
  message?: string;
};

type RateEntry = {
  count: number;
  resetAt: number;
};

function makeKey(req: Request) {
  return req.ip || req.socket.remoteAddress || "unknown";
}

export function createRateLimit(options: RateLimitOptions) {
  const cache = new Map<string, RateEntry>();
  const maxKeys = options.maxKeys ?? 10_000;

  function prune(now: number) {
    for (const [key, entry] of cache) {
      if (entry.resetAt <= now) cache.delete(key);
    }
    while (cache.size >= maxKeys) {
      const oldestKey = cache.keys().next().value as string | undefined;
      if (!oldestKey) break;
      cache.delete(oldestKey);
    }
  }

  return function rateLimit(req: Request, res: Response, next: NextFunction) {
    const now = Date.now();
    const key = options.keyFn ? options.keyFn(req) : makeKey(req);
    const record = cache.get(key);

    if (!record || record.resetAt <= now) {
      if (cache.size >= maxKeys) prune(now);
      cache.set(key, { count: 1, resetAt: now + options.windowMs });
      res.setHeader("RateLimit-Limit", String(options.max));
      res.setHeader("RateLimit-Remaining", String(Math.max(0, options.max - 1)));
      return next();
    }

    if (record.count >= options.max) {
      const retryAfter = Math.max(1, Math.ceil((record.resetAt - now) / 1000));
      res.setHeader("Retry-After", String(retryAfter));
      res.setHeader("RateLimit-Limit", String(options.max));
      res.setHeader("RateLimit-Remaining", "0");
      return res.status(429).json({ error: options.message ?? "Too many requests" });
    }

    record.count += 1;
    cache.set(key, record);
    res.setHeader("RateLimit-Limit", String(options.max));
    res.setHeader("RateLimit-Remaining", String(Math.max(0, options.max - record.count)));
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
