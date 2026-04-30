import type { AnyZodObject } from "zod";
import type { Request } from "express";

export function validateBody<T extends AnyZodObject>(schema: T, req: Request) {
  return schema.parse(req.body);
}
