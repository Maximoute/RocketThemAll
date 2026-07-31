export const GUARDIAN_BASE_TARGETS = [250, 450, 700, 1_000, 1_350, 1_750, 2_200, 2_700] as const;

export function guardianActivityMultiplier(activePlayers: number): number {
  if (!Number.isSafeInteger(activePlayers) || activePlayers < 0) {
    throw new RangeError("Active players must be a non-negative safe integer");
  }
  return Math.min(2.5, Math.max(0.75, 0.75 + Math.sqrt(activePlayers) / 5));
}

export function calculateGuardianTarget(baseTarget: number, activePlayers: number): number {
  if (!Number.isSafeInteger(baseTarget) || baseTarget <= 0) {
    throw new RangeError("Base target must be a positive safe integer");
  }
  return Math.ceil(baseTarget * guardianActivityMultiplier(activePlayers));
}
