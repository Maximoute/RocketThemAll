import type { NextFunction, Request, Response } from "express";
import { getToken } from "next-auth/jwt";
import { prisma } from "@rta/database";
import { logSecurity } from "../utils/logger.js";

export type RequestUser = {
  id: string;
  discordId: string;
  isAdmin: boolean;
};

declare module "express-serve-static-core" {
  interface Request {
    user?: RequestUser;
  }
}

async function resolveRequestUser(req: Request): Promise<RequestUser | null> {
  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret) {
    logSecurity("NEXTAUTH_SECRET missing in API environment", { path: req.path });
    return null;
  }

  const token = await getToken({ req: req as any, secret });
  if (!token?.sub) {
    return null;
  }

  const discordId = String(token.sub);
  const user = await prisma.user.findUnique({
    where: { discordId },
    select: { id: true, discordId: true, isAdmin: true }
  });

  if (!user) {
    logSecurity("Authenticated token references unknown user", { discordId, path: req.path });
    return null;
  }

  return {
    id: user.id,
    discordId: user.discordId,
    isAdmin: user.isAdmin
  };
}

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  try {
    const resolvedUser = await resolveRequestUser(req);
    if (!resolvedUser) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    req.user = resolvedUser;
    return next();
  } catch (error) {
    logSecurity("Authentication middleware failure", {
      path: req.path,
      message: error instanceof Error ? error.message : String(error)
    });
    return res.status(401).json({ error: "Unauthorized" });
  }
}

export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (!req.user) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  if (!req.user.isAdmin) {
    logSecurity("Admin route access denied", { userId: req.user.id, path: req.path });
    return res.status(403).json({ error: "Admin permission required" });
  }

  return next();
}

export function requireSelfOrAdmin(paramName = "id") {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const resourceUserId = String(req.params[paramName] ?? "");
    if (req.user.id !== resourceUserId && !req.user.isAdmin) {
      logSecurity("Forbidden user resource access", {
        userId: req.user.id,
        targetUserId: resourceUserId,
        path: req.path
      });
      return res.status(403).json({ error: "Forbidden" });
    }

    return next();
  };
}
