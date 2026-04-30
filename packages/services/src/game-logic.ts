import { BOOSTER_SLOTS } from "@rta/shared";

export function countBoosterSlots() {
  return BOOSTER_SLOTS.common + BOOSTER_SLOTS.uncommon + BOOSTER_SLOTS.rareOrBetter;
}

export function canCapture(lastTryMs: number, nowMs: number, cooldownS: number) {
  return nowMs - lastTryMs >= cooldownS * 1000;
}

export function canTrade(inventoryQty: number, tradeQty: number) {
  return inventoryQty >= tradeQty && tradeQty > 0;
}

export function nextInventoryQty(current: number, delta: number) {
  const result = current + delta;
  return result < 0 ? 0 : result;
}
