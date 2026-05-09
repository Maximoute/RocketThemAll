import { getServerSession } from "next-auth";
import { authOptions } from "../../lib/auth";
import { prisma } from "@rta/database";
import { getSpawnEnergySnapshot } from "../../lib/spawn-energy";
import { redirect } from "next/navigation";
import { FRAGMENT_CRAFT_COST, getUserFragmentBalances } from "../../lib/fragments";
import { getUserInventoryValue } from "../../lib/economy";

function formatDuration(ms: number | null) {
  if (ms === null || ms <= 0) {
    return "Aucune (charges pleines)";
  }

  const totalMinutes = Math.ceil(ms / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${hours}h ${minutes}m`;
}

export default async function ProfilePage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.name) {
    redirect("/login");
  }

  const user = await prisma.user.findFirst({ where: { username: session.user.name } });
  if (!user) {
    return <section className="card">Utilisateur introuvable</section>;
  }

  const xpNeeded = Math.floor(100 * Math.pow(user.level, 1.5));
  const energy = await getSpawnEnergySnapshot(user.id);
  const recentSpawns = await prisma.spawnLog.findMany({
    where: { userId: user.id },
    include: { card: true },
    orderBy: { createdAt: "desc" },
    take: 10
  });
  const boosters = await prisma.userBooster.findMany({ where: { userId: user.id } });
  const boosterMap = new Map(boosters.map((b) => [b.boosterType, b.quantity]));
  const inventoryValue = await getUserInventoryValue(user.id);
  const transactions = await prisma.transactionLog.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    take: 12
  });
  const fragmentBalances = await getUserFragmentBalances(user.id);

  return (
    <div>
      {/* Header */}
      <div className="bg-gradient-to-br from-rta-surface to-rta-surface2 border border-rta-border rounded-2xl p-6 flex items-center gap-5 mb-4">
        <div className="w-16 h-16 rounded-full bg-gradient-to-br from-rta-accent to-rta-success flex items-center justify-center text-2xl border-2 border-rta-cta shadow-[0_0_16px_rgba(242,130,65,0.4)] shrink-0">
          👤
        </div>
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl font-black tracking-tight truncate">{user.username}</h1>
          <p className="text-rta-muted text-sm mb-2">Discord</p>
          <div className="flex gap-2 flex-wrap">
            <span className="text-xs font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-rta-accentHi/20 text-purple-300 border border-rta-accentHi">
              Collectionneur
            </span>
          </div>
        </div>
        <span className="shrink-0 px-3 py-1.5 rounded-full bg-rta-cta/15 border border-rta-cta text-rta-cta font-black text-sm">
          ⚡ Niveau {user.level}
        </span>
      </div>

      {/* XP Bar */}
      <div className="bg-rta-surface border border-rta-border rounded-xl p-4 mb-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[0.68rem] uppercase tracking-widest text-rta-muted font-bold">XP · Niveau {user.level}</span>
          <span className="text-sm font-bold text-rta-cta">{user.xp.toLocaleString("fr-FR")} / {xpNeeded.toLocaleString("fr-FR")} XP</span>
        </div>
        <div className="h-2 bg-rta-bg rounded border border-rta-border overflow-hidden">
          <div
            className="h-full rounded bg-gradient-to-r from-rta-accent to-rta-cta"
            style={{ width: `${Math.min(100, Math.round((user.xp / xpNeeded) * 100))}%` }}
          />
        </div>
        <p className="text-[0.7rem] text-rta-muted mt-1.5">
          {(xpNeeded - user.xp).toLocaleString("fr-FR")} XP pour le niveau {user.level + 1} · formule: 100 × level^1.5
        </p>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
        {[
          { value: user.credits.toLocaleString("fr-FR"), label: "Crédits",   color: "text-rta-gold"    },
          { value: user.fragments,                        label: "Fragments", color: "text-purple-300"  },
          { value: inventoryValue,                        label: "Valeur inv.", color: "text-rta-success" },
          { value: `${energy.charges}/${energy.maxCharges}`, label: "Charges", color: "text-rta-cta"   },
        ].map(({ value, label, color }) => (
          <div key={label} className="bg-rta-bg/50 border border-rta-border rounded-lg p-3 text-center">
            <div className={`text-xl font-black ${color}`}>{value}</div>
            <div className="text-[0.62rem] uppercase tracking-widest text-rta-muted mt-0.5">{label}</div>
          </div>
        ))}
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

      {/* Energy */}
      <div className="bg-rta-surface border border-rta-border rounded-xl p-4 mb-4">
        <h2 className="text-sm font-bold mb-2 flex items-center gap-2 after:flex-1 after:h-px after:bg-rta-surface2">
          ⚡ Énergie spawn
        </h2>
        <p className="text-sm text-rta-muted">
          Prochaine recharge : <span className="text-rta-cta font-bold">{formatDuration(energy.nextChargeInMs)}</span>
        </p>
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

      {/* Recent spawns */}
      <div className="bg-rta-surface border border-rta-border rounded-xl p-4">
        <h2 className="text-sm font-bold mb-3 flex items-center gap-2 after:flex-1 after:h-px after:bg-rta-surface2">
          🃏 Derniers spawns
        </h2>
        {recentSpawns.length === 0 ? (
          <p className="text-rta-muted text-sm">Aucun spawn.</p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {recentSpawns.map((spawn) => (
              <li key={spawn.id} className="flex justify-between text-xs text-rta-muted border-b border-rta-surface2 pb-1.5">
                <span className="text-rta-ink font-medium">{spawn.card.name}</span>
                <span className="capitalize">{spawn.spawnType}</span>
                <span>{spawn.createdAt.toLocaleString("fr-FR")}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}


