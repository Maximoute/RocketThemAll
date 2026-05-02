import axios from "axios";
import { prisma } from "@rta/database";
import { getRarityIdByName, getDropRate, getXpReward } from "./src/rarityService";

const WAIFU_API_URL = "https://api.waifu.im/search";
const WAIFU_TAG = "waifu";
const REQUEST_LIMIT = 20;
const REQUEST_DELAY_MS = 200;
const MAX_RETRIES = 3;

type WaifuTag = {
  name?: string;
};

type WaifuArtist = {
  name?: string;
};

type WaifuImage = {
  image_id: number;
  url: string;
  source?: string;
  width?: number;
  height?: number;
  tags?: WaifuTag[];
  artist?: WaifuArtist;
};

type WaifuApiResponse = {
  images: WaifuImage[];
};

export type WaifuImportLog = {
  type: "waifu";
  imported: number;
  skipped: number;
  failed: number;
  createdAt: string;
};

const WEIGHTED_RARITIES: Array<{ name: "Common" | "Uncommon" | "Rare" | "Exotic" | "Black Market"; weight: number }> = [
  { name: "Common", weight: 0.6 },
  { name: "Uncommon", weight: 0.25 },
  { name: "Rare", weight: 0.1 },
  { name: "Exotic", weight: 0.04 },
  { name: "Black Market", weight: 0.01 }
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
        await sleep(200 * attempt);
      }
    }
  }
  throw lastError instanceof Error ? lastError : new Error(`${context} failed after retries`);
}

function chooseWeightedRarity() {
  const roll = Math.random();
  let acc = 0;
  for (const rarity of WEIGHTED_RARITIES) {
    acc += rarity.weight;
    if (roll <= acc) return rarity.name;
  }
  return "Common" as const;
}

function formatWaifuName(index: number): string {
  return `Waifu #${String(index).padStart(3, "0")}`;
}

export async function transformWaifuToCard(image: WaifuImage, waifuIndex: number) {
  const rarityName = chooseWeightedRarity();
  const rarityId = await getRarityIdByName(rarityName);
  const artistName = image.artist?.name?.trim();
  const tags = (image.tags ?? [])
    .map((tag) => tag.name?.trim())
    .filter((tag): tag is string => Boolean(tag));

  const descriptionParts = ["Anime waifu card"];
  if (artistName) descriptionParts.push(`Artist: ${artistName}`);
  if (image.source) descriptionParts.push(`Source: ${image.source}`);
  if (tags.length > 0) descriptionParts.push(`Tags: ${tags.slice(0, 5).join(", ")}`);

  return {
    name: formatWaifuName(waifuIndex),
    deck: "pop",
    category: "anime",
    rarityId,
    imageUrl: image.url,
    description: descriptionParts.join(" | "),
    xpReward: getXpReward(rarityName),
    dropRate: getDropRate(rarityName),
    source: "waifu.im",
    sourceId: String(image.image_id),
    metadata: {
      imageCredit: artistName ?? null,
      width: image.width ?? null,
      height: image.height ?? null,
      source: image.source ?? null,
      tags
    }
  };
}

async function fetchWaifuBatch(): Promise<WaifuImage[]> {
  const response = await withRetry(
    () => axios.get<WaifuApiResponse>(WAIFU_API_URL, {
      params: {
        included_tags: WAIFU_TAG,
        limit: REQUEST_LIMIT
      },
      timeout: 10000
    }),
    "waifu.im search"
  );

  return response.data.images ?? [];
}

async function getPopDeckId(): Promise<string> {
  const deck = await prisma.deck.findFirst({
    where: {
      OR: [
        { name: "Pop Culture" },
        { name: "pop" },
        { name: "Pop" }
      ]
    }
  });

  if (!deck) {
    throw new Error("Deck pop introuvable (attendu: Pop Culture)");
  }

  return deck.id;
}

export async function importWaifus(targetCount = 100): Promise<WaifuImportLog> {
  const maxCount = Math.min(Math.max(targetCount, 1), 100);
  const deckId = await getPopDeckId();

  const existingCount = await prisma.card.count({ where: { source: "waifu.im" } });
  let nextIndex = existingCount + 1;

  let imported = 0;
  let skipped = 0;
  let failed = 0;
  let guardRequests = 0;

  console.log(`[waifu] Import start target=${maxCount}`);

  while (imported < maxCount && guardRequests < 30) {
    guardRequests++;
    let images: WaifuImage[] = [];

    try {
      images = await fetchWaifuBatch();
    } catch (error) {
      failed++;
      console.error("[waifu] API fetch failed:", error instanceof Error ? error.message : error);
      await sleep(REQUEST_DELAY_MS);
      continue;
    }

    for (const image of images) {
      if (imported >= maxCount) break;
      if (!image?.image_id || !image?.url) {
        failed++;
        continue;
      }

      const sourceId = String(image.image_id);
      const exists = await prisma.card.findFirst({
        where: { source: "waifu.im", sourceId },
        select: { id: true }
      });

      if (exists) {
        skipped++;
        continue;
      }

      try {
        const transformed = await transformWaifuToCard(image, nextIndex);
        nextIndex++;

        await prisma.card.create({
          data: {
            name: transformed.name,
            deckId,
            rarityId: transformed.rarityId,
            imageUrl: transformed.imageUrl,
            description: transformed.description,
            xpReward: transformed.xpReward,
            dropRate: transformed.dropRate,
            source: transformed.source,
            sourceId: transformed.sourceId,
            category: transformed.category
          }
        });

        imported++;
      } catch (error) {
        failed++;
        console.error("[waifu] create failed:", error instanceof Error ? error.message : error);
      }
    }

    await sleep(REQUEST_DELAY_MS);
  }

  const log: WaifuImportLog = {
    type: "waifu",
    imported,
    skipped,
    failed,
    createdAt: new Date().toISOString()
  };

  console.log(`[waifu] done imported=${imported} skipped=${skipped} failed=${failed}`);
  return log;
}
