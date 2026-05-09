import { getServerSession } from "next-auth";
import { authOptions } from "../../lib/auth";
import { prisma } from "@rta/database";
import { redirect } from "next/navigation";

export default async function TradesPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.name) {
    redirect("/login");
  }

  const user = await prisma.user.findFirst({ where: { username: session.user.name } });
  if (!user) {
    return <section className="card">Utilisateur introuvable</section>;
  }

  const trades = await prisma.trade.findMany({
    where: {
      OR: [{ user1Id: user.id }, { user2Id: user.id }]
    },
    include: { items: { include: { card: true } }, user1: true, user2: true },
    orderBy: { createdAt: "desc" }
  });

  const pending  = trades.filter((t) => t.status === "pending");
  const finished = trades.filter((t) => t.status !== "pending");

  const statusDot: Record<string, string> = {
    pending:   "bg-rta-cta shadow-[0_0_6px_rgba(242,130,65,0.7)]",
    confirmed: "bg-rta-success shadow-[0_0_6px_rgba(90,191,134,0.7)]",
    expired:   "bg-rta-muted",
    cancelled: "bg-rta-muted",
  };

  return (
    <div>
      <h1 className="text-3xl font-black tracking-tight mb-1">Mes Trades</h1>
      <p className="text-rta-muted text-sm mb-6">Échange des cartes avec d'autres joueurs via Discord avec /trade</p>

      {pending.length > 0 && (
        <div className="mb-6">
          <h2 className="text-xs font-bold uppercase tracking-widest text-rta-muted mb-3 flex items-center gap-2 after:flex-1 after:h-px after:bg-rta-surface2">
            ⏳ En attente ({pending.length})
          </h2>
          <div className="flex flex-col gap-3">
            {pending.map((trade) => (
              <div key={trade.id} className="bg-rta-surface border border-rta-cta rounded-xl p-4 flex items-start gap-4">
                <div className={`w-2.5 h-2.5 rounded-full mt-1.5 shrink-0 ${statusDot.pending}`} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 text-sm mb-2">
                    <span className="font-bold text-rta-ink">{trade.user1.username}</span>
                    <span className="text-rta-muted">↔</span>
                    <span className="font-bold text-rta-ink">{trade.user2.username}</span>
                    <span className="ml-auto text-[0.65rem] text-rta-muted">#{trade.id.slice(0, 8)}</span>
                  </div>
                  {trade.items.length > 0 && (
                    <ul className="flex flex-col gap-1">
                      {trade.items.map((item) => (
                        <li key={item.id} className="text-xs text-rta-muted">
                          <span className="text-rta-ink font-medium">
                            {item.userId === trade.user1Id ? trade.user1.username : trade.user2.username}
                          </span>{" "}
                          propose <span className="text-rta-success">{item.quantity}×</span> {item.card?.name ?? "Carte supprimée"}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {finished.length > 0 && (
        <div>
          <h2 className="text-xs font-bold uppercase tracking-widest text-rta-muted mb-3 flex items-center gap-2 after:flex-1 after:h-px after:bg-rta-surface2">
            ✅ Historique ({finished.length})
          </h2>
          <div className="flex flex-col gap-2">
            {finished.map((trade) => (
              <div key={trade.id} className={`bg-rta-surface border rounded-xl p-4 flex items-center gap-3 ${trade.status === "confirmed" ? "border-rta-success/40" : "border-rta-border opacity-60"}`}>
                <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${statusDot[trade.status] ?? statusDot.expired}`} />
                <span className="text-sm flex-1 text-rta-muted">
                  <strong className="text-rta-ink">{trade.user1.username}</strong> ↔ <strong className="text-rta-ink">{trade.user2.username}</strong>
                  <span className="ml-2">· {trade.createdAt.toLocaleString("fr-FR")}</span>
                </span>
                <span className={`text-xs font-bold uppercase px-2 py-0.5 rounded ${trade.status === "confirmed" ? "bg-rta-success/15 text-rta-success" : "bg-rta-surface2 text-rta-muted"}`}>
                  {trade.status}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {trades.length === 0 && (
        <div className="bg-rta-surface border border-rta-border rounded-xl p-8 text-center">
          <p className="text-rta-muted">Aucun trade. Lance /trade start @user sur Discord.</p>
        </div>
      )}
    </div>
  );
}


