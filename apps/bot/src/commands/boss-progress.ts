export function bossProgressPercent(progress: number, target: number) {
  const safeProgress = Number.isFinite(progress) ? Math.max(0, progress) : 0;
  const safeTarget = Number.isFinite(target) ? Math.max(0, target) : 0;

  if (safeTarget === 0) return 0;

  return Math.round(Math.min(1, safeProgress / safeTarget) * 100);
}

export function bossProgressBar(
  progress: number,
  target: number,
  segments = 12
) {
  const safeSegments = Math.max(1, Math.floor(segments));
  const percent = bossProgressPercent(progress, target);
  const filled = Math.round((percent / 100) * safeSegments);

  return `${"█".repeat(filled)}${"░".repeat(safeSegments - filled)} ${percent} %`;
}
