import { Router } from "express";
import { CardsService } from "@rta/services";
import { requireAdmin, requireAuth } from "../middleware/auth.js";

const router = Router();
const cardsService = new CardsService();

router.get("/", async (_req, res) => {
  res.json(await cardsService.getCards());
});

router.get("/admin/decks", requireAuth, requireAdmin, async (_req, res) => {
  res.json(await cardsService.listDecks());
});

router.get("/admin/rarities", requireAuth, requireAdmin, async (_req, res) => {
  res.json(await cardsService.listRarities());
});

router.get("/export", requireAuth, requireAdmin, async (_req, res) => {
  res.json(await cardsService.exportCardsJson());
});

export default router;
