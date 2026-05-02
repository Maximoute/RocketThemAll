/**
 * Nekos.best importer — images neko (anime girl cat)
 * https://nekos.best/api/v2
 * Max 20 résultats par requête — pas de clé API requise
 */
import axios from "axios";
import { prisma } from "@rta/database";
import { z } from "zod";
import { getRarityIdByName } from "../src/rarityService";

const NEKOS_BASE = "https://nekos.best/api/v2";
const REQUEST_DELAY_MS = 300;
const BATCH_SIZE = 20; // max par requête
const MAX_IMPORT_LIMIT = 100;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function pickRarity(): "Common" | "Uncommon" | "Rare" | "Very Rare" | "Exotic" | "Black Market" {
  const r = Math.random();
  if (r < 0.01) return "Black Market";
  if (r < 0.05) return "Exotic";
  if (r < 0.15) return "Very Rare";
  if (r < 0.30) return "Rare";
  if (r < 0.55) return "Uncommon";
  return "Common";
}

const rarityXp: Record<string, number> = {
  Common: 10, Uncommon: 20, Rare: 40, "Very Rare": 70, Exotic: 160, "Black Market": 250
};
const rarityDrop: Record<string, number> = {
  Common: 0.6, Uncommon: 0.25, Rare: 0.1, "Very Rare": 0.07, Exotic: 0.04, "Black Market": 0.01
};

interface NekosResult {
  url: string;
  anime_name: string;
  artist_name: string;
  source_url: string;
}

const nekosResultSchema = z.object({
  url: z.string().url(),
  anime_name: z.string().optional().default("Neko"),
  artist_name: z.string().optional().default(""),
  source_url: z.string().url().optional().default("")
}).strict();

export async function importNekos(targetCount = 100): Promise<number> {
  const safeTargetCount = Math.max(1, Math.min(targetCount, MAX_IMPORT_LIMIT));
  const deck = await prisma.deck.findUnique({ where: { name: "Pop Culture" } });
  if (!deck) throw new Error("Deck 'Pop Culture' not found");

  let imported = 0;
  let counter = 0;

  while (imported < safeTargetCount) {
    const remaining = safeTargetCount - imported;
    const amount = Math.min(remaining, BATCH_SIZE);

    let results: NekosResult[];
    try {
      const response = await axios.get<{ results: NekosResult[] }>(
        `${NEKOS_BASE}/neko?amount=${amount}`,
        { timeout: 10000 }
      );
      const parsed = z.array(nekosResultSchema).safeParse(response.data.results ?? []);
      results = parsed.success ? parsed.data : [];
    } catch (err) {
      console.error("[nekos] Erreur API:", err instanceof Error ? err.message : err);
      break;
    }

    if (results.length === 0) break;

    for (const item of results) {
      if (imported >= safeTargetCount) break;

      // sourceId basé sur le nom de fichier dans l'URL
      const fileName = item.url.split("/").pop()?.replace(/\.[^.]+$/, "") ?? "";
      const sourceId = `nekos-${fileName}`;

      // Anti-doublon
      const existing = await prisma.card.findFirst({
        where: { source: "nekos.best", sourceId },
      });
      if (existing) continue;

      counter++;
      const animeName = item.anime_name || "Neko";
      const cardName = `${animeName} #${String(counter).padStart(3, "0")}`;
      const rarityName = pickRarity();
      const rarityId = await getRarityIdByName(rarityName);

      await prisma.card.create({
        data: {
          name: cardName,
          description: item.artist_name
            ? `Art par ${item.artist_name} — ${animeName}`
            : animeName,
          imageUrl: item.url,
          category: "anime",
          source: "nekos.best",
          sourceId,
          deckId: deck.id,
          rarityId,
          xpReward: rarityXp[rarityName] ?? 10,
          dropRate: rarityDrop[rarityName] ?? 0.6,
        },
      });

      imported++;
    }

    console.log(`[nekos] ${imported}/${safeTargetCount} cartes importées`);

    if (imported < safeTargetCount) {
      await sleep(REQUEST_DELAY_MS);
    }
  }

  console.log(`[nekos] Import terminé : ${imported} cartes ajoutées`);
  return imported;
}
