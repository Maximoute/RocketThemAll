import { prisma } from "@rta/database";
import { AdminEconomyService } from "@rta/services";
import { randomUUID } from "node:crypto";
import { requireAdmin } from "../../../lib/guard";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

const adminEconomyService = new AdminEconomyService();
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function formNumber(
  formData: FormData,
  name: string,
  fallback: number,
  options: { max: number; integer?: boolean }
) {
  const parsed = Number(formData.get(name) ?? fallback);
  if (!Number.isFinite(parsed)) return fallback;
  const normalized = options.integer ? Math.trunc(parsed) : parsed;
  return Math.min(options.max, Math.max(0, normalized));
}

export default async function AdminEconomyPage({
  searchParams: searchParamsPromise
}: {
  searchParams: Promise<{ notice?: string; error?: string }>;
}) {
  const searchParams = await searchParamsPromise;
  async function adjustUserCredits(formData: FormData) {
    "use server";
    const admin = await requireAdmin();
    const userId = String(formData.get("userId") ?? "").trim();
    const creditDelta = Math.trunc(Number(formData.get("creditDelta") ?? 0));
    const reason = String(formData.get("reason") ?? "");
    if (!UUID.test(userId)) redirect("/admin/economy?error=Identifiant joueur invalide.");
    try {
      await adminEconomyService.adjustBalance({
        adminId: admin.id,
        userId,
        creditDelta,
        reason,
        operationKey: `admin:${admin.id}:balance:${randomUUID()}`
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Ajustement impossible.";
      redirect(`/admin/economy?error=${encodeURIComponent(message)}`);
    }
    revalidatePath("/admin/economy");
    revalidatePath("/admin/users");
    redirect("/admin/economy?notice=Solde mis à jour et audité.");
  }

  async function updateEconomyConfig(formData: FormData) {
    "use server";
    const admin = await requireAdmin();
    const readInt = (name: string, fallback: number) =>
      formNumber(formData, name, fallback, { max: 100_000_000, integer: true });
    const readRate = (name: string, fallback: number) =>
      formNumber(formData, name, fallback, { max: 1 });

    const payload = {
      commonSellPrice: readInt("commonSellPrice", 10),
      uncommonSellPrice: readInt("uncommonSellPrice", 25),
      rareSellPrice: readInt("rareSellPrice", 75),
      veryRareSellPrice: readInt("veryRareSellPrice", 150),
      importSellPrice: readInt("importSellPrice", 300),
      exoticSellPrice: readInt("exoticSellPrice", 750),
      blackMarketSellPrice: readInt("blackMarketSellPrice", 2000),
      basicBoosterPrice: readInt("basicBoosterPrice", 100),
      rareBoosterPrice: readInt("rareBoosterPrice", 300),
      epicBoosterPrice: readInt("epicBoosterPrice", 1000),
      legendaryBoosterPrice: readInt("legendaryBoosterPrice", 3000),
      normalVariantRate: readRate("normalVariantRate", 0.989),
      shinyVariantRate: readRate("shinyVariantRate", 0.01),
      holoVariantRate: readRate("holoVariantRate", 0.001),
      captureConsumableDropRate: readRate("captureConsumableDropRate", 0.1),
      captureConsumableCommonWeight: readInt("captureConsumableCommonWeight", 50),
      captureConsumableUncommonWeight: readInt("captureConsumableUncommonWeight", 30),
      captureConsumableRareWeight: readInt("captureConsumableRareWeight", 15),
      captureConsumableEpicWeight: readInt("captureConsumableEpicWeight", 4),
      captureConsumableLegendaryWeight: readInt("captureConsumableLegendaryWeight", 1),
      scarcityFloor: formNumber(formData, "scarcityFloor", 0.5, { max: 100 }),
      scarcityCap: formNumber(formData, "scarcityCap", 3, { max: 100 }),
      fusionEnabled: String(formData.get("fusionEnabled") ?? "") === "on"
    };

    await prisma.appConfig.upsert({ where: { id: "default" }, update: payload, create: { id: "default", ...payload } });
    await prisma.economyLog.create({ data: { userId: admin.id, type: "admin_update", metadata: { action: "update_config", payload } } });
    await prisma.adminLog.create({
      data: {
        adminId: admin.id,
        action: "ECONOMY_CONFIG_UPDATED",
        target: "default",
        metadata: payload
      }
    });

    revalidatePath("/admin/economy");
  }

  await requireAdmin();

  const [users, config, economyLogs, soldStatsRaw, circulation] = await Promise.all([
    prisma.user.findMany({ orderBy: { credits: "desc" }, take: 50 }),
    prisma.appConfig.upsert({ where: { id: "default" }, update: {}, create: { id: "default" } }),
    prisma.economyLog.findMany({ orderBy: { createdAt: "desc" }, take: 80, include: { user: true } }),
    prisma.economyLog.findMany({ where: { type: "sell" }, orderBy: { createdAt: "desc" }, take: 500 }),
    prisma.inventoryItem.groupBy({ by: ["cardId"], _sum: { quantity: true }, orderBy: { _sum: { quantity: "asc" } }, take: 20 })
  ]);

  const soldByCard = new Map<string, number>();
  for (const row of soldStatsRaw) {
    const cardId = String((row.metadata as any)?.cardId ?? "");
    const qty = Number((row.metadata as any)?.quantity ?? 0);
    if (!cardId || !Number.isFinite(qty)) continue;
    soldByCard.set(cardId, (soldByCard.get(cardId) ?? 0) + qty);
  }

  const mostSoldCardIds = [...soldByCard.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15).map(([cardId]) => cardId);
  const soldCards = mostSoldCardIds.length > 0
    ? await prisma.card.findMany({ where: { id: { in: mostSoldCardIds } }, include: { rarity: true, deck: true } })
    : [];

  const circulationCards = circulation.length > 0
    ? await prisma.card.findMany({ where: { id: { in: circulation.map((row) => row.cardId) } }, include: { rarity: true, deck: true } })
    : [];

  return (
    <section className="card">
      <h1>Admin Economy</h1>
      {searchParams.notice && (
        <p className="card" style={{ borderColor: "#22c55e", color: "#166534" }}>
          {searchParams.notice}
        </p>
      )}
      {searchParams.error && (
        <p className="card" style={{ borderColor: "#ef4444", color: "#991b1b" }}>
          {searchParams.error}
        </p>
      )}

      {/* ── Utilisateurs ── */}
      <details open style={{ marginBottom: "16px" }}>
        <summary style={{ cursor: "pointer", fontWeight: 600, fontSize: "1.1rem", marginBottom: "8px" }}>👥 Crédits utilisateurs</summary>
        <div style={{ display: "grid", gap: "6px" }}>
          {users.map((user) => (
            <form key={user.id} action={adjustUserCredits} style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" }}>
              <input type="hidden" name="userId" value={user.id} />
              <span style={{ minWidth: "180px", fontFamily: "monospace" }}>{user.username}</span>
              <strong>{user.credits} crédits</strong>
              <input type="number" name="creditDelta" defaultValue={0} placeholder="+/- crédits" style={{ width: "110px" }} />
              <input type="text" name="reason" minLength={3} required placeholder="Motif obligatoire" />
              <button type="submit">Ajouter / retirer</button>
            </form>
          ))}
        </div>
      </details>

      {/* ── Config économique ── */}
      <form action={updateEconomyConfig}>
        <details open style={{ marginBottom: "16px" }}>
          <summary style={{ cursor: "pointer", fontWeight: 600, fontSize: "1.1rem", marginBottom: "12px" }}>⚙️ Configuration économique</summary>

          <fieldset style={{ border: "1px solid #ddd", borderRadius: "8px", padding: "12px", marginBottom: "12px" }}>
            <legend style={{ fontWeight: 600, padding: "0 6px" }}>💰 Prix de base par rareté (vente)</legend>
            <p style={{ fontSize: "0.8rem", color: "var(--muted)", marginTop: 0 }}>Prix dynamique = basePrice × scarcityMultiplier × variantMultiplier</p>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "8px" }}>
              {[
                ["commonSellPrice", "Common", config.commonSellPrice],
                ["uncommonSellPrice", "Uncommon", config.uncommonSellPrice],
                ["rareSellPrice", "Rare", config.rareSellPrice],
                ["veryRareSellPrice", "Very Rare", config.veryRareSellPrice],
                ["importSellPrice", "Import", config.importSellPrice],
                ["exoticSellPrice", "Exotic", config.exoticSellPrice],
                ["blackMarketSellPrice", "Black Market", config.blackMarketSellPrice],
              ].map(([name, label, val]) => (
                <label key={String(name)} style={{ display: "flex", flexDirection: "column", gap: "2px", fontSize: "0.85rem" }}>
                  {String(label)}
                  <input name={String(name)} type="number" min={0} defaultValue={Number(val)} style={{ padding: "4px 6px" }} />
                </label>
              ))}
            </div>
          </fieldset>

          <fieldset style={{ border: "1px solid #ddd", borderRadius: "8px", padding: "12px", marginBottom: "12px" }}>
            <legend style={{ fontWeight: 600, padding: "0 6px" }}>🎒 Objets consommables après capture</legend>
            <p style={{ fontSize: "0.8rem", color: "var(--muted)", marginTop: 0 }}>
              Le taux global s’applique uniquement aux captures réussies. Les poids déterminent ensuite le tier de l’objet.
            </p>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "8px" }}>
              <label style={{ display: "flex", flexDirection: "column", gap: "2px", fontSize: "0.85rem" }}>
                Chance globale (0-1)
                <input name="captureConsumableDropRate" type="number" min={0} max={1} step="0.001" defaultValue={config.captureConsumableDropRate} style={{ padding: "4px 6px" }} />
              </label>
              {[
                ["captureConsumableCommonWeight", "Commun", config.captureConsumableCommonWeight],
                ["captureConsumableUncommonWeight", "Peu commun", config.captureConsumableUncommonWeight],
                ["captureConsumableRareWeight", "Rare", config.captureConsumableRareWeight],
                ["captureConsumableEpicWeight", "Épique", config.captureConsumableEpicWeight],
                ["captureConsumableLegendaryWeight", "Légendaire", config.captureConsumableLegendaryWeight]
              ].map(([name, label, value]) => (
                <label key={String(name)} style={{ display: "flex", flexDirection: "column", gap: "2px", fontSize: "0.85rem" }}>
                  Poids {String(label)}
                  <input name={String(name)} type="number" min={0} step={1} defaultValue={Number(value)} style={{ padding: "4px 6px" }} />
                </label>
              ))}
            </div>
            <p style={{ fontSize: "0.75rem", color: "var(--muted)" }}>
              Valeurs actuelles : 10 % global, puis 50 / 30 / 15 / 4 / 1.
            </p>
          </fieldset>

          <fieldset style={{ border: "1px solid #ddd", borderRadius: "8px", padding: "12px", marginBottom: "12px" }}>
            <legend style={{ fontWeight: 600, padding: "0 6px" }}>✨ Variantes — multiplicateurs de prix</legend>
            <p style={{ fontSize: "0.8rem", color: "var(--muted)", marginTop: 0 }}>
              Normal ×1 · Shiny ×{5} · Holo ×{10} (les multiplicateurs sont codés en dur, seules les chances de drop sont configurables)
            </p>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "8px", maxWidth: "480px" }}>
              <label style={{ display: "flex", flexDirection: "column", gap: "2px", fontSize: "0.85rem" }}>
                Normal (chance 0-1)
                <input name="normalVariantRate" type="number" min={0} max={1} step="0.001" defaultValue={config.normalVariantRate} style={{ padding: "4px 6px" }} />
              </label>
              <label style={{ display: "flex", flexDirection: "column", gap: "2px", fontSize: "0.85rem" }}>
                Shiny ✨ (chance 0-1)
                <input name="shinyVariantRate" type="number" min={0} max={1} step="0.001" defaultValue={config.shinyVariantRate} style={{ padding: "4px 6px" }} />
              </label>
              <label style={{ display: "flex", flexDirection: "column", gap: "2px", fontSize: "0.85rem" }}>
                Holo 🌈 (chance 0-1)
                <input name="holoVariantRate" type="number" min={0} max={1} step="0.001" defaultValue={config.holoVariantRate} style={{ padding: "4px 6px" }} />
              </label>
            </div>
            <p style={{ fontSize: "0.75rem", color: "var(--muted)" }}>⚠️ Les 3 valeurs doivent totaliser 1.0</p>
          </fieldset>

          <fieldset style={{ border: "1px solid #ddd", borderRadius: "8px", padding: "12px", marginBottom: "12px" }}>
            <legend style={{ fontWeight: 600, padding: "0 6px" }}>📦 Prix des boosters</legend>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "8px" }}>
              {[
                ["basicBoosterPrice", "Basic booster", config.basicBoosterPrice],
                ["rareBoosterPrice", "Rare booster", config.rareBoosterPrice],
                ["epicBoosterPrice", "Epic booster", config.epicBoosterPrice],
                ["legendaryBoosterPrice", "Legendary booster", config.legendaryBoosterPrice],
              ].map(([name, label, val]) => (
                <label key={String(name)} style={{ display: "flex", flexDirection: "column", gap: "2px", fontSize: "0.85rem" }}>
                  {String(label)}
                  <input name={String(name)} type="number" min={0} defaultValue={Number(val)} style={{ padding: "4px 6px" }} />
                </label>
              ))}
            </div>
          </fieldset>

          <fieldset style={{ border: "1px solid #ddd", borderRadius: "8px", padding: "12px", marginBottom: "12px" }}>
            <legend style={{ fontWeight: 600, padding: "0 6px" }}>📉 Rareté dynamique (scarcity)</legend>
            <p style={{ fontSize: "0.8rem", color: "var(--muted)", marginTop: 0 }}>
              scarcityMultiplier = clamp(100 / (circulation + 10), floor, cap)
            </p>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "8px", maxWidth: "320px" }}>
              <label style={{ display: "flex", flexDirection: "column", gap: "2px", fontSize: "0.85rem" }}>
                Plancher (floor)
                <input name="scarcityFloor" type="number" min={0} step="0.1" defaultValue={config.scarcityFloor} style={{ padding: "4px 6px" }} />
              </label>
              <label style={{ display: "flex", flexDirection: "column", gap: "2px", fontSize: "0.85rem" }}>
                Plafond (cap)
                <input name="scarcityCap" type="number" min={0} step="0.1" defaultValue={config.scarcityCap} style={{ padding: "4px 6px" }} />
              </label>
            </div>
          </fieldset>

          <fieldset style={{ border: "1px solid #ddd", borderRadius: "8px", padding: "12px", marginBottom: "12px" }}>
            <legend style={{ fontWeight: 600, padding: "0 6px" }}>⚗️ Fusion</legend>
            <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "0.9rem" }}>
              <input type="checkbox" name="fusionEnabled" defaultChecked={config.fusionEnabled} />
              Fusion de cartes activée
            </label>
          </fieldset>

          <button type="submit" style={{ padding: "8px 20px", fontWeight: 600, fontSize: "1rem" }}>
            💾 Enregistrer la config économie
          </button>
        </details>
      </form>

      {/* ── Stats ── */}
      <details style={{ marginBottom: "16px" }}>
        <summary style={{ cursor: "pointer", fontWeight: 600, fontSize: "1.1rem", marginBottom: "8px" }}>📊 Statistiques</summary>

        <h3>Cartes les moins en circulation</h3>
        <ul>
          {circulation.map((row) => {
            const card = circulationCards.find((c) => c.id === row.cardId);
            return (
              <li key={row.cardId}>{card?.name ?? row.cardId} — {card?.rarity.name ?? "?"} — {row._sum.quantity ?? 0} en jeu</li>
            );
          })}
        </ul>

        <h3>Cartes les plus vendues</h3>
        <ul>
          {mostSoldCardIds.map((cardId) => {
            const card = soldCards.find((c) => c.id === cardId);
            return (
              <li key={cardId}>{card?.name ?? cardId} — {soldByCard.get(cardId) ?? 0} ventes</li>
            );
          })}
        </ul>
      </details>

      {/* ── Logs ── */}
      <details style={{ marginBottom: "16px" }}>
        <summary style={{ cursor: "pointer", fontWeight: 600, fontSize: "1.1rem", marginBottom: "8px" }}>📋 Logs économiques (80 derniers)</summary>
        <ul style={{ fontSize: "0.85rem", lineHeight: "1.6" }}>
          {economyLogs.map((log) => (
            <li key={log.id}>
              <span style={{ color: "var(--muted)" }}>{log.createdAt.toLocaleString("fr-FR")}</span>
              {" · "}<strong>{log.type}</strong>
              {" · "}{log.user?.username ?? "système"}
              {log.amount ? ` · ${log.amount} crédits` : ""}
            </li>
          ))}
        </ul>
      </details>

    </section>
  );
}
