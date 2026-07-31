import { randomValue, type RandomSource } from "./random.js";

export type PreparationLevel = "none" | "partial" | "complete";

export interface CaptureChanceInput {
  readonly answerCorrect: boolean;
  readonly preparation: PreparationLevel;
  readonly progressionBonus: number;
  readonly targetPenalty: number;
}

const PREPARATION_BONUS: Readonly<Record<PreparationLevel, number>> = {
  none: 0,
  partial: 3,
  complete: 7
};

function assertIntegerBetween(name: string, value: number, minimum: number, maximum: number): void {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new RangeError(`${name} must be an integer between ${minimum} and ${maximum}; received ${value}`);
  }
}

export function calculateCaptureChance(input: CaptureChanceInput): number {
  assertIntegerBetween("progressionBonus", input.progressionBonus, 0, 3);
  assertIntegerBetween("targetPenalty", input.targetPenalty, 0, 20);

  if (input.answerCorrect) {
    return 95;
  }

  const rawChance =
    25 +
    PREPARATION_BONUS[input.preparation] +
    input.progressionBonus -
    input.targetPenalty;

  return Math.min(99.5, Math.max(5, rawChance));
}

export function rollCapture(chancePercent: number, random: RandomSource): boolean {
  if (!Number.isFinite(chancePercent) || chancePercent < 5 || chancePercent > 99.5) {
    throw new RangeError(`Capture chance must be between 5 and 99.5; received ${chancePercent}`);
  }
  return randomValue(random) * 100 < chancePercent;
}
