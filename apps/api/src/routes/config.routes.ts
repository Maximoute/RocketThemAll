import { Router } from "express";
import { z } from "zod";
import { ConfigService } from "@rta/services";
import { requireAdmin, requireAuth } from "../middleware/auth.js";
import { validateBody } from "../utils/validate.js";

const router = Router();
const configService = new ConfigService();

const configPatchSchema = z.object({
  spawnIntervalS: z.number().int().min(1).optional(),
  captureCooldownS: z.number().int().min(0).optional(),
  spawnChannelId: z.string().min(1).nullable().optional(),
  forceSpawnRequestedAt: z.coerce.date().nullable().optional(),
  forceSpawnCardId: z.string().uuid().nullable().optional(),
  forceSpawnGuildId: z.string().min(1).nullable().optional(),
  autoSpawnEnabled: z.boolean().optional(),
  autoSpawnIntervalMinutes: z.number().int().min(1).optional(),
  manualSpawnEnabled: z.boolean().optional(),
  manualSpawnCooldownMinutes: z.number().int().min(1).optional(),
  manualSpawnMaxCharges: z.number().int().min(1).optional(),
  manualSpawnRegenHours: z.number().int().min(1).optional()
}).strict().refine((payload) => Object.keys(payload).length > 0, {
  message: "At least one field must be provided"
});

router.get("/", requireAuth, requireAdmin, async (_req, res) => {
  res.json(await configService.getConfig());
});

router.patch("/", requireAuth, requireAdmin, async (req, res) => {
  const payload = validateBody(configPatchSchema, req);
  res.json(await configService.patchConfig(payload));
});

export default router;
