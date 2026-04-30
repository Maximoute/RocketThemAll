import type { RarityName } from "./types.js";

export const RARITIES: Readonly<RarityName[]> = [
  "Common",
  "Uncommon",
  "Rare",
  "Very Rare",
  "Import",
  "Exotic",
  "Black Market",
  "Limited"
];

export const DECKS = ["Rocket League-like", "Pop Culture", "Pokemon"] as const;

export const DEFAULT_XP_BY_RARITY: Record<RarityName, number> = {
  Common: 10,
  Uncommon: 20,
  Rare: 40,
  "Very Rare": 70,
  Import: 110,
  Exotic: 160,
  "Black Market": 250,
  Limited: 300
};

export const BOOSTER_SLOTS = {
  common: 3,
  uncommon: 1,
  rareOrBetter: 1
} as const;
