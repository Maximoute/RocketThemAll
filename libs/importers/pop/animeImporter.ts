/**
 * Jikan importer — anime et manga (pas d'API key requise)
 * https://api.jikan.moe/v4
 */
import axios from "axios";
import { prisma } from "@rta/database";
import { z } from "zod";
import { getRarityIdByName } from "../src/rarityService";

const JIKAN_BASE = "https://api.jikan.moe/v4";
const REQUEST_DELAY_MS = 500; // Jikan recommande max 3 req/sec
const MAX_RETRIES = 3;
const MAX_IMPORT_LIMIT = 100;

const jikanItemSchema = z.object({
  mal_id: z.number().int().positive(),
  title: z.string().min(1),
  title_french: z.string().optional(),
  images: z.object({
    jpg: z.object({ large_image_url: z.string().url().optional() }).optional()
  }).optional(),
  synopsis: z.string().optional(),
  score: z.number().optional(),
  members: z.number().int().optional(),
  type: z.string().optional()
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
      if (attempt < MAX_RETRIES) await sleep(1000 * attempt);
    }
  }
  throw lastError instanceof Error ? lastError : new Error(`${context} failed after retries`);
}

function determineRarity(score: number, members: number): "Common" | "Uncommon" | "Rare" | "Very Rare" | "Exotic" | "Black Market" {
  if (Math.random() < 0.01) return "Black Market";
  if (score >= 8.5 && members > 500000) return "Exotic";
  if (score >= 8.0 || members > 1000000) return "Very Rare";
  if (score >= 7.5 || members > 500000) return "Rare";
  if (score >= 7.0 || members > 100000) return "Uncommon";
  return "Common";
}

const rarityXp: Record<string, number> = {
  Common: 10, Uncommon: 20, Rare: 40, "Very Rare": 70, Exotic: 160, "Black Market": 250
};
const rarityDrop: Record<string, number> = {
  Common: 0.6, Uncommon: 0.25, Rare: 0.1, "Very Rare": 0.07, Exotic: 0.04, "Black Market": 0.01
};

type JikanType = "anime" | "manga";

async function importJikanType(type: JikanType, limitPerType: number, pages: number): Promise<number> {
  const deck = await prisma.deck.findUnique({ where: { name: "Pop Culture" } });
  if (!deck) throw new Error("Deck 'Pop Culture' not found");

  let imported = 0;

  for (let p = 1; p <= pages && imported < limitPerType; p++) {
    const response = await withRetry(
      () => axios.get(`${JIKAN_BASE}/top/${type}?page=${p}&limit=25`, { timeout: 10_000 }),
      `Jikan ${type} page ${p}`
    );

    const parsed = z.array(jikanItemSchema).safeParse(response.data.data || []);
    const items = parsed.success ? parsed.data : [];

    for (const item of items) {
      if (imported >= limitPerType) break;

      const displayName = item.title_french || item.title;
      if (!displayName) continue;

      const imageUrl = item.images?.jpg?.large_image_url;
      if (!imageUrl) continue;

      const sourceId = `jikan-${type}-${item.mal_id}`;
      const exists = await prisma.card.findFirst({ where: { source: "jikan", sourceId } });
      if (exists) continue;

      const rarityName = determineRarity(item.score ?? 0, item.members ?? 0);
      const rarityId = await getRarityIdByName(rarityName);

      const collision = await prisma.card.findUnique({ where: { name: displayName } });
      const cardName = collision ? `${displayName} (${type} #${item.mal_id})` : displayName;

      await prisma.card.create({
        data: {
          name: cardName,
          deckId: deck.id,
          rarityId,
          imageUrl,
          description: item.synopsis
            ? item.synopsis.slice(0, 300) + (item.synopsis.length > 300 ? "..." : "")
            : `Carte ${type} issue de MyAnimeList`,
          xpReward: rarityXp[rarityName] ?? 10,
          dropRate: rarityDrop[rarityName] ?? 0.6,
          source: "jikan",
          sourceId,
          category: type
        }
      });

      imported++;
      console.log(`✅ [jikan] ${cardName} (${type}) | ${rarityName} | score=${item.score ?? "?"}`);
    }

    await sleep(REQUEST_DELAY_MS);
  }

  return imported;
}

export async function importAnimeAndManga(limit = 100, pages = 4): Promise<number> {
  const safeLimit = Math.max(1, Math.min(limit, MAX_IMPORT_LIMIT));
  const half = Math.floor(safeLimit / 2);
  const animeCount = await importJikanType("anime", half, pages);
  const mangaCount = await importJikanType("manga", half, pages);
  const total = animeCount + mangaCount;
  console.log(`🎌 Jikan import terminé : ${animeCount} anime + ${mangaCount} manga = ${total} nouvelles cartes`);
  return total;
}
