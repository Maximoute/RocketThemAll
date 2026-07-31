export function retryDelayMs(attempt: number, baseMs = 5_000, maximumMs = 3_600_000): number {
  if (!Number.isSafeInteger(attempt) || attempt < 1) {
    throw new RangeError("Attempt must be a positive safe integer");
  }
  if (!Number.isSafeInteger(baseMs) || baseMs < 1) {
    throw new RangeError("Base delay must be a positive safe integer");
  }
  if (!Number.isSafeInteger(maximumMs) || maximumMs < baseMs) {
    throw new RangeError("Maximum delay must be a safe integer greater than the base delay");
  }

  return Math.min(maximumMs, baseMs * 2 ** Math.min(attempt - 1, 30));
}
