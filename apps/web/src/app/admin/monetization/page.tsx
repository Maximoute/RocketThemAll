import { prisma } from "@rta/database";
import {
  formatEuro,
  getMonetizationProduct
} from "@rta/services";
import { requireAdmin } from "../../../lib/guard";
import {
  paymentsEnabled,
  stripeModeLabel
} from "../../../lib/stripe";

function productName(productKey: string) {
  try {
    return getMonetizationProduct(productKey).name;
  } catch {
    return productKey;
  }
}

export default async function AdminMonetizationPage() {
  await requireAdmin();
  const [
    orders,
    activeEntitlements,
    failedWebhookCount,
    paidTotals,
    webhooks
  ] = await Promise.all([
    prisma.paymentOrder.findMany({
      include: { user: { select: { username: true, discordId: true } } },
      orderBy: { createdAt: "desc" },
      take: 100
    }),
    prisma.userEntitlement.count({
      where: {
        active: true,
        OR: [{ endsAt: null }, { endsAt: { gt: new Date() } }]
      }
    }),
    prisma.paymentWebhookEvent.count({ where: { status: "FAILED" } }),
    prisma.paymentOrder.aggregate({
      where: { status: "PAID" },
      _sum: { amountCents: true },
      _count: true
    }),
    prisma.paymentWebhookEvent.findMany({
      orderBy: { updatedAt: "desc" },
      take: 50
    })
  ]);

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black tracking-tight">Monétisation</h1>
          <p className="mt-1 text-sm text-rta-muted">
            Commandes, abonnements, entitlements et webhooks — aucune donnée bancaire.
          </p>
        </div>
        <div className="rounded-lg border border-rta-border bg-rta-surface px-4 py-2 text-sm">
          Stripe : <strong>{stripeModeLabel()}</strong> · paiements{" "}
          <strong className={paymentsEnabled() ? "text-rta-success" : "text-rta-gold"}>
            {paymentsEnabled() ? "activés" : "désactivés"}
          </strong>
        </div>
      </div>

      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-rta-border bg-rta-surface p-4">
          <div className="text-2xl font-black text-rta-gold">
            {paidTotals._count}
          </div>
          <div className="text-xs uppercase tracking-wider text-rta-muted">
            commandes payées
          </div>
        </div>
        <div className="rounded-xl border border-rta-border bg-rta-surface p-4">
          <div className="text-2xl font-black text-rta-success">
            {activeEntitlements}
          </div>
          <div className="text-xs uppercase tracking-wider text-rta-muted">
            entitlements actifs
          </div>
        </div>
        <div className="rounded-xl border border-rta-border bg-rta-surface p-4">
          <div className={failedWebhookCount > 0 ? "text-2xl font-black text-red-300" : "text-2xl font-black"}>
            {failedWebhookCount}
          </div>
          <div className="text-xs uppercase tracking-wider text-rta-muted">
            webhooks en erreur
          </div>
        </div>
      </div>

      <p className="mb-3 text-xs text-rta-muted">
        Valeur catalogue cumulée des commandes payées :{" "}
        <strong>{formatEuro(paidTotals._sum.amountCents ?? 0)}</strong>. Pour
        Discord, le prix réellement encaissé et les taxes restent à rapprocher
        avec les rapports de la plateforme.
      </p>

      <section className="mb-7 overflow-hidden rounded-xl border border-rta-border bg-rta-surface">
        <div className="border-b border-rta-border px-4 py-3 font-black">
          Dernières commandes
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-[70rem] w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-rta-border text-left text-xs uppercase tracking-wider text-rta-muted">
                <th className="px-4 py-2">Date</th>
                <th className="px-4 py-2">Joueur</th>
                <th className="px-4 py-2">Produit</th>
                <th className="px-4 py-2">Canal</th>
                <th className="px-4 py-2">Montant</th>
                <th className="px-4 py-2">Statut</th>
                <th className="px-4 py-2">Crédits livrés</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((order) => (
                <tr key={order.id} className="border-b border-rta-border/60">
                  <td className="px-4 py-2 text-rta-muted">
                    {order.createdAt.toLocaleString("fr-BE")}
                  </td>
                  <td className="px-4 py-2">
                    {order.user.username}
                    <div className="text-xs text-rta-muted">{order.user.discordId}</div>
                  </td>
                  <td className="px-4 py-2">{productName(order.productKey)}</td>
                  <td className="px-4 py-2">{order.provider}</td>
                  <td className="px-4 py-2">{formatEuro(order.amountCents)}</td>
                  <td className="px-4 py-2 font-bold">{order.status}</td>
                  <td className="px-4 py-2 text-rta-gold">
                    {order.creditsGranted.toLocaleString("fr-FR")}
                  </td>
                </tr>
              ))}
              {orders.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-rta-muted">
                    Aucune commande enregistrée.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="overflow-hidden rounded-xl border border-rta-border bg-rta-surface">
        <div className="border-b border-rta-border px-4 py-3 font-black">
          Derniers webhooks Stripe
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-[48rem] w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-rta-border text-left text-xs uppercase tracking-wider text-rta-muted">
                <th className="px-4 py-2">Événement</th>
                <th className="px-4 py-2">Type</th>
                <th className="px-4 py-2">Statut</th>
                <th className="px-4 py-2">Tentatives</th>
                <th className="px-4 py-2">Erreur</th>
              </tr>
            </thead>
            <tbody>
              {webhooks.map((event) => (
                <tr key={event.id} className="border-b border-rta-border/60">
                  <td className="px-4 py-2 font-mono text-xs">{event.providerEventId}</td>
                  <td className="px-4 py-2">{event.eventType}</td>
                  <td className="px-4 py-2 font-bold">{event.status}</td>
                  <td className="px-4 py-2">{event.attempts}</td>
                  <td className="max-w-md truncate px-4 py-2 text-red-200">
                    {event.lastError ?? "—"}
                  </td>
                </tr>
              ))}
              {webhooks.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-rta-muted">
                    Aucun webhook reçu.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
