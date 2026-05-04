import { Router } from "express";
import { z } from "zod";
import { CardsService } from "@rta/services";
import { requireAdmin, requireAuth } from "../middleware/auth.js";
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
}).strict();

const updateCardSchema = z.object({
  name: z.string().min(1).optional(),
  deckId: z.string().uuid().optional(),
  rarityId: z.string().uuid().optional(),
  imageUrl: z.string().url().nullable().optional(),
  description: z.string().nullable().optional(),
  xpReward: z.number().int().nonnegative().optional(),
  dropRate: z.number().positive().optional()
}).strict().refine((payload) => Object.keys(payload).length > 0, {
  message: "At least one field must be provided"
});

const createDeckSchema = z.object({
  name: z.string().min(1).max(80)
}).strict();

const patchRaritySchema = z.object({
  name: z.string().min(1).max(80).optional(),
  weight: z.number().int().positive().optional()
}).strict().refine((payload) => Object.keys(payload).length > 0, {
  message: "At least one field must be provided"
});

const importCardsSchema = z.array(z.object({
  name: z.string().min(1),
  deck: z.string().min(1),
  rarity: z.string().min(1),
  imageUrl: z.string().url().optional(),
  description: z.string().optional(),
  xpReward: z.number().int().nonnegative(),
  dropRate: z.number().positive()
}).strict()).max(1000);

router.get("/", async (_req, res) => {
  res.json(await cardsService.getCards());
});

router.post("/", requireAuth, requireAdmin, async (req, res) => {
  const payload = validateBody(createCardSchema, req);
  res.status(201).json(await cardsService.createCard(payload));
});

router.patch("/:id", requireAuth, requireAdmin, async (req, res) => {
  const payload = validateBody(updateCardSchema, req);
  res.json(await cardsService.updateCard(req.params.id, payload));
});

router.delete("/:id", requireAuth, requireAdmin, async (req, res) => {
  await cardsService.deleteCard(req.params.id);
  res.status(204).send();
});

router.get("/admin/decks", requireAuth, requireAdmin, async (_req, res) => {
  res.json(await cardsService.listDecks());
});

router.post("/admin/decks", requireAuth, requireAdmin, async (req, res) => {
  const payload = validateBody(createDeckSchema, req);
  res.status(201).json(await cardsService.createDeck(payload.name));
});

router.delete("/admin/decks/:id", requireAuth, requireAdmin, async (req, res) => {
  await cardsService.deleteDeck(req.params.id);
  res.status(204).send();
});

router.get("/admin/rarities", requireAuth, requireAdmin, async (_req, res) => {
  res.json(await cardsService.listRarities());
});

router.patch("/admin/rarities/:id", requireAuth, requireAdmin, async (req, res) => {
  const payload = validateBody(patchRaritySchema, req);
  res.json(await cardsService.patchRarity(req.params.id, payload));
});

router.get("/export", requireAuth, requireAdmin, async (_req, res) => {
  res.json(await cardsService.exportCardsJson());
});

router.post("/import", requireAuth, requireAdmin, async (req, res) => {
  const payload = validateBody(importCardsSchema, req);
  res.json(await cardsService.importCardsJson(payload));
});

export default router;
