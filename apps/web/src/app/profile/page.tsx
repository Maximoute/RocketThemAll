import { prisma } from "@rta/database";
import { AchievementService, levelRoleRange, MonetizationService } from "@rta/services";
import Link from "next/link";
import { requireUser } from "../../lib/guard";
import { FRAGMENT_CRAFT_COST, getUserFragmentBalances } from "../../lib/fragments";
import { getUserInventoryValue } from "../../lib/economy";
import DiscordAvatar from "../../components/discord-avatar";

const achievementService = new AchievementService();
const monetizationService = new MonetizationService();

export default async function ProfilePage() {
  const user = await requireUser();

  const [progress, boosters] = await Promise.all([
    prisma.userProgress.findUnique({ where: { userId: user.id } }),
    prisma.userBooster.findMany({ where: { userId: user.id } })
  ]);
  const playerLevel = progress?.level ?? user.level;
  const playerXp = progress?.xp ?? user.xp;
  const expectedLevelRole = levelRoleRange(playerLevel);
  const xpNeeded = Math.max(1, Math.floor(100 * Math.pow(Math.max(1, playerLevel), 1.5)));
  const boosterMap = new Map(boosters.map((b) => [b.boosterType, b.quantity]));
  const inventoryValue = await getUserInventoryValue(user.id);
  const transactions = await prisma.transactionLog.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    take: 12
  });
  const fragmentBalances = await getUserFragmentBalances(user.id);
  const achievements = await achievementService.getUserSummary(user.id);
  const supporterAccess = await monetizationService.getUserAccess(user.id);

  return (
    <div>
      {/* Header */}
      <div className="bg-gradient-to-br from-rta-surface to-rta-surface2 border border-rta-border rounded-2xl p-6 flex items-center gap-5 mb-4">
        <div className="w-16 h-16 rounded-full overflow-hidden bg-gradient-to-br from-rta-accent to-rta-success border-2 border-rta-cta shadow-[0_0_16px_rgba(242,130,65,0.4)] shrink-0">
          <DiscordAvatar
            avatarUrl={user.avatarUrl}
            discordId={user.discordId}
            username={user.username}
          />
        </div>
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl font-black tracking-tight truncate">{user.username}</h1>
          <p className="text-rta-muted text-sm mb-2">Discord</p>
          <div className="flex gap-2 flex-wrap">
            <span className="text-xs font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-rta-accentHi/20 text-purple-300 border border-rta-accentHi">
              Collectionneur
            </span>
            {supporterAccess.tier !== "FREE" && (
              <span className="text-xs font-black uppercase tracking-wider px-2 py-0.5 rounded-full bg-rta-gold/15 text-rta-gold border border-rta-gold">
                {supporterAccess.tier === "FOUNDER" ? "🌟 Fondateur" : "💎 VIP"}
              </span>
            )}
            <span className="text-xs font-black uppercase tracking-wider px-2 py-0.5 rounded-full bg-rta-gold/10 text-rta-gold border border-rta-gold/40">
              ⭐ Rôle {expectedLevelRole.label}
            </span>
          </div>
        </div>
        <span className="shrink-0 px-3 py-1.5 rounded-full bg-rta-cta/15 border border-rta-cta text-rta-cta font-black text-sm">
          ⚡ Niveau {playerLevel}
        </span>
      </div>

      {/* XP Bar */}
      <div className="bg-rta-surface border border-rta-border rounded-xl p-4 mb-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[0.68rem] uppercase tracking-widest text-rta-muted font-bold">XP · Niveau {playerLevel}</span>
          <span className="text-sm font-bold text-rta-cta">{playerXp.toLocaleString("fr-FR")} / {xpNeeded.toLocaleString("fr-FR")} XP</span>
        </div>
        <div className="h-2 bg-rta-bg rounded border border-rta-border overflow-hidden">
          <div
            className="h-full rounded bg-gradient-to-r from-rta-accent to-rta-cta"
            style={{ width: `${Math.min(100, Math.round((playerXp / xpNeeded) * 100))}%` }}
          />
        </div>
        <p className="text-[0.7rem] text-rta-muted mt-1.5">
          {Math.max(0, xpNeeded - playerXp).toLocaleString("fr-FR")} XP pour le niveau {playerLevel + 1} · formule: 100 × level^1.5
        </p>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
        {[
          { value: user.credits.toLocaleString("fr-FR"), label: "Crédits",   color: "text-rta-gold"    },
          { value: user.fragments,                        label: "Fragments", color: "text-purple-300"  },
          { value: inventoryValue,                        label: "Valeur inv.", color: "text-rta-success" },
        ].map(({ value, label, color }) => (
          <div key={label} className="bg-rta-bg/50 border border-rta-border rounded-lg p-3 text-center">
            <div className={`text-xl font-black ${color}`}>{value}</div>
            <div className="text-[0.62rem] uppercase tracking-widest text-rta-muted mt-0.5">{label}</div>
          </div>
        ))}
      </div>

      {/* Achievements */}
      <div className="bg-rta-surface border border-rta-border rounded-xl p-4 mb-4">
        <div className="flex items-center justify-between gap-3 mb-3">
          <h2 className="text-sm font-bold flex items-center gap-2">
            🏆 Achievements
          </h2>
          <Link
            href="/achievements"
            className="text-xs font-bold text-rta-cta hover:text-rta-gold transition-colors"
          >
            Voir les {achievements.total} achievements →
          </Link>
        </div>
        <div className="grid grid-cols-3 gap-2 mb-3">
          <div className="bg-rta-bg/50 border border-rta-border rounded-lg p-3 text-center">
            <div className="text-xl font-black text-rta-success">
              {achievements.unlocked}/{achievements.total}
            </div>
            <div className="text-[0.62rem] uppercase tracking-widest text-rta-muted">Débloqués</div>
          </div>
          <div className="bg-rta-bg/50 border border-rta-border rounded-lg p-3 text-center">
            <div className="text-xl font-black text-rta-gold">{achievements.points}</div>
            <div className="text-[0.62rem] uppercase tracking-widest text-rta-muted">Points</div>
          </div>
          <div className="bg-rta-bg/50 border border-rta-border rounded-lg p-3 text-center">
            <div className="text-xl font-black text-purple-300">
              {achievements.completionPercent} %
            </div>
            <div className="text-[0.62rem] uppercase tracking-widest text-rta-muted">Complétion</div>
          </div>
        </div>
        <div className="h-2 bg-rta-bg rounded border border-rta-border overflow-hidden mb-3">
          <div
            className="h-full rounded bg-gradient-to-r from-rta-accentHi to-rta-success"
            style={{ width: `${achievements.completionPercent}%` }}
          />
        </div>
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <span className="text-xs font-black text-rta-gold">🏅 Badges Discord :</span>
          {achievements.selectedBadges.length > 0 ? (
            achievements.selectedBadges.map((badge) => (
              <span
                key={badge.id}
                className="rounded-full border border-rta-gold/40 bg-rta-gold/10 px-2 py-1 text-xs text-rta-gold"
              >
                {badge.name}
              </span>
            ))
          ) : (
            <Link href="/achievements" className="text-xs font-bold text-rta-cta">
              Choisir jusqu&apos;à 3 badges →
            </Link>
          )}
        </div>
        {achievements.latestUnlocked.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {achievements.latestUnlocked.slice(0, 3).map((achievement) => (
              <span
                key={achievement.id}
                className="text-xs px-2 py-1 rounded bg-rta-success/10 border border-rta-success/40 text-rta-success"
              >
                ✅ {achievement.name} · {achievement.points} pts
              </span>
            ))}
          </div>
        ) : (
          <p className="text-xs text-rta-muted">
            Joue normalement : tes explorations, captures, collections, quêtes et échanges
            feront progresser les achievements automatiquement.
          </p>
        )}
      </div>

      {/* Boosters */}
      <div className="bg-rta-surface border border-rta-border rounded-xl p-4 mb-4">
        <h2 className="text-sm font-bold mb-3 flex items-center gap-2 after:flex-1 after:h-px after:bg-rta-surface2">
          🎁 Boosters en stock
        </h2>
        <div className="flex gap-3 flex-wrap">
          {(["basic", "rare", "epic", "legendary"] as const).map((type) => (
            <div key={type} className="bg-rta-bg/50 border border-rta-border rounded-lg px-4 py-2 text-center">
              <div className="text-lg font-black text-rta-gold">{boosterMap.get(type) ?? 0}</div>
              <div className="text-[0.65rem] uppercase tracking-wider text-rta-muted capitalize">{type}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Fragments */}
      <div className="bg-rta-surface border border-rta-border rounded-xl p-4 mb-4">
        <h2 className="text-sm font-bold mb-3 flex items-center gap-2 after:flex-1 after:h-px after:bg-rta-surface2">
          🔮 Fragments par tier
        </h2>
        <p className="text-xs text-rta-muted mb-3">
          {FRAGMENT_CRAFT_COST} fragments du tier inférieur = 1 carte du tier supérieur
        </p>
        <div className="flex gap-2 flex-wrap">
          {fragmentBalances.map((row) => (
            <span key={row.rarityName} className="text-xs px-2 py-1 rounded bg-rta-bg/50 border border-rta-border text-rta-ink">
              {row.rarityName}: <strong className="text-rta-success">{row.quantity}</strong>
            </span>
          ))}
        </div>
      </div>

      {/* Recent transactions */}
      <div className="bg-rta-surface border border-rta-border rounded-xl p-4 mb-4">
        <h2 className="text-sm font-bold mb-3 flex items-center gap-2 after:flex-1 after:h-px after:bg-rta-surface2">
          💰 Historique économique
        </h2>
        {transactions.length === 0 ? (
          <p className="text-rta-muted text-sm">Aucune transaction.</p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {transactions.map((tx) => (
              <li key={tx.id} className="flex justify-between text-xs text-rta-muted border-b border-rta-surface2 pb-1.5">
                <span className="capitalize text-rta-ink">{tx.type}</span>
                <span>{tx.createdAt.toLocaleString("fr-FR")}</span>
                <span className={tx.amount >= 0 ? "text-rta-success font-bold" : "text-rta-cta font-bold"}>
                  {tx.amount >= 0 ? "+" : ""}{tx.amount}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

    </div>
  );
}


