import { randomUUID } from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import { logInfo } from "../utils/logger.js";

const SAFE_REQUEST_ID = /^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,127}$/;

export function requestContext(req: Request, res: Response, next: NextFunction) {
  const incoming = req.header("x-request-id");
  const correlationId = incoming && SAFE_REQUEST_ID.test(incoming) ? incoming : randomUUID();
  const startedAt = process.hrtime.bigint();

  res.locals.correlationId = correlationId;
  res.setHeader("x-request-id", correlationId);
  res.on("finish", () => {
    const durationMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
    logInfo("HTTP request completed", {
      correlationId,
      method: req.method,
      path: req.path,
      statusCode: res.statusCode,
      durationMs: Math.round(durationMs * 10) / 10
    });
  });
  next();
}
