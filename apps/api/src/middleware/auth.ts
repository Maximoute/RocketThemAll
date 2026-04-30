import type { NextFunction, Request, Response } from "express";

export type RequestUser = {
  id: string;
  isAdmin: boolean;
};

declare module "express-serve-static-core" {
  interface Request {
    user?: RequestUser;
  }
}

export function mockAuth(req: Request, _res: Response, next: NextFunction) {
  req.user = {
    id: req.header("x-user-id") ?? "",
    isAdmin: req.header("x-user-admin") === "true"
  };
  next();
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.user?.id) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  return next();
}

export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (!req.user?.isAdmin) {
    return res.status(403).json({ error: "Admin permission required" });
  }
  return next();
}
