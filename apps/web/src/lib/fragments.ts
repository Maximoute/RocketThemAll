import { prisma } from "@rta/database";

export const FRAGMENT_CRAFT_COST = 50;

export const FRAGMENT_CHAIN = [
  "Common",
  "Uncommon",
  "Rare",
  "Very Rare",
  "Import",
  "Exotic",
  "Black Market"
] as const;

export type FragmentRarity = (typeof FRAGMENT_CHAIN)[number];

export function getSourceRarityForTarget(targetRarity: FragmentRarity): FragmentRarity | null {
  const idx = FRAGMENT_CHAIN.indexOf(targetRarity);
  if (idx <= 0) return null;
  return FRAGMENT_CHAIN[idx - 1];
}

export async function getUserFragmentBalances(userId: string) {
  const balances = await prisma.fragmentBalance.findMany({
    where: { userId },
    include: { rarity: true }
  });

  return FRAGMENT_CHAIN.map((rarityName) => {
    const found = balances.find((b) => b.rarity.name === rarityName);
    return {
      rarityName,
      quantity: found?.quantity ?? 0
    };
  });
}
