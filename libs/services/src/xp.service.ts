import { DEFAULT_XP_BY_RARITY } from "@rta/shared";

export function xpRequired(level: number): number {
  return Math.floor(100 * Math.pow(level, 1.5));
}

export function xpForRarity(rarity: keyof typeof DEFAULT_XP_BY_RARITY): number {
  return DEFAULT_XP_BY_RARITY[rarity];
}

export function applyXpGain(level: number, currentXp: number, gainedXp: number): { level: number; xp: number; levelsGained: number } {
  let newLevel = level;
  let xp = currentXp + gainedXp;
  let levelsGained = 0;

  while (xp >= xpRequired(newLevel)) {
    xp -= xpRequired(newLevel);
    newLevel += 1;
    levelsGained += 1;
  }

  return { level: newLevel, xp, levelsGained };
}
