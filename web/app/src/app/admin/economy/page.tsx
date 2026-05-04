import { prisma } from "@rta/database";
import { requireAdmin } from "../../../lib/guard";
import { revalidatePath } from "next/cache";

export default async function AdminEconomyPage() {
  async function updateUserCredits(formData: FormData) {
    "use server";
    const admin = await requireAdmin();
    const userId = String(formData.get("userId") ?? "");
    const credits = Math.max(0, Number(formData.get("credits") ?? 0));

    await prisma.user.update({ where: { id: userId }, data: { credits } });
    await prisma.economyLog.create({
      data: {
        userId,
        type: "admin_update",
        amount: credits,
        metadata: { adminId: admin.id, action: "set_credits" }
      }
    });

    revalidatePath("/admin/economy");
  }

  async function updateEconomyConfig(formData: FormData) {
    "use server";
    const admin = await requireAdmin();
    const readInt = (name: string, fallback: number) => Math.max(0, Number(formData.get(name) ?? fallback));
    const readFloat = (name: string, fallback: number) => Math.max(0, Number(formData.get(name) ?? fallback));

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
      basicToRareJackpotRate: readFloat("basicToRareJackpotRate", 0.02),
      basicToEpicJackpotRate: readFloat("basicToEpicJackpotRate", 0.005),
      basicToLegendaryJackpotRate: readFloat("basicToLegendaryJackpotRate", 0.001),
      rareToEpicJackpotRate: readFloat("rareToEpicJackpotRate", 0.03),
      rareToLegendaryJackpotRate: readFloat("rareToLegendaryJackpotRate", 0.005),
      epicToLegendaryJackpotRate: readFloat("epicToLegendaryJackpotRate", 0.02),
      normalVariantRate: readFloat("normalVariantRate", 0.94),
      shinyVariantRate: readFloat("shinyVariantRate", 0.05),
      holoVariantRate: readFloat("holoVariantRate", 0.01),
      scarcityFloor: readFloat("scarcityFloor", 0.5),
      scarcityCap: readFloat("scarcityCap", 3),
      fusionEnabled: String(formData.get("fusionEnabled") ?? "") === "on"
    };

    await prisma.appConfig.upsert({ where: { id: "default" }, update: payload, create: { id: "default", ...payload } });
    await prisma.economyLog.create({ data: { userId: admin.id, type: "admin_update", metadata: { action: "update_config", payload } } });

    revalidatePath("/admin/economy");
  }

  async function resetEconomy() {
    "use server";
    const admin = await requireAdmin();

    await prisma.$transaction(async (tx) => {
      await tx.user.updateMany({ data: { credits: 0, fragments: 0 } });
      await tx.userBooster.deleteMany();
      await tx.economyLog.create({ data: { userId: admin.id, type: "admin_update", metadata: { action: "reset_economy" } } });
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

      {/* ── Utilisateurs ── */}
      <details open style={{ marginBottom: "16px" }}>
        <summary style={{ cursor: "pointer", fontWeight: 600, fontSize: "1.1rem", marginBottom: "8px" }}>👥 Crédits utilisateurs</summary>
        <div style={{ display: "grid", gap: "6px" }}>
          {users.map((user) => (
            <form key={user.id} action={updateUserCredits} style={{ display: "flex", gap: "8px", alignItems: "center" }}>
              <input type="hidden" name="userId" value={user.id} />
              <span style={{ minWidth: "180px", fontFamily: "monospace" }}>{user.username}</span>
              <input type="number" min={0} name="credits" defaultValue={user.credits} style={{ width: "100px" }} />
              <span style={{ fontSize: "0.85rem", color: "var(--muted)" }}>crédits</span>
              <button type="submit">Mettre à jour</button>
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
            <legend style={{ fontWeight: 600, padding: "0 6px" }}>✨ Variantes — multiplicateurs de prix</legend>
            <p style={{ fontSize: "0.8rem", color: "var(--muted)", marginTop: 0 }}>
              Normal ×1 · Shiny ×{5} · Holo ×{10} (les multiplicateurs sont codés en dur, seules les chances de drop sont configurables)
            </p>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "8px", maxWidth: "480px" }}>
              <label style={{ display: "flex", flexDirection: "column", gap: "2px", fontSize: "0.85rem" }}>
                Normal (chance 0-1)
                <input name="normalVariantRate" type="number" min={0} max={1} step="0.01" defaultValue={config.normalVariantRate} style={{ padding: "4px 6px" }} />
              </label>
              <label style={{ display: "flex", flexDirection: "column", gap: "2px", fontSize: "0.85rem" }}>
                Shiny ✨ (chance 0-1)
                <input name="shinyVariantRate" type="number" min={0} max={1} step="0.01" defaultValue={config.shinyVariantRate} style={{ padding: "4px 6px" }} />
              </label>
              <label style={{ display: "flex", flexDirection: "column", gap: "2px", fontSize: "0.85rem" }}>
                Holo 🌈 (chance 0-1)
                <input name="holoVariantRate" type="number" min={0} max={1} step="0.01" defaultValue={config.holoVariantRate} style={{ padding: "4px 6px" }} />
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
            <legend style={{ fontWeight: 600, padding: "0 6px" }}>🎰 Taux jackpot boosters (0-1)</legend>
            <p style={{ fontSize: "0.8rem", color: "var(--muted)", marginTop: 0 }}>Chance qu'un booster monte de tier à l'ouverture</p>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "8px" }}>
              {[
                ["basicToRareJackpotRate", "Basic → Rare", config.basicToRareJackpotRate],
                ["basicToEpicJackpotRate", "Basic → Epic", config.basicToEpicJackpotRate],
                ["basicToLegendaryJackpotRate", "Basic → Legendary", config.basicToLegendaryJackpotRate],
                ["rareToEpicJackpotRate", "Rare → Epic", config.rareToEpicJackpotRate],
                ["rareToLegendaryJackpotRate", "Rare → Legendary", config.rareToLegendaryJackpotRate],
                ["epicToLegendaryJackpotRate", "Epic → Legendary", config.epicToLegendaryJackpotRate],
              ].map(([name, label, val]) => (
                <label key={String(name)} style={{ display: "flex", flexDirection: "column", gap: "2px", fontSize: "0.85rem" }}>
                  {String(label)}
                  <input name={String(name)} type="number" min={0} max={1} step="0.001" defaultValue={Number(val)} style={{ padding: "4px 6px" }} />
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

      {/* ── Reset ── */}
      <details>
        <summary style={{ cursor: "pointer", fontWeight: 600, fontSize: "1.1rem", color: "#c62828" }}>⚠️ Zone dangereuse</summary>
        <form action={resetEconomy} style={{ marginTop: "12px" }}>
          <p style={{ color: "#c62828", fontSize: "0.9rem" }}>Remet à zéro les crédits, fragments et boosters de TOUS les utilisateurs.</p>
          <button type="submit" style={{ background: "#c62828", color: "white", border: "none", padding: "8px 16px", borderRadius: "6px", cursor: "pointer" }}>
            🗑️ Reset économie complète
          </button>
        </form>
      </details>
    </section>
  );
}
