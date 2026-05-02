import axios from "axios";
import { prisma } from "@rta/database";
import { z } from "zod";
import { getRarityIdByName } from "../src/rarityService";

const TMDB_BASE = "https://api.themoviedb.org/3";
const TMDB_IMAGE_BASE = "https://image.tmdb.org/t/p/w500";
const MAX_IMPORT_LIMIT = 1000;
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 500;
const REQUEST_DELAY_MS = 200;

const MOVIE_DECK_NAME = "cinema_films";
const MOVIE_CATEGORY = "cinema";
const MOVIE_SOURCE = "tmdb";

const tmdbMovieSchema = z.object({
  id: z.number().int().positive(),
  title: z.string().optional(),
  poster_path: z.string().nullable().optional(),
  overview: z.string().optional(),
  popularity: z.number().optional(),
  vote_count: z.number().int().optional(),
  vote_average: z.number().optional(),
  release_date: z.string().optional(),
  original_language: z.string().optional(),
  genre_ids: z.array(z.number().int()).optional()
}).passthrough();

type TmdbMovie = z.infer<typeof tmdbMovieSchema>;

type Bounds = {
  popularity: { min: number; max: number };
  voteCount: { min: number; max: number };
  voteAverage: { min: number; max: number };
  age: { min: number; max: number };
};

type MovieRarityResult = {
  rarityScore: number;
  rarityFactors: {
    age: number;
    known_score: number;
    mainstream_score: number;
    classic_score: number;
    acronym_boost: number;
    classic_boost: number;
    masterpiece_boost: number;
    cult_boost: number;
    recent_penalty: number;
    obscure_old_penalty: number;
  };
};

type DbRarityName = "Common" | "Uncommon" | "Rare" | "Very Rare" | "Import" | "Exotic" | "Black Market" | "Limited";

const RARITY_ORDER_ASC: DbRarityName[] = ["Common", "Uncommon", "Rare", "Very Rare", "Import", "Exotic", "Black Market", "Limited"];
const RARITY_ORDER_DESC: DbRarityName[] = ["Limited", "Black Market", "Exotic", "Import", "Very Rare", "Rare", "Uncommon", "Common"];

const RARITY_TARGET_WEIGHTS: Record<DbRarityName, number> = {
  Common: 0.50,
  Uncommon: 0.22,
  Rare: 0.12,
  "Very Rare": 0.07,
  Import: 0.04,
  Exotic: 0.03,
  "Black Market": 0.01,
  Limited: 0.01
};

const acronymRules: Array<{ regex: RegExp; value: string }> = [
  { regex: /\blord\s+of\s+the\s+rings\b/i, value: "lotr" },
  { regex: /\bharry\s+potter\b/i, value: "hp" },
  { regex: /\bstar\s+wars\b/i, value: "sw" },
  { regex: /\bpirates\s+of\s+the\s+caribbean\b/i, value: "potc" },
  { regex: /\bback\s+to\s+the\s+future\b/i, value: "bttf" },
  { regex: /\bguardians\s+of\s+the\s+galaxy\b/i, value: "gotg" },
  { regex: /\bmission\s+impossible\b/i, value: "mi" }
];

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function withRetry<T>(fn: () => Promise<T>, context: string): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (attempt < MAX_RETRIES) {
        await sleep(RETRY_DELAY_MS * attempt);
      }
    }
  }
  throw lastError instanceof Error ? lastError : new Error(`${context} failed after retries`);
}

function normalizeForInput(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[’'`]/g, " ")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function toDisplayName(rawTitle: string): string {
  const cleaned = rawTitle.replace(/\s+/g, " ").trim();
  return cleaned.length > 90 ? cleaned.slice(0, 90).trim() : cleaned;
}

function clipAlias(alias: string, maxLen = 70): string {
  if (alias.length <= maxLen) return alias;
  const clipped = alias.slice(0, maxLen).trim();
  return clipped.replace(/\s+\S*$/, "").trim();
}

function generateAcceptedNames(title: string): string[] {
  const normalized = normalizeForInput(title);
  const parts = title.split(/[:\-\|]/g).map((part) => normalizeForInput(part)).filter(Boolean);

  const set = new Set<string>();
  if (normalized) {
    set.add(clipAlias(normalized));
  }

  const withoutLeadingArticle = normalized.replace(/^(the|a|an)\s+/, "").trim();
  if (withoutLeadingArticle && withoutLeadingArticle !== normalized) {
    set.add(clipAlias(withoutLeadingArticle));
  }

  for (const part of parts) {
    if (part.length >= 4) {
      set.add(clipAlias(part));
    }
  }

  // Useful short aliases for long titles.
  if (normalized.split(" ").length >= 6) {
    set.add(clipAlias(normalized.split(" ").slice(0, 5).join(" ")));
  }

  for (const rule of acronymRules) {
    if (rule.regex.test(title)) {
      set.add(rule.value);
    }
  }

  return Array.from(set).filter((name) => name.length >= 2);
}

function normalizeTo100(value: number, bounds: { min: number; max: number }): number {
  if (!Number.isFinite(value)) return 0;
  if (bounds.max <= bounds.min) return 0;
  const ratio = (value - bounds.min) / (bounds.max - bounds.min);
  return Math.max(0, Math.min(100, ratio * 100));
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function getXpByRarity(rarityName: DbRarityName): number {
  if (rarityName === "Limited") return 300;
  if (rarityName === "Black Market") return 250;
  if (rarityName === "Exotic") return 160;
  if (rarityName === "Import") return 110;
  if (rarityName === "Very Rare") return 70;
  if (rarityName === "Rare") return 40;
  if (rarityName === "Uncommon") return 20;
  return 10;
}

function getDropRateByRarity(rarityName: DbRarityName): number {
  if (rarityName === "Limited") return 0.01;
  if (rarityName === "Black Market") return 0.01;
  if (rarityName === "Exotic") return 0.03;
  if (rarityName === "Import") return 0.04;
  if (rarityName === "Very Rare") return 0.07;
  if (rarityName === "Rare") return 0.12;
  if (rarityName === "Uncommon") return 0.22;
  return 0.5;
}

function buildProportionalRarityCounts(total: number): Record<DbRarityName, number> {
  const result = Object.fromEntries(RARITY_ORDER_ASC.map((name) => [name, 0])) as Record<DbRarityName, number>;
  if (total <= 0) return result;

  const exact = RARITY_ORDER_ASC.map((name) => ({
    name,
    exact: total * RARITY_TARGET_WEIGHTS[name]
  }));

  let assigned = 0;
  for (const item of exact) {
    const floor = Math.floor(item.exact);
    result[item.name] = floor;
    assigned += floor;
  }

  let remaining = total - assigned;
  const byRemainder = [...exact]
    .sort((a, b) => (b.exact - Math.floor(b.exact)) - (a.exact - Math.floor(a.exact)));

  for (let i = 0; i < byRemainder.length && remaining > 0; i++) {
    result[byRemainder[i].name] += 1;
    remaining -= 1;
  }

  if (total >= RARITY_ORDER_ASC.length) {
    for (const name of RARITY_ORDER_ASC) {
      if (result[name] > 0) continue;
      const donor = RARITY_ORDER_ASC.find((candidate) => result[candidate] > 1) ?? "Common";
      if (result[donor] > 1) {
        result[donor] -= 1;
        result[name] = 1;
      }
    }
  }

  return result;
}

function computeBounds(movies: Array<TmdbMovie & { releaseYear: number }>): Bounds {
  const currentYear = new Date().getFullYear();
  const popularities = movies.map((m) => m.popularity ?? 0);
  const voteCounts = movies.map((m) => m.vote_count ?? 0);
  const voteAverages = movies.map((m) => m.vote_average ?? 0);
  const ages = movies.map((m) => Math.max(0, currentYear - m.releaseYear));

  return {
    popularity: { min: Math.min(...popularities), max: Math.max(...popularities) },
    voteCount: { min: Math.min(...voteCounts), max: Math.max(...voteCounts) },
    voteAverage: { min: Math.min(...voteAverages), max: Math.max(...voteAverages) },
    age: { min: Math.min(...ages), max: Math.max(...ages) }
  };
}

// Popularity alone pushes a film toward common rarity.
// Age alone must never make a film rare.
// Rarity emerges from age + recognition + quality, while obscure old films are penalized.
export function calculateMovieRarity(movie: TmdbMovie & { releaseYear: number }, bounds: Bounds, acceptedNames: string[]): MovieRarityResult {
  const currentYear = new Date().getFullYear();
  const age = Math.max(0, currentYear - movie.releaseYear);

  const popularityN = normalizeTo100(movie.popularity ?? 0, bounds.popularity);
  const voteCountN = normalizeTo100(movie.vote_count ?? 0, bounds.voteCount);
  const voteAverageN = normalizeTo100(movie.vote_average ?? 0, bounds.voteAverage);
  const ageN = normalizeTo100(age, bounds.age);

  const knownScore = popularityN * 0.6 + voteCountN * 0.4;
  const classicScore = ageN * 0.4 + knownScore * 0.6;
  const mainstreamScore = popularityN * 0.7 + voteCountN * 0.3;

  // Base score favors recognition, critical quality and legacy,
  // while mainstream pressure is now a mild brake (not a hard blocker).
  const rarityScore =
    knownScore * 0.35
    + voteAverageN * 0.30
    + ageN * 0.20
    + classicScore * 0.25
    - mainstreamScore * 0.08;

  const acronymBoost = acceptedNames.some((name) => acronymRules.some((rule) => rule.value === name)) ? 8 : 0;
  const classicBoost = age >= 20 && knownScore >= 35 ? 12 : 0;
  const masterpieceBoost = (movie.vote_average ?? 0) >= 8.3 && (movie.vote_count ?? 0) >= 2000 ? 15 : 0;
  const cultBoost = age >= 30 && voteAverageN >= 70 ? 10 : 0;
  const recentPenalty = age <= 4 && mainstreamScore >= 75 ? -12 : 0;
  const obscureOldPenalty = age >= 25 && knownScore < 25 ? -20 : 0;

  const finalRarityScore = clamp(
    rarityScore + acronymBoost + classicBoost + masterpieceBoost + cultBoost + recentPenalty + obscureOldPenalty,
    0,
    100
  );

  return {
    rarityScore: Math.round(finalRarityScore),
    rarityFactors: {
      age,
      known_score: Math.round(knownScore),
      mainstream_score: Math.round(mainstreamScore),
      classic_score: Math.round(classicScore),
      acronym_boost: acronymBoost,
      classic_boost: classicBoost,
      masterpiece_boost: masterpieceBoost,
      cult_boost: cultBoost,
      recent_penalty: recentPenalty,
      obscure_old_penalty: obscureOldPenalty
    }
  };
}

async function ensureDeck(name: string): Promise<string> {
  const deck = await prisma.deck.upsert({
    where: { name },
    update: {},
    create: { name }
  });
  return deck.id;
}

async function fetchPopularMovies(maxPages: number): Promise<TmdbMovie[]> {
  const apiKey = process.env.TMDB_API_KEY;
  if (!apiKey) throw new Error("TMDB_API_KEY is not set");

  const all: TmdbMovie[] = [];

  for (let page = 1; page <= maxPages; page++) {
    const response = await withRetry(
      () => axios.get(`${TMDB_BASE}/movie/popular?page=${page}&language=fr-FR`, {
        headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" },
        timeout: 10_000
      }),
      `TMDB popular page ${page}`
    );

    const rawItems = Array.isArray(response.data?.results) ? response.data.results : [];
    for (const rawItem of rawItems) {
      const parsed = tmdbMovieSchema.safeParse(rawItem);
      if (parsed.success) {
        all.push(parsed.data);
      }
    }

    await sleep(REQUEST_DELAY_MS);
  }

  return all;
}

export async function importCinemaFilmsDeck(limit = 500, maxPages = 30): Promise<{ imported: number; blacklisted: number; skipped: number }> {
  const safeLimit = Math.max(1, Math.min(limit, MAX_IMPORT_LIMIT));
  const safePages = Math.max(1, Math.min(maxPages, 30));

  const deckId = await ensureDeck(MOVIE_DECK_NAME);
  const candidates = await fetchPopularMovies(safePages);

  const filteredForScoring = candidates
    .filter((movie) => movie.title && movie.release_date && movie.poster_path)
    .map((movie) => ({ ...movie, releaseYear: Number(movie.release_date?.slice(0, 4)) }))
    .filter((movie) => Number.isFinite(movie.releaseYear));

  const bounds = computeBounds(filteredForScoring);

  let blacklisted = 0;
  let skipped = 0;
  const eligible: Array<{
    movie: TmdbMovie;
    sourceId: string;
    releaseYear: number;
    acceptedNames: string[];
    rarityResult: MovieRarityResult;
    displayName: string;
  }> = [];

  for (const movie of candidates) {

    const title = (movie.title ?? "").trim();
    if (!title) {
      skipped++;
      continue;
    }

    const sourceId = `tmdb-movie-${movie.id}`;

    // Missing poster entries are tracked, but never imported into active playable cards.
    if (!movie.poster_path) {
      await prisma.movieImportBlacklist.upsert({
        where: { sourceId },
        update: {
          deck: MOVIE_DECK_NAME,
          source: MOVIE_SOURCE,
          displayName: title,
          reason: "missing_image",
          payload: movie
        },
        create: {
          deck: MOVIE_DECK_NAME,
          source: MOVIE_SOURCE,
          sourceId,
          displayName: title,
          reason: "missing_image",
          payload: movie
        }
      });
      blacklisted++;
      continue;
    }

    if (!movie.release_date || !movie.vote_count || movie.vote_count < 50) {
      skipped++;
      continue;
    }

    const releaseYear = Number(movie.release_date.slice(0, 4));
    if (!Number.isFinite(releaseYear) || releaseYear < 1900) {
      skipped++;
      continue;
    }

    const acceptedNames = generateAcceptedNames(title);
    if (acceptedNames.length === 0) {
      skipped++;
      continue;
    }

    const rarityResult = calculateMovieRarity({ ...movie, releaseYear }, bounds, acceptedNames);
    eligible.push({
      movie,
      sourceId,
      releaseYear,
      acceptedNames,
      rarityResult,
      displayName: toDisplayName(title)
    });
  }

  const selected = eligible.slice(0, safeLimit);
  if (eligible.length > safeLimit) {
    skipped += eligible.length - safeLimit;
  }

  const proportionalCounts = buildProportionalRarityCounts(selected.length);
  const byScoreDesc = [...selected].sort((a, b) => b.rarityResult.rarityScore - a.rarityResult.rarityScore);
  const assignedRarities = new Map<string, DbRarityName>();
  let cursor = 0;
  for (const rarityName of RARITY_ORDER_DESC) {
    const count = proportionalCounts[rarityName];
    for (let i = 0; i < count && cursor < byScoreDesc.length; i += 1) {
      assignedRarities.set(byScoreDesc[cursor].sourceId, rarityName);
      cursor += 1;
    }
  }

  const rarityIdByName = new Map<DbRarityName, string>();
  for (const rarityName of RARITY_ORDER_ASC) {
    rarityIdByName.set(rarityName, await getRarityIdByName(rarityName));
  }

  let imported = 0;
  for (const entry of selected) {
    const { movie, sourceId, releaseYear, acceptedNames, rarityResult, displayName } = entry;
    const rarityName = assignedRarities.get(sourceId) ?? "Common";
    const rarityId = rarityIdByName.get(rarityName);
    if (!rarityId) {
      skipped += 1;
      continue;
    }

    const existingBySource = await prisma.card.findFirst({ where: { source: MOVIE_SOURCE, sourceId } });

    const baseCollision = await prisma.card.findUnique({ where: { name: displayName } });
    const preferredName = baseCollision && baseCollision.id !== existingBySource?.id
      ? `${displayName} (${releaseYear})`
      : displayName;
    const fallbackName = `${displayName} (${releaseYear}) [${movie.id}]`;

    if (existingBySource) {
      try {
        await prisma.card.update({
          where: { id: existingBySource.id },
          data: {
            name: preferredName,
            deckId,
            rarityId,
            imageUrl: `${TMDB_IMAGE_BASE}${movie.poster_path}`,
            description: movie.overview || "TMDB movie card",
            acceptedNames,
            source: MOVIE_SOURCE,
            sourceId,
            category: MOVIE_CATEGORY,
            releaseYear,
            rarityScore: rarityResult.rarityScore,
            rarityFactors: rarityResult.rarityFactors,
            spawnEnabled: true,
            blacklistReason: null,
            xpReward: getXpByRarity(rarityName),
            dropRate: getDropRateByRarity(rarityName)
          }
        });
      } catch (error) {
        if (error instanceof Error && error.message.includes("Unique constraint failed")) {
          await prisma.card.update({
            where: { id: existingBySource.id },
            data: {
              name: fallbackName,
              deckId,
              rarityId,
              imageUrl: `${TMDB_IMAGE_BASE}${movie.poster_path}`,
              description: movie.overview || "TMDB movie card",
              acceptedNames,
              source: MOVIE_SOURCE,
              sourceId,
              category: MOVIE_CATEGORY,
              releaseYear,
              rarityScore: rarityResult.rarityScore,
              rarityFactors: rarityResult.rarityFactors,
              spawnEnabled: true,
              blacklistReason: null,
              xpReward: getXpByRarity(rarityName),
              dropRate: getDropRateByRarity(rarityName)
            }
          });
        } else {
          throw error;
        }
      }
      imported++;
      continue;
    }

    try {
      await prisma.card.create({
        data: {
          name: preferredName,
          deckId,
          rarityId,
          imageUrl: `${TMDB_IMAGE_BASE}${movie.poster_path}`,
          description: movie.overview || "TMDB movie card",
          acceptedNames,
          source: MOVIE_SOURCE,
          sourceId,
          category: MOVIE_CATEGORY,
          releaseYear,
          rarityScore: rarityResult.rarityScore,
          rarityFactors: rarityResult.rarityFactors,
          spawnEnabled: true,
          blacklistReason: null,
          xpReward: getXpByRarity(rarityName),
          dropRate: getDropRateByRarity(rarityName)
        }
      });
    } catch (error) {
      if (error instanceof Error && error.message.includes("Unique constraint failed")) {
        await prisma.card.create({
          data: {
            name: fallbackName,
            deckId,
            rarityId,
            imageUrl: `${TMDB_IMAGE_BASE}${movie.poster_path}`,
            description: movie.overview || "TMDB movie card",
            acceptedNames,
            source: MOVIE_SOURCE,
            sourceId,
            category: MOVIE_CATEGORY,
            releaseYear,
            rarityScore: rarityResult.rarityScore,
            rarityFactors: rarityResult.rarityFactors,
            spawnEnabled: true,
            blacklistReason: null,
            xpReward: getXpByRarity(rarityName),
            dropRate: getDropRateByRarity(rarityName)
          }
        });
      } else {
        throw error;
      }
    }

    imported++;
  }

  console.log(`🎬 cinema_films import complete: imported=${imported}, blacklisted=${blacklisted}, skipped=${skipped}`);
  return { imported, blacklisted, skipped };
}
