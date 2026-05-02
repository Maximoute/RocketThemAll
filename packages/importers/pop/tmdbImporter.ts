/**
 * TMDb importer — films et séries uniquement (category: movie | tv)
 * N'importe pas les personnes (media_type === "person")
 */
import axios from "axios";
import { prisma } from "@rta/database";
import { z } from "zod";
import { getRarityIdByName } from "../src/rarityService";

const TMDB_BASE = "https://api.themoviedb.org/3";
const TMDB_IMAGE_BASE = "https://image.tmdb.org/t/p/w500";
const REQUEST_DELAY_MS = 200;
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 500;
const MAX_IMPORT_LIMIT = 100;

const tmdbItemSchema = z.object({
  id: z.number().int().positive(),
  title: z.string().optional(),
  name: z.string().optional(),
  poster_path: z.string().nullable().optional(),
  overview: z.string().optional(),
  popularity: z.number().optional(),
  media_type: z.enum(["movie", "tv", "person"]).optional()
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
      if (attempt < MAX_RETRIES) await sleep(RETRY_DELAY_MS * attempt);
    }
  }
  throw lastError instanceof Error ? lastError : new Error(`${context} failed after retries`);
}

function determineRarity(popularity: number): "Common" | "Uncommon" | "Rare" | "Exotic" | "Black Market" {
  if (Math.random() < 0.01) return "Black Market";
  if (popularity > 1000) return "Exotic";
  if (popularity > 500) return "Rare";
  if (popularity > 200) return "Uncommon";
  return "Common";
}

const rarityXp: Record<string, number> = {
  Common: 10, Uncommon: 20, Rare: 40, Exotic: 160, "Black Market": 250
};
const rarityDrop: Record<string, number> = {
  Common: 0.6, Uncommon: 0.25, Rare: 0.1, Exotic: 0.04, "Black Market": 0.01
};

export async function importTmdbMoviesAndSeries(limit = 150, startPage = 1, maxPages = 3): Promise<number> {
  const safeLimit = Math.max(1, Math.min(limit, MAX_IMPORT_LIMIT));
  const apiKey = process.env.TMDB_API_KEY;
  if (!apiKey) throw new Error("TMDB_API_KEY is not set");

  const deck = await prisma.deck.findUnique({ where: { name: "Pop Culture" } });
  if (!deck) throw new Error("Deck 'Pop Culture' not found");

  let imported = 0;

  for (let p = startPage; p <= maxPages && imported < safeLimit; p++) {
    const response = await withRetry(
      () => axios.get(`${TMDB_BASE}/trending/all/week?page=${p}&language=fr-FR`, {
        headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" },
        timeout: 10_000
      }),
      `TMDb page ${p}`
    );

    const parsedItems = z.array(tmdbItemSchema).safeParse(response.data.results || []);
    const items = parsedItems.success ? parsedItems.data : [];

    for (const item of items) {
      if (imported >= safeLimit) break;
      // Exclure les personnes
      if (!item.media_type || item.media_type === "person") continue;
      if (!item.poster_path) continue;

      const category: "movie" | "tv" = item.media_type === "tv" ? "tv" : "movie";
      const displayName = item.title || item.name || `TMDb-${item.id}`;
      const sourceId = `tmdb-${category}-${item.id}`;

      const exists = await prisma.card.findFirst({ where: { source: "tmdb", sourceId } });
      if (exists) continue;

      const rarityName = determineRarity(item.popularity || 0);
      const rarityId = await getRarityIdByName(rarityName);

      const collision = await prisma.card.findUnique({ where: { name: displayName } });
      const cardName = collision ? `${displayName} (${category} #${item.id})` : displayName;

      await prisma.card.create({
        data: {
          name: cardName,
          deckId: deck.id,
          rarityId,
          imageUrl: `${TMDB_IMAGE_BASE}${item.poster_path}`,
          description: item.overview || `Carte ${category === "movie" ? "film" : "série"} issue de TMDb`,
          xpReward: rarityXp[rarityName] ?? 10,
          dropRate: rarityDrop[rarityName] ?? 0.6,
          source: "tmdb",
          sourceId,
          category
        }
      });

      imported++;
      console.log(`✅ [tmdb] ${cardName} (${category}) | ${rarityName}`);
    }

    await sleep(REQUEST_DELAY_MS);
  }

  console.log(`🎬 TMDb import terminé : ${imported} nouvelles cartes`);
  return imported;
}
