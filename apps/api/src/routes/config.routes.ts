import { Router } from "express";
import { z } from "zod";
import { ConfigService } from "@rta/services";
import { requireAdmin, requireAuth } from "../middleware/auth.js";
import { validateBody } from "../utils/validate.js";

const router = Router();
const configService = new ConfigService();

const configPatchSchema = z.object({
  fusionEnabled: z.boolean().optional(),
  craftBoosterFragmentCost: z.number().int().min(0).max(100_000_000).optional(),
  dailyCreditMin: z.number().int().min(0).max(100_000_000).optional(),
  dailyCreditMax: z.number().int().min(0).max(100_000_000).optional(),
  dailyBoosterChance: z.number().min(0).max(1).optional(),
  captureConsumableDropRate: z.number().min(0).max(1).optional(),
  captureConsumableCommonWeight: z.number().int().min(0).max(100_000_000).optional(),
  captureConsumableUncommonWeight: z.number().int().min(0).max(100_000_000).optional(),
  captureConsumableRareWeight: z.number().int().min(0).max(100_000_000).optional(),
  captureConsumableEpicWeight: z.number().int().min(0).max(100_000_000).optional(),
  captureConsumableLegendaryWeight: z.number().int().min(0).max(100_000_000).optional()
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
