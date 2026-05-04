import axios from "axios";
import { prisma } from "@rta/database";
import { getRarityIdByName } from "./rarityService";
import type { ImportLog } from "./types";

const TMDB_BASE = "https://api.themoviedb.org/3";
const TMDB_API_KEY = process.env.TMDB_API_KEY || "";

const TMDB_IMAGE_BASE = "https://image.tmdb.org/t/p/w500";
const REQUEST_DELAY_MS = 200;
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 500;

interface TmdbTrendingItem {
  id: number;
  title?: string;
  name?: string;
  poster_path?: string | null;
  profile_path?: string | null;
  overview: string;
  popularity: number;
  media_type?: "movie" | "tv" | "person";
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function withRetry<T>(fn: () => Promise<T>, context: string): Promise<T> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`⚠️ ${context} failed (attempt ${attempt}/${MAX_RETRIES}): ${message}`);
      if (attempt < MAX_RETRIES) {
        await sleep(RETRY_DELAY_MS * attempt);
      }
    }
  }

  throw lastError instanceof Error ? lastError : new Error(`${context} failed after retries`);
}

function determinePopRarity(popularity: number): "Common" | "Uncommon" | "Rare" | "Exotic" | "Black Market" {
  // 1% chance to make a card ultra rare regardless of popularity.
  if (Math.random() < 0.01) return "Black Market";
  if (popularity > 1000) return "Exotic";
  if (popularity > 500) return "Rare";
  if (popularity > 200) return "Uncommon";
  return "Common";
}

function getXpByRarity(rarity: "Common" | "Uncommon" | "Rare" | "Exotic" | "Black Market"): number {
  if (rarity === "Black Market") return 500;
  if (rarity === "Exotic") return 150;
  if (rarity === "Rare") return 50;
  if (rarity === "Uncommon") return 20;
  return 10;
}

function getDropRateByRarity(rarity: "Common" | "Uncommon" | "Rare" | "Exotic" | "Black Market"): number {
  if (rarity === "Black Market") return 0.01;
  if (rarity === "Exotic") return 0.04;
  if (rarity === "Rare") return 0.1;
  if (rarity === "Uncommon") return 0.25;
  return 0.6;
}

function buildImportLog(status: ImportLog["status"], count: number, error?: string): ImportLog {
  return {
    type: "POP",
    status,
    count,
    error,
    createdAt: new Date()
  };
}

async function writeImportLog(log: ImportLog): Promise<void> {
  await prisma.adminLog.create({
    data: {
      action: "IMPORT_POP",
      target: "tmdb",
      metadata: {
        type: "pop",
        status: log.status,
        count: log.count,
        error: log.error ?? null,
        createdAt: log.createdAt.toISOString()
      }
    }
  });
}

function getDisplayName(item: TmdbTrendingItem): string {
  return item.title || item.name || `TMDb-${item.id}`;
}

export async function importPopCulture(limit: number = 150, startPage: number = 1, maxPages: number = 3): Promise<number> {
  if (!TMDB_API_KEY) {
    throw new Error("TMDB_API_KEY is not set. Add it to environment before importing pop culture cards.");
  }

  console.log(`🎬 Importing pop culture cards from TMDb trending (pages: ${startPage}-${maxPages})...`);

  let imported = 0;

  await writeImportLog(buildImportLog("PENDING", 0));

  const deck = await prisma.deck.findUnique({ where: { name: "Pop Culture" } });
  if (!deck) {
    throw new Error("Deck 'Pop Culture' not found in database");
  }

  try {
    for (let p = startPage; p <= maxPages; p++) {
      if (imported >= limit) {
        break;
      }

      const response = await withRetry(
        () => axios.get(`${TMDB_BASE}/trending/all/week?page=${p}&language=fr-FR`, {
          headers: {
            Authorization: `Bearer ${TMDB_API_KEY}`,
            Accept: "application/json"
          }
        }),
        `TMDb page ${p}`
      );

      const items: TmdbTrendingItem[] = response.data.results || [];

      for (const item of items) {
        if (imported >= limit) {
          break;
        }

        try {
          const displayName = getDisplayName(item);
          const posterPath = item.poster_path || item.profile_path || null;

          if (!posterPath) {
            console.log(`⏭️ ${displayName} has no poster/profile image, skipping...`);
            continue;
          }

          // Exclure les personnes — uniquement films et séries
          if (item.media_type === "person") {
            console.log(`⏭️ ${displayName} is a person, skipping...`);
            continue;
          }

          const category = item.media_type === "tv" ? "tv" : "movie";
          const sourceId = `tmdb-${item.media_type || "unknown"}-${item.id}`;

          const exists = await prisma.card.findFirst({
            where: {
              source: "tmdb",
              sourceId
            }
          });

          if (exists) {
            console.log(`⏭️ ${displayName} already exists (sourceId=${sourceId}), skipping...`);
            continue;
          }

          const rarityName = determinePopRarity(item.popularity || 0);
          const rarityId = await getRarityIdByName(rarityName);

          const cardNameCollision = await prisma.card.findUnique({ where: { name: displayName } });
          const cardName = cardNameCollision
            ? `${displayName} (${item.media_type || "pop"} #${item.id})`
            : displayName;

          await prisma.card.create({
            data: {
              name: cardName,
              deckId: deck.id,
              rarityId,
              imageUrl: `${TMDB_IMAGE_BASE}${posterPath}`,
              description: item.overview || "Carte pop culture issue des tendances TMDb",
              xpReward: getXpByRarity(rarityName),
              dropRate: getDropRateByRarity(rarityName),
              source: "tmdb",
              sourceId,
              category
            }
          });

          imported++;
          console.log(`✅ Imported: ${cardName} | rarity=${rarityName} | popularity=${item.popularity || 0}`);
        } catch (error) {
          console.error(`❌ Failed to import ${getDisplayName(item)}:`, error instanceof Error ? error.message : error);
        }
      }

      console.log(`📄 Page ${p}/${maxPages} processed...`);
      await sleep(REQUEST_DELAY_MS);
    }

    await writeImportLog(buildImportLog("SUCCESS", imported));
    console.log(`\n✨ Pop culture import complete! ${imported} new cards added.`);
    return imported;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await writeImportLog(buildImportLog("ERROR", imported, message));
    console.error("❌ TMDb Error:", message);
    throw error;
  }
}

// Backward-compatible alias for existing callers.
export async function importMovies(page: number = 1, maxPages: number = 3): Promise<number> {
  return importPopCulture(150, page, maxPages);
}
