export type RandomSource = () => number;

function assertRandomValue(value: number): void {
  if (!Number.isFinite(value) || value < 0 || value >= 1) {
    throw new RangeError(`Random source must return a finite value in [0, 1); received ${value}`);
  }
}

export function randomValue(random: RandomSource): number {
  const value = random();
  assertRandomValue(value);
  return value;
}

export function createSeededRandom(seed: string): RandomSource {
  if (seed.length === 0) {
    throw new RangeError("Seed must not be empty");
  }

  let state = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    state ^= seed.charCodeAt(index);
    state = Math.imul(state, 16777619);
  }

  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

export interface WeightedValue<T> {
  readonly value: T;
  readonly weight: number;
}

export function weightedPick<T>(entries: readonly WeightedValue<T>[], random: RandomSource): T {
  if (entries.length === 0) {
    throw new RangeError("At least one weighted value is required");
  }

  let total = 0;
  for (const entry of entries) {
    if (!Number.isFinite(entry.weight) || entry.weight <= 0) {
      throw new RangeError(`Weights must be finite and positive; received ${entry.weight}`);
    }
    total += entry.weight;
  }

  if (!Number.isSafeInteger(total)) {
    throw new RangeError("The total weight must be a safe integer");
  }

  const target = randomValue(random) * total;
  let cursor = 0;
  for (const entry of entries) {
    cursor += entry.weight;
    if (target < cursor) {
      return entry.value;
    }
  }

  return entries[entries.length - 1]!.value;
}

export function sampleUniqueIndices(total: number, count: number, random: RandomSource): number[] {
  if (!Number.isSafeInteger(total) || total < 0) {
    throw new RangeError("Total must be a non-negative safe integer");
  }
  if (!Number.isSafeInteger(count) || count < 0 || count > total) {
    throw new RangeError("Count must be a safe integer between zero and total");
  }

  const candidates = Array.from({ length: total }, (_, index) => index);
  for (let index = 0; index < count; index += 1) {
    const offset = Math.floor(randomValue(random) * (total - index));
    const selectedIndex = index + offset;
    [candidates[index], candidates[selectedIndex]] = [candidates[selectedIndex]!, candidates[index]!];
  }
  return candidates.slice(0, count);
}
