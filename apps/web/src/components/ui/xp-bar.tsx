type Props = { current: number; max: number; level: number };

export default function XpBar({ current, max, level }: Props) {
  const pct = Math.min(100, Math.round((current / max) * 100));
  return (
    <div className="bg-rta-surface border border-rta-border rounded-xl p-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[0.68rem] uppercase tracking-widest text-rta-muted font-bold">
          XP · Niveau {level}
        </span>
        <span className="text-sm font-bold text-rta-cta">
          {current.toLocaleString("fr-FR")} / {max.toLocaleString("fr-FR")} XP
        </span>
      </div>
      <div className="h-2 bg-rta-bg rounded border border-rta-border overflow-hidden">
        <div
          className="h-full rounded bg-gradient-to-r from-rta-accent to-rta-cta transition-all duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>
      <p className="text-[0.7rem] text-rta-muted mt-1.5">
        {(max - current).toLocaleString("fr-FR")} XP pour le niveau {level + 1}
      </p>
    </div>
  );
}
