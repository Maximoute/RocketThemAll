import { createSeededRandom, sampleUniqueIndices } from "./random.js";
import { DAILY_QUEST_COUNT } from "./content-rules.js";

const DAY_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function selectDailyQuestIndices(
  userId: string,
  dayKey: string,
  templateCount: number,
  count = DAILY_QUEST_COUNT
): number[] {
  if (userId.length === 0) {
    throw new RangeError("User ID must not be empty");
  }
  if (!DAY_KEY_PATTERN.test(dayKey)) {
    throw new RangeError("Day key must use YYYY-MM-DD");
  }

  return sampleUniqueIndices(
    templateCount,
    count,
    createSeededRandom(`daily-quests:v1:${userId}:${dayKey}`)
  );
}
