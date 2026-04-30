import { Router } from "express";
import { TradeService } from "@rta/services";
import { requireAuth } from "../middleware/auth.js";

const router = Router();
const tradeService = new TradeService();

router.post("/", requireAuth, async (req, res) => {
  const { user2Id } = req.body as { user2Id: string };
  res.status(201).json(await tradeService.startTrade(req.user!.id, user2Id));
});

router.patch("/:id", requireAuth, async (req, res) => {
  const { action, cardId, quantity } = req.body as {
    action: "add" | "remove" | "confirm" | "cancel";
    cardId?: string;
    quantity?: number;
  };

  if (action === "add") {
    return res.json(await tradeService.addItem(req.params.id, req.user!.id, cardId!, quantity ?? 1));
  }

  if (action === "remove") {
    return res.json(await tradeService.removeItem(req.params.id, req.user!.id, cardId!, quantity ?? 1));
  }

  if (action === "confirm") {
    return res.json(await tradeService.confirmTrade(req.params.id, req.user!.id));
  }

  return res.json(await tradeService.cancelTrade(req.params.id, req.user!.id));
});

export default router;
