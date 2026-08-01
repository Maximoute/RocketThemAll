import { Router } from "express";
import { z } from "zod";
import { TradeService } from "@rta/services";
import { requireAuth } from "../middleware/auth.js";
import { validateBody, validateParams } from "../utils/validate.js";
import { actionRateLimit } from "../middleware/rate-limit.js";

const router = Router();
const tradeService = new TradeService();

const createTradeSchema = z.object({
  user2Id: z.string().uuid()
}).strict();

const tradeIdSchema = z.object({ id: z.string().uuid() }).strict();

const tradeActionSchema = z.object({
  action: z.enum(["add", "remove", "confirm", "cancel"]),
  cardId: z.string().uuid().optional(),
  quantity: z.number().int().min(1).max(1_000_000).optional()
}).strict();

router.post("/", requireAuth, actionRateLimit, async (req, res) => {
  const payload = validateBody(createTradeSchema, req);
  res.status(201).json(await tradeService.startTrade(req.user!.id, payload.user2Id));
});

router.patch("/:id", requireAuth, actionRateLimit, async (req, res) => {
  const { id: tradeId } = validateParams(tradeIdSchema, req);
  const { action, cardId, quantity } = validateBody(tradeActionSchema, req);

  if (action === "add") {
    if (!cardId) {
      return res.status(400).json({ error: "cardId is required for add action" });
    }
    return res.json(await tradeService.addItem(tradeId, req.user!.id, cardId!, quantity ?? 1));
  }

  if (action === "remove") {
    if (!cardId) {
      return res.status(400).json({ error: "cardId is required for remove action" });
    }
    return res.json(await tradeService.removeItem(tradeId, req.user!.id, cardId!, quantity ?? 1));
  }

  if (action === "confirm") {
    return res.json(await tradeService.confirmTrade(tradeId, req.user!.id));
  }

  return res.json(await tradeService.cancelTrade(tradeId, req.user!.id));
});

export default router;
