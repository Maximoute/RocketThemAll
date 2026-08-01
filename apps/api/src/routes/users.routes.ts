import { Router } from "express";
import { z } from "zod";
import { UsersService } from "@rta/services";
import { prisma } from "@rta/database";
import { requireAdmin, requireAuth, requireSelfOrAdmin } from "../middleware/auth.js";
import { validateBody, validateParams } from "../utils/validate.js";

const router = Router();
const usersService = new UsersService();

const idParamSchema = z.object({ id: z.string().uuid() }).strict();
const patchInventorySchema = z.object({
  cardId: z.string().uuid(),
  quantity: z.number().int().min(0).max(1_000_000),
  variant: z.enum(["normal", "shiny", "holo"]).optional()
}).strict();
const patchUserSchema = z.object({
  username: z.string().min(1).max(64).optional(),
  credits: z.number().int().min(0).max(2_000_000_000).optional(),
  fragments: z.number().int().min(0).max(2_000_000_000).optional(),
  isAdmin: z.boolean().optional(),
  unlimitedExplorations: z.boolean().optional()
}).strict().refine((payload) => Object.keys(payload).length > 0, {
  message: "At least one field must be provided"
});

router.get("/", requireAuth, requireAdmin, async (_req, res) => {
  res.json(await usersService.listUsers());
});

router.get("/:id/profile", requireAuth, requireSelfOrAdmin("id"), async (req, res) => {
  const params = validateParams(idParamSchema, req);
  const profile = await prisma.user.findUnique({
    where: { id: params.id },
    select: {
      id: true,
      discordId: true,
      username: true,
      avatarUrl: true,
      level: true,
      xp: true,
      credits: true,
      fragments: true,
      isAdmin: true,
      unlimitedExplorations: true,
      createdAt: true
    }
  });

  if (!profile) {
    return res.status(404).json({ error: "User not found" });
  }

  return res.json(profile);
});

router.get("/:id/inventory", requireAuth, requireSelfOrAdmin("id"), async (req, res) => {
  const params = validateParams(idParamSchema, req);
  res.json(await usersService.getUserInventory(params.id));
});

router.patch("/:id", requireAuth, requireAdmin, async (req, res) => {
  const params = validateParams(idParamSchema, req);
  const payload = validateBody(patchUserSchema, req);
  if (payload.isAdmin === false && params.id === req.user!.id) {
    return res.status(409).json({ error: "You cannot remove your own admin access" });
  }
  const updated = await prisma.$transaction(async (tx) => {
    if (payload.isAdmin !== undefined) {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(9842072702)`;
      const target = await tx.user.findUnique({
        where: { id: params.id },
        select: { isAdmin: true }
      });
      if (!target) return null;
      if (
        target.isAdmin &&
        !payload.isAdmin &&
        await tx.user.count({ where: { isAdmin: true } }) <= 1
      ) {
        return "LAST_ADMIN" as const;
      }
    }
    const user = await tx.user.update({ where: { id: params.id }, data: payload });
    await tx.adminLog.create({
      data: {
        adminId: req.user!.id,
        action: "USER_UPDATED_VIA_API",
        target: params.id,
        metadata: { fields: Object.keys(payload) }
      }
    });
    return user;
  });
  if (updated === null) return res.status(404).json({ error: "User not found" });
  if (updated === "LAST_ADMIN") {
    return res.status(409).json({ error: "The last administrator cannot be removed" });
  }
  res.json(updated);
});

router.patch("/:id/inventory", requireAuth, requireAdmin, async (req, res) => {
  const params = validateParams(idParamSchema, req);
  const payload = validateBody(patchInventorySchema, req);
  res.json(await usersService.patchInventory(params.id, payload.cardId, payload.quantity, payload.variant));
});

export default router;
