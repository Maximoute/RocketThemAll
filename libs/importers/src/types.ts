import type { Rarity } from "@prisma/client";

export interface RawCard {
  name: string;
  imageUrl: string;
  description?: string;
  source: string;
  sourceId?: string;
  popularity?: number;
  isLegendary?: boolean;
  isStarter?: boolean;
}

export interface Card {
  name: string;
  deck: "Pokemon" | "Pop Culture" | "Rocket League-like";
  rarityId: string;
  imageUrl: string;
  description?: string;
  xpReward: number;
  dropRate: number;
  source: string;
  sourceId?: string;
}

export interface ImportLog {
  type: "POKEMON" | "MOVIES" | "GAMES" | "POP";
  status: "PENDING" | "SUCCESS" | "ERROR";
  count: number;
  error?: string;
  createdAt: Date;
}

export interface RarityConfig {
  name: string;
  xpReward: number;
  dropRate: number;
}
