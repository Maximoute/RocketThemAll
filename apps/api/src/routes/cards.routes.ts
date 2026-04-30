import { Router } from "express";
import { z } from "zod";
import { CardsService } from "@rta/services";
import { requireAdmin } from "../middleware/auth.js";
import { validateBody } from "../utils/validate.js";

const router = Router();
const cardsService = new CardsService();

const createCardSchema = z.object({
  name: z.string().min(1),
  deckId: z.string(),
  rarityId: z.string(),
  imageUrl: z.string().url().optional(),
  description: z.string().optional(),
  xpReward: z.number().int().nonnegative(),
  dropRate: z.number().positive()
});

router.get("/", async (_req, res) => {
  res.json(await cardsService.getCards());
});

router.post("/", requireAdmin, async (req, res) => {
  const payload = validateBody(createCardSchema, req);
  res.status(201).json(await cardsService.createCard(payload));
});

router.patch("/:id", requireAdmin, async (req, res) => {
  res.json(await cardsService.updateCard(req.params.id, req.body));
});

router.delete("/:id", requireAdmin, async (req, res) => {
  await cardsService.deleteCard(req.params.id);
  res.status(204).send();
});

router.get("/admin/decks", requireAdmin, async (_req, res) => {
  res.json(await cardsService.listDecks());
});

router.post("/admin/decks", requireAdmin, async (req, res) => {
  res.status(201).json(await cardsService.createDeck(req.body.name));
});

router.delete("/admin/decks/:id", requireAdmin, async (req, res) => {
  await cardsService.deleteDeck(req.params.id);
  res.status(204).send();
});

router.get("/admin/rarities", requireAdmin, async (_req, res) => {
  res.json(await cardsService.listRarities());
});

router.patch("/admin/rarities/:id", requireAdmin, async (req, res) => {
  res.json(await cardsService.patchRarity(req.params.id, req.body));
});

router.get("/export", requireAdmin, async (_req, res) => {
  res.json(await cardsService.exportCardsJson());
});

router.post("/import", requireAdmin, async (req, res) => {
  res.json(await cardsService.importCardsJson(req.body));
});

export default router;
