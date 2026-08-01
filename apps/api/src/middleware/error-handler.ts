import type { NextFunction, Request, Response } from "express";
import { AppError } from "@rta/services";
import { ZodError } from "zod";
import { logError } from "../utils/logger.js";

export function errorHandler(error: unknown, req: Request, res: Response, _next: NextFunction) {
  const bodyParserType = error && typeof error === "object" && "type" in error
    ? String((error as { type?: unknown }).type)
    : "";
  if (bodyParserType === "entity.parse.failed") {
    return res.status(400).json({ error: "Malformed JSON body" });
  }
  if (bodyParserType === "entity.too.large") {
    return res.status(413).json({ error: "Request body is too large" });
  }
  if (bodyParserType === "encoding.unsupported" || bodyParserType === "charset.unsupported") {
    return res.status(415).json({ error: "Request body encoding is not supported" });
  }

  if (error instanceof ZodError) {
    return res.status(400).json({
      error: "Validation failed",
      details: error.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message }))
    });
  }

  if (error instanceof AppError) {
    const appError = error as AppError;
    if (appError.statusCode >= 500) {
      logError("Application error", {
        path: req.path,
        correlationId: res.locals.correlationId,
        statusCode: appError.statusCode,
        message: appError.message
      });
    }
    return res.status(appError.statusCode).json({ error: appError.message });
  }

  logError("Unhandled error", {
    path: req.path,
    correlationId: res.locals.correlationId,
    message: error instanceof Error ? error.message : String(error)
  });

  if (process.env.NODE_ENV === "production") {
    return res.status(500).json({ error: "Internal server error" });
  }

  const errorMessage = error instanceof Error ? error.message : "Internal server error";
  const stack = error instanceof Error ? error.stack : undefined;
  return res.status(500).json({ error: errorMessage, stack });
}
