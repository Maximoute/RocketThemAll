import { prisma } from "@rta/database";

export const SELL_PRICE_KEYS = {
  Common: "commonSellPrice",
  Uncommon: "uncommonSellPrice",
  Rare: "rareSellPrice",
  "Very Rare": "veryRareSellPrice",
  Import: "importSellPrice",
  Exotic: "exoticSellPrice",
  "Black Market": "blackMarketSellPrice"
} as const;

export const RECYCLE_PRICE_KEYS = {
  Common: "commonRecyclePrice",
  Uncommon: "uncommonRecyclePrice",
  Rare: "rareRecyclePrice",
  "Very Rare": "veryRareRecyclePrice",
  Import: "importRecyclePrice",
  Exotic: "exoticRecyclePrice",
  "Black Market": "blackMarketRecyclePrice"
} as const;

export const FRAGMENT_REWARD_KEYS = {
  Common: "commonFragmentReward",
  Uncommon: "uncommonFragmentReward",
  Rare: "rareFragmentReward",
  "Very Rare": "veryRareFragmentReward",
  Import: "importFragmentReward",
  Exotic: "exoticFragmentReward",
  "Black Market": "blackMarketFragmentReward"
} as const;

export async function getEconomyConfig() {
  return prisma.appConfig.upsert({
    where: { id: "default" },
    update: {},
    create: {
      id: "default"
    }
  });
}

export function getSellPrice(config: Awaited<ReturnType<typeof getEconomyConfig>>, rarityName: keyof typeof SELL_PRICE_KEYS) {
  return config[SELL_PRICE_KEYS[rarityName]] as number;
}

export function getRecyclePrice(config: Awaited<ReturnType<typeof getEconomyConfig>>, rarityName: keyof typeof RECYCLE_PRICE_KEYS) {
  return config[RECYCLE_PRICE_KEYS[rarityName]] as number;
}

export function getFragmentReward(config: Awaited<ReturnType<typeof getEconomyConfig>>, rarityName: keyof typeof FRAGMENT_REWARD_KEYS) {
  return config[FRAGMENT_REWARD_KEYS[rarityName]] as number;
}