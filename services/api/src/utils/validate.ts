import type { ZodTypeAny } from "zod";
import type { Request } from "express";
import type { z } from "zod";

export function validateBody<T extends ZodTypeAny>(schema: T, req: Request): z.infer<T> {
  return schema.parse(req.body);
}

export function validateParams<T extends z.ZodTypeAny>(schema: T, req: Request): z.infer<T> {
  return schema.parse(req.params);
}
