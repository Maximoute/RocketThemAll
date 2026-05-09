import { prisma } from "@rta/database";
import { requireAdmin } from "../../../lib/guard";

export default async function AdminLogsPage() {
  await requireAdmin();
  const [captureLogs, adminLogs] = await Promise.all([
    prisma.captureLog.findMany({ include: { user: true, card: true }, orderBy: { createdAt: "desc" }, take: 100 }),
    prisma.adminLog.findMany({ include: { admin: true }, orderBy: { createdAt: "desc" }, take: 100 })
  ]);

  return (
    <div>
      <h1 className="text-2xl font-black tracking-tight mb-1">Logs</h1>
      <p className="text-rta-muted text-sm mb-6">Dernières captures et actions administrateur.</p>

      <h2 className="text-xs font-bold uppercase tracking-widest text-rta-muted mb-3 flex items-center gap-2 after:flex-1 after:h-px after:bg-rta-surface2">
        Capture
      </h2>
      <div className="bg-rta-surface border border-rta-border rounded-xl overflow-hidden mb-6">
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b border-rta-surface2">
              <th className="text-left px-4 py-2.5 text-[0.68rem] uppercase tracking-wider text-rta-muted font-semibold">Joueur</th>
              <th className="text-left px-4 py-2.5 text-[0.68rem] uppercase tracking-wider text-rta-muted font-semibold">Carte</th>
              <th className="text-left px-4 py-2.5 text-[0.68rem] uppercase tracking-wider text-rta-muted font-semibold">Date</th>
            </tr>
          </thead>
          <tbody>
            {captureLogs.map((log) => (
              <tr key={log.id} className="border-b border-rta-surface2/50 hover:bg-rta-accent/5 transition-colors">
                <td className="px-4 py-2.5 text-sm text-rta-ink">{log.user.username}</td>
                <td className="px-4 py-2.5 text-sm text-rta-success">{log.card.name}</td>
                <td className="px-4 py-2.5 text-sm text-rta-muted">{log.createdAt.toLocaleString("fr-FR")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2 className="text-xs font-bold uppercase tracking-widest text-rta-muted mb-3 flex items-center gap-2 after:flex-1 after:h-px after:bg-rta-surface2">
        Admin
      </h2>
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
            {adminLogs.map((log) => (
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


