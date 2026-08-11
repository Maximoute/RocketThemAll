export type ServerRankingInput = {
  name: string;
  unlockedWorldCount: number;
  mastery: number;
  masteryTarget: number;
};

export function serverProgressPercent(mastery: number, target: number) {
  if (!Number.isFinite(mastery) || !Number.isFinite(target) || target <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((mastery / target) * 100)));
}

export function serverProgressBar(percent: number, slots = 10) {
  const safePercent = Math.max(0, Math.min(100, Math.round(percent)));
  const filled = Math.round((safePercent / 100) * slots);
  return `${"█".repeat(filled)}${"░".repeat(slots - filled)} ${safePercent} %`;
}

export function rankServerEntries<T extends ServerRankingInput>(entries: T[]) {
  return entries
    .map((entry) => {
      const percent = serverProgressPercent(entry.mastery, entry.masteryTarget);
      const completedWorlds = Math.max(0, entry.unlockedWorldCount - 1);
      return { ...entry, percent, score: completedWorlds * 100 + percent };
    })
    .sort((left, right) => right.score - left.score
      || right.unlockedWorldCount - left.unlockedWorldCount
      || right.mastery - left.mastery
      || left.name.localeCompare(right.name, "fr"))
    .map((entry, index) => ({ ...entry, rank: index + 1 }));
}
