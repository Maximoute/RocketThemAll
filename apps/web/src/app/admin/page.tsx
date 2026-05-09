import { requireAdmin } from "../../lib/guard";
import { prisma } from "@rta/database";

export default async function AdminHomePage() {
  await requireAdmin();
  const [cardCount, userCount, tradeCount, activeSpawnCount, recentLogs] = await Promise.all([
    prisma.card.count(),
    prisma.user.count(),
    prisma.trade.count(),
    prisma.spawnLog.count({ where: { status: "active" } }),
    prisma.adminLog.findMany({ include: { admin: true }, orderBy: { createdAt: "desc" }, take: 8 })
  ]);

  return (
    <div>
      <h1 className="text-2xl font-black tracking-tight mb-1">Dashboard Admin</h1>
      <p className="text-rta-muted text-sm mb-6">Pilotage du bot, des cartes et de l'économie Rocket Them All.</p>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
        {[
          { value: cardCount, label: "Cartes", color: "text-rta-success" },
          { value: userCount, label: "Utilisateurs", color: "text-rta-cta" },
          { value: tradeCount, label: "Trades", color: "text-purple-300" },
          { value: activeSpawnCount, label: "Spawns actifs", color: "text-rta-gold" }
        ].map((stat) => (
          <div key={stat.label} className="bg-rta-surface border border-rta-border rounded-xl p-4">
            <div className={`text-2xl font-black ${stat.color}`}>{stat.value.toLocaleString("fr-FR")}</div>
            <div className="text-[0.68rem] uppercase tracking-widest text-rta-muted mt-1">{stat.label}</div>
          </div>
        ))}
      </div>

      <div className="bg-rta-surface border border-rta-border rounded-xl overflow-hidden">
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b border-rta-surface2">
              <th className="text-left px-4 py-2.5 text-[0.68rem] uppercase tracking-wider text-rta-muted font-semibold">Action</th>
              <th className="text-left px-4 py-2.5 text-[0.68rem] uppercase tracking-wider text-rta-muted font-semibold">Admin</th>
              <th className="text-left px-4 py-2.5 text-[0.68rem] uppercase tracking-wider text-rta-muted font-semibold">Cible</th>
              <th className="text-left px-4 py-2.5 text-[0.68rem] uppercase tracking-wider text-rta-muted font-semibold">Date</th>
            </tr>
          </thead>
          <tbody>
            {recentLogs.map((log) => (
              <tr key={log.id} className="border-b border-rta-surface2/50 hover:bg-rta-accent/5 transition-colors">
                <td className="px-4 py-2.5 text-sm text-rta-ink">{log.action}</td>
                <td className="px-4 py-2.5 text-sm text-rta-muted">{log.admin?.username ?? "system"}</td>
                <td className="px-4 py-2.5 text-sm text-rta-muted">{log.target ?? "-"}</td>
                <td className="px-4 py-2.5 text-sm text-rta-muted">{log.createdAt.toLocaleString("fr-FR")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
