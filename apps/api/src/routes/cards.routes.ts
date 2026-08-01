import { Router } from "express";
import { CardsService } from "@rta/services";
import { requireAdmin, requireAuth } from "../middleware/auth.js";

const router = Router();
const cardsService = new CardsService();
const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 100;
const MAX_PAGE = 10_000;

export function boundedPositiveInteger(
  value: unknown,
  fallback: number,
  maximum: number
) {
  if (value === undefined) return fallback;
  if (typeof value !== "string" || !/^[1-9]\d*$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed <= maximum ? parsed : null;
}

router.get("/", async (req, res) => {
  const page = boundedPositiveInteger(req.query.page, 1, MAX_PAGE);
  const pageSize = boundedPositiveInteger(
    req.query.pageSize,
    DEFAULT_PAGE_SIZE,
    MAX_PAGE_SIZE
  );
  if (page === null || pageSize === null) {
    return res.status(400).json({ error: "Invalid pagination parameters" });
  }
  res.setHeader("Cache-Control", "public, max-age=60, stale-while-revalidate=300");
  return res.json(await cardsService.getCardsPage(page, pageSize));
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
