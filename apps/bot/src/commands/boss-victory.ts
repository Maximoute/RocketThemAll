function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function positiveInteger(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.floor(parsed)) : 0;
}

function rewardItemLabel(value: unknown) {
  const drop = record(value);
  const itemKey = typeof drop.itemKey === "string" ? drop.itemKey : "";
  const tier = itemKey.split(".").at(-1) ?? "common";
  const tierLabel = {
    common: "Commun",
    uncommon: "Peu commun",
    rare: "Rare",
    epic: "Épique",
    legendary: "Légendaire",
    mythic: "Mythique"
  }[tier] ?? tier;

  if (drop.type === "booster") return `Booster ${tierLabel}`;
  if (drop.type === "chest") return `Coffre ${tierLabel}`;
  return itemKey || "Objet de conquérant";
}

export function bossVictoryRewardDescription(value: unknown) {
  const reward = record(value);
  const credits = positiveInteger(reward.credits);
  const xp = positiveInteger(reward.xp);
  const fragments = positiveInteger(reward.fragments);
  const drops = Array.isArray(reward.conquerorDrops)
    ? reward.conquerorDrops.map(rewardItemLabel)
    : [];
  const bonus = typeof reward.bonus === "string" && reward.bonus.trim()
    ? reward.bonus.trim()
    : null;

  return [
    `💳 **${credits} crédits** · ⭐ **${xp} XP** · 🧩 **${fragments} fragment(s)**`,
    drops.length > 0
      ? `🎁 Objet(s) obtenu(s) : **${drops.join(", ")}**`
      : "🎲 Objet de conquérant : **aucun sur ce jet**",
    ...(bonus ? [`✨ Bonus : **${bonus}**`] : [])
  ].join("\n");
}
