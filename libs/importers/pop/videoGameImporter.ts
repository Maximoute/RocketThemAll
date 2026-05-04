/**
 * RAWG importer — jeux vidéo (category: video_game)
 * https://api.rawg.io/api — clé gratuite requise : RAWG_API_KEY dans .env
 */
import axios from "axios";
import { prisma } from "@rta/database";
import { z } from "zod";
import { getRarityIdByName } from "../src/rarityService";

const RAWG_BASE = "https://api.rawg.io/api";
const REQUEST_DELAY_MS = 300;
const MAX_RETRIES = 3;
const MAX_IMPORT_LIMIT = 100;

const rawgItemSchema = z.object({
  id: z.number().int().positive(),
  name: z.string().min(1),
  background_image: z.string().url().nullable().optional(),
  description_raw: z.string().optional(),
  rating: z.number().optional(),
  ratings_count: z.number().int().optional()
}).strict();

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function withRetry<T>(fn: () => Promise<T>, context: string): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (attempt < MAX_RETRIES) await sleep(800 * attempt);
    }
  }
  throw lastError instanceof Error ? lastError : new Error(`${context} failed after retries`);
}

function determineRarity(rating: number, ratingsCount: number): "Common" | "Uncommon" | "Rare" | "Very Rare" | "Exotic" | "Black Market" {
  if (Math.random() < 0.01) return "Black Market";
  if (rating >= 4.5 && ratingsCount > 5000) return "Exotic";
  if (rating >= 4.2 || ratingsCount > 10000) return "Very Rare";
  if (rating >= 3.8 || ratingsCount > 3000) return "Rare";
  if (rating >= 3.4 || ratingsCount > 1000) return "Uncommon";
  return "Common";
}

const rarityXp: Record<string, number> = {
  Common: 10, Uncommon: 20, Rare: 40, "Very Rare": 70, Exotic: 160, "Black Market": 250
};
const rarityDrop: Record<string, number> = {
  Common: 0.6, Uncommon: 0.25, Rare: 0.1, "Very Rare": 0.07, Exotic: 0.04, "Black Market": 0.01
};

export async function importVideoGames(limit = 100, pages = 4): Promise<number> {
  const safeLimit = Math.max(1, Math.min(limit, MAX_IMPORT_LIMIT));
  const apiKey = process.env.RAWG_API_KEY;
  if (!apiKey) throw new Error("RAWG_API_KEY is not set. Add it to .env to import video games.");

  const deck = await prisma.deck.findUnique({ where: { name: "Pop Culture" } });
  if (!deck) throw new Error("Deck 'Pop Culture' not found");

  let imported = 0;

  for (let p = 1; p <= pages && imported < safeLimit; p++) {
    const response = await withRetry(
      () => axios.get(`${RAWG_BASE}/games`, {
        params: { key: apiKey, page: p, page_size: 25, ordering: "-rating", dates: "2000-01-01,2026-12-31" },
        timeout: 10_000
      }),
      `RAWG page ${p}`
    );

    const parsed = z.array(rawgItemSchema).safeParse(response.data.results || []);
    const items = parsed.success ? parsed.data : [];

    for (const item of items) {
      if (imported >= safeLimit) break;
      if (!item.background_image) continue;

      const sourceId = `rawg-game-${item.id}`;
      const exists = await prisma.card.findFirst({ where: { source: "rawg", sourceId } });
      if (exists) continue;

      const rarityName = determineRarity(item.rating ?? 0, item.ratings_count ?? 0);
      const rarityId = await getRarityIdByName(rarityName);

      const collision = await prisma.card.findUnique({ where: { name: item.name } });
      const cardName = collision ? `${item.name} (game #${item.id})` : item.name;

      await prisma.card.create({
        data: {
          name: cardName,
          deckId: deck.id,
          rarityId,
          imageUrl: item.background_image,
          description: item.description_raw
            ? item.description_raw.slice(0, 300) + (item.description_raw.length > 300 ? "..." : "")
            : "Jeu vidéo issu de RAWG",
          xpReward: rarityXp[rarityName] ?? 10,
          dropRate: rarityDrop[rarityName] ?? 0.6,
          source: "rawg",
          sourceId,
          category: "video_game"
        }
      });

      imported++;
      console.log(`✅ [rawg] ${cardName} | ${rarityName} | rating=${item.rating ?? "?"}`);
    }

    await sleep(REQUEST_DELAY_MS);
  }

  console.log(`🎮 RAWG import terminé : ${imported} nouvelles cartes`);
  return imported;
}
