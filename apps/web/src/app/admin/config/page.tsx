import { prisma } from "@rta/database";
import { requireAdmin } from "../../../lib/guard";
import { revalidatePath } from "next/cache";
import { fetchGuildSpawnChannels } from "../../../lib/discord-admin";

export default async function AdminConfigPage() {
  async function updateSpawnChannel(formData: FormData) {
    "use server";
    const admin = await requireAdmin();
    const guildId = String(formData.get("guildId") ?? "").trim();
    const guildName = String(formData.get("guildName") ?? "").trim();
    const channelIdRaw = String(formData.get("spawnChannelId") ?? "").trim();
    const channelId = channelIdRaw.length ? channelIdRaw : null;
    const autoSpawnEnabled = String(formData.get("autoSpawnEnabled") ?? "") === "on";

    if (!guildId || !guildName) {
      return;
    }

    await prisma.botGuildConfig.upsert({
      where: { guildId },
      update: { guildName, spawnChannelId: channelId, isActive: true, autoSpawnEnabled },
      create: { guildId, guildName, spawnChannelId: channelId, isActive: true, autoSpawnEnabled }
    });

    await prisma.adminLog.create({
      data: {
        adminId: admin.id,
        action: "CONFIG_SPAWN_CHANNEL_UPDATED",
        target: guildId,
        metadata: { guildName, spawnChannelId: channelId, autoSpawnEnabled }
      }
    });

    revalidatePath("/admin/config");
  }

  async function forceSpawnNow() {
    "use server";
    const admin = await requireAdmin();

    await prisma.appConfig.upsert({
      where: { id: "default" },
      update: { forceSpawnRequestedAt: new Date() },
      create: {
        id: "default",
        spawnIntervalS: 300,
        captureCooldownS: 5,
        autoSpawnEnabled: true,
        autoSpawnIntervalMinutes: 5,
        manualSpawnEnabled: true,
        manualSpawnMaxCharges: 4,
        manualSpawnRegenHours: 6,
        forceSpawnRequestedAt: new Date()
      }
    });

    await prisma.adminLog.create({
      data: {
        adminId: admin.id,
        action: "CONFIG_FORCE_SPAWN_REQUESTED",
        target: "default"
      }
    });

    revalidatePath("/admin/config");
  }

  async function cancelActiveSpawn() {
    "use server";
    const admin = await requireAdmin();

    await prisma.spawnLog.updateMany({
      where: { status: "active" },
      data: { status: "cancelled" }
    });

    await prisma.adminLog.create({
      data: {
        adminId: admin.id,
        action: "CONFIG_ACTIVE_SPAWNS_CANCELLED",
        target: "global"
      }
    });

    revalidatePath("/admin/config");
  }

  async function updateSpawnSettings(formData: FormData) {
    "use server";
    const admin = await requireAdmin();

    const autoSpawnEnabled = String(formData.get("autoSpawnEnabled") ?? "") === "on";
    const manualSpawnEnabled = String(formData.get("manualSpawnEnabled") ?? "") === "on";
    const autoSpawnIntervalMinutes = Math.max(1, Number(formData.get("autoSpawnIntervalMinutes") ?? 5));
    const manualSpawnMaxCharges = Math.max(1, Number(formData.get("manualSpawnMaxCharges") ?? 4));
    const manualSpawnRegenHours = Math.max(1, Number(formData.get("manualSpawnRegenHours") ?? 6));

    await prisma.appConfig.upsert({
      where: { id: "default" },
      update: {
        autoSpawnEnabled,
        autoSpawnIntervalMinutes,
        manualSpawnEnabled,
        manualSpawnMaxCharges,
        manualSpawnRegenHours
      },
      create: {
        id: "default",
        spawnIntervalS: 300,
        captureCooldownS: 5,
        autoSpawnEnabled,
        autoSpawnIntervalMinutes,
        manualSpawnEnabled,
        manualSpawnMaxCharges,
        manualSpawnRegenHours
      }
    });

    await prisma.adminLog.create({
      data: {
        adminId: admin.id,
        action: "CONFIG_SPAWN_SETTINGS_UPDATED",
        target: "default",
        metadata: {
          autoSpawnEnabled,
          autoSpawnIntervalMinutes,
          manualSpawnEnabled,
          manualSpawnMaxCharges,
          manualSpawnRegenHours
        }
      }
    });

    revalidatePath("/admin/config");
  }

  async function updateEconomySettings(formData: FormData) {
    "use server";
    const admin = await requireAdmin();

    const readInt = (name: string, fallback: number) => Math.max(0, Number(formData.get(name) ?? fallback));
    const readFloat = (name: string, fallback: number) => Math.max(0, Number(formData.get(name) ?? fallback));

    const payload = {
      commonSellPrice: readInt("commonSellPrice", 5),
      uncommonSellPrice: readInt("uncommonSellPrice", 15),
      rareSellPrice: readInt("rareSellPrice", 40),
      veryRareSellPrice: readInt("veryRareSellPrice", 100),
      importSellPrice: readInt("importSellPrice", 250),
      exoticSellPrice: readInt("exoticSellPrice", 600),
      blackMarketSellPrice: readInt("blackMarketSellPrice", 1500),
      commonRecyclePrice: readInt("commonRecyclePrice", 2),
      uncommonRecyclePrice: readInt("uncommonRecyclePrice", 8),
      rareRecyclePrice: readInt("rareRecyclePrice", 20),
      veryRareRecyclePrice: readInt("veryRareRecyclePrice", 50),
      importRecyclePrice: readInt("importRecyclePrice", 125),
      exoticRecyclePrice: readInt("exoticRecyclePrice", 300),
      blackMarketRecyclePrice: readInt("blackMarketRecyclePrice", 750),
      commonFragmentReward: readInt("commonFragmentReward", 1),
      uncommonFragmentReward: readInt("uncommonFragmentReward", 2),
      rareFragmentReward: readInt("rareFragmentReward", 4),
      veryRareFragmentReward: readInt("veryRareFragmentReward", 8),
      importFragmentReward: readInt("importFragmentReward", 16),
      exoticFragmentReward: readInt("exoticFragmentReward", 32),
      blackMarketFragmentReward: readInt("blackMarketFragmentReward", 64),
      basicBoosterPrice: readInt("basicBoosterPrice", 100),
      rareBoosterPrice: readInt("rareBoosterPrice", 300),
      epicBoosterPrice: readInt("epicBoosterPrice", 750),
      legendaryBoosterPrice: readInt("legendaryBoosterPrice", 3000),
      basicToRareJackpotRate: readFloat("basicToRareJackpotRate", 0.02),
      basicToEpicJackpotRate: readFloat("basicToEpicJackpotRate", 0.005),
      basicToLegendaryJackpotRate: readFloat("basicToLegendaryJackpotRate", 0.001),
      rareToEpicJackpotRate: readFloat("rareToEpicJackpotRate", 0.03),
      rareToLegendaryJackpotRate: readFloat("rareToLegendaryJackpotRate", 0.005),
      epicToLegendaryJackpotRate: readFloat("epicToLegendaryJackpotRate", 0.02),
      normalVariantRate: readFloat("normalVariantRate", 0.9),
      shinyVariantRate: readFloat("shinyVariantRate", 0.09),
      holoVariantRate: readFloat("holoVariantRate", 0.01),
      scarcityFloor: readFloat("scarcityFloor", 0.5),
      scarcityCap: readFloat("scarcityCap", 3),
      fusionEnabled: String(formData.get("fusionEnabled") ?? "") === "on",
      craftBoosterFragmentCost: readInt("craftBoosterFragmentCost", 50),
      dailyCreditMin: readInt("dailyCreditMin", 50),
      dailyCreditMax: readInt("dailyCreditMax", 150),
      dailyBoosterChance: readFloat("dailyBoosterChance", 0.15)
    };

    await prisma.appConfig.upsert({ where: { id: "default" }, update: payload, create: { id: "default", ...payload } });
    await prisma.economyLog.create({ data: { userId: admin.id, type: "admin_update", metadata: { action: "config_update", payload } } });
    await prisma.adminLog.create({
      data: {
        adminId: admin.id,
        action: "CONFIG_ECONOMY_SETTINGS_UPDATED",
        target: "default",
        metadata: payload
      }
    });

    revalidatePath("/admin/config");
  }

  await requireAdmin();
  const config = await prisma.appConfig.upsert({ where: { id: "default" }, update: {}, create: { id: "default" } });
  const guilds = await prisma.botGuildConfig.findMany({ orderBy: [{ isActive: "desc" }, { guildName: "asc" }] });
  const activeSpawns = await prisma.spawnLog.findMany({
    where: { status: "active" },
    include: { card: { include: { rarity: true, deck: true } } },
    orderBy: { createdAt: "asc" }
  });
  const guildChannels = await Promise.all(
    guilds.map(async (guild) => ({
      guildId: guild.guildId,
      channels: await fetchGuildSpawnChannels(guild.guildId)
    }))
  );
  const channelMap = new Map(guildChannels.map((entry) => [entry.guildId, entry.channels]));

  const activeByChannel = new Map<string, typeof activeSpawns>();
  for (const spawn of activeSpawns) {
    const list = activeByChannel.get(spawn.channelId) ?? [];
    list.push(spawn);
    activeByChannel.set(spawn.channelId, list);
  }

  return (
    <section className="card">
      <h1>Admin Config</h1>
      <p>Spawn interval: {config?.spawnIntervalS ?? 0}s (legacy)</p>
      <p>Capture cooldown: {config?.captureCooldownS ?? 0}s</p>
      <p>Serveurs detectes: {guilds.length}</p>

      <article style={{ border: "1px solid #ddd", borderRadius: "8px", padding: "12px", marginTop: "12px" }}>
        <h2>Spawn Settings</h2>
        <form action={updateSpawnSettings} style={{ display: "grid", gap: "8px", maxWidth: "420px" }}>
          <label style={{ display: "flex", gap: "8px", alignItems: "center" }}>
            <input type="checkbox" name="autoSpawnEnabled" defaultChecked={config.autoSpawnEnabled} />
            Activer le spawn automatique
          </label>

          <label htmlFor="autoSpawnIntervalMinutes">Intervalle automatique (minutes)</label>
          <input
            id="autoSpawnIntervalMinutes"
            name="autoSpawnIntervalMinutes"
            type="number"
            min={1}
            defaultValue={config.autoSpawnIntervalMinutes ?? 5}
          />

          <label style={{ display: "flex", gap: "8px", alignItems: "center" }}>
            <input type="checkbox" name="manualSpawnEnabled" defaultChecked={config.manualSpawnEnabled} />
            Activer le spawn manuel
          </label>

          <label htmlFor="manualSpawnMaxCharges">Charges max /spawn</label>
          <input
            id="manualSpawnMaxCharges"
            name="manualSpawnMaxCharges"
            type="number"
            min={1}
            defaultValue={config.manualSpawnMaxCharges ?? 4}
          />

          <label htmlFor="manualSpawnRegenHours">Régénération d'une charge (heures)</label>
          <input
            id="manualSpawnRegenHours"
            name="manualSpawnRegenHours"
            type="number"
            min={1}
            defaultValue={config.manualSpawnRegenHours ?? 6}
          />

          <button type="submit">Enregistrer Spawn Settings</button>
        </form>

        <div style={{ display: "flex", gap: "8px", marginTop: "12px", flexWrap: "wrap" }}>
          <form action={forceSpawnNow}>
            <button type="submit">Forcer un spawn admin</button>
          </form>
          <form action={cancelActiveSpawn}>
            <button type="submit">Annuler le spawn actif</button>
          </form>
        </div>

        <p style={{ marginTop: "8px" }}>
          Spawn actif global: {activeSpawns.length}
        </p>
      </article>

      <article style={{ border: "1px solid #ddd", borderRadius: "8px", padding: "12px", marginTop: "12px" }}>
        <h2>Economy Settings</h2>
        <form action={updateEconomySettings} style={{ display: "grid", gap: "8px", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" }}>
          <input name="basicBoosterPrice" type="number" min={0} defaultValue={config.basicBoosterPrice} placeholder="Basic booster price" />
          <input name="rareBoosterPrice" type="number" min={0} defaultValue={config.rareBoosterPrice} placeholder="Rare booster price" />
          <input name="epicBoosterPrice" type="number" min={0} defaultValue={config.epicBoosterPrice} placeholder="Epic booster price" />
          <input name="legendaryBoosterPrice" type="number" min={0} defaultValue={config.legendaryBoosterPrice} placeholder="Legendary booster price" />
          <input name="basicToRareJackpotRate" type="number" min={0} max={1} step="0.001" defaultValue={config.basicToRareJackpotRate} placeholder="Basic->Rare jackpot" />
          <input name="basicToEpicJackpotRate" type="number" min={0} max={1} step="0.001" defaultValue={config.basicToEpicJackpotRate} placeholder="Basic->Epic jackpot" />
          <input name="basicToLegendaryJackpotRate" type="number" min={0} max={1} step="0.001" defaultValue={config.basicToLegendaryJackpotRate} placeholder="Basic->Legendary jackpot" />
          <input name="rareToEpicJackpotRate" type="number" min={0} max={1} step="0.001" defaultValue={config.rareToEpicJackpotRate} placeholder="Rare->Epic jackpot" />
          <input name="rareToLegendaryJackpotRate" type="number" min={0} max={1} step="0.001" defaultValue={config.rareToLegendaryJackpotRate} placeholder="Rare->Legendary jackpot" />
          <input name="epicToLegendaryJackpotRate" type="number" min={0} max={1} step="0.001" defaultValue={config.epicToLegendaryJackpotRate} placeholder="Epic->Legendary jackpot" />
          <input name="normalVariantRate" type="number" min={0} max={1} step="0.01" defaultValue={config.normalVariantRate} placeholder="Normal variant rate" />
          <input name="shinyVariantRate" type="number" min={0} max={1} step="0.01" defaultValue={config.shinyVariantRate} placeholder="Shiny variant rate" />
          <input name="holoVariantRate" type="number" min={0} max={1} step="0.01" defaultValue={config.holoVariantRate} placeholder="Holo variant rate" />
          <input name="scarcityFloor" type="number" min={0} step="0.1" defaultValue={config.scarcityFloor} placeholder="Scarcity floor" />
          <input name="scarcityCap" type="number" min={0} step="0.1" defaultValue={config.scarcityCap} placeholder="Scarcity cap" />
          <label style={{ display: "flex", gap: "8px", alignItems: "center" }}>
            <input type="checkbox" name="fusionEnabled" defaultChecked={config.fusionEnabled} />
            Fusion activée
          </label>
          <input name="craftBoosterFragmentCost" type="number" min={0} defaultValue={config.craftBoosterFragmentCost} placeholder="Craft booster cost" />
          <input name="dailyCreditMin" type="number" min={0} defaultValue={config.dailyCreditMin} placeholder="Daily min" />
          <input name="dailyCreditMax" type="number" min={0} defaultValue={config.dailyCreditMax} placeholder="Daily max" />
          <input name="dailyBoosterChance" type="number" min={0} max={1} step="0.01" defaultValue={config.dailyBoosterChance} placeholder="Daily booster chance" />
          <input name="commonSellPrice" type="number" min={0} defaultValue={config.commonSellPrice} placeholder="Common sell" />
          <input name="uncommonSellPrice" type="number" min={0} defaultValue={config.uncommonSellPrice} placeholder="Uncommon sell" />
          <input name="rareSellPrice" type="number" min={0} defaultValue={config.rareSellPrice} placeholder="Rare sell" />
          <input name="veryRareSellPrice" type="number" min={0} defaultValue={config.veryRareSellPrice} placeholder="Very Rare sell" />
          <input name="importSellPrice" type="number" min={0} defaultValue={config.importSellPrice} placeholder="Import sell" />
          <input name="exoticSellPrice" type="number" min={0} defaultValue={config.exoticSellPrice} placeholder="Exotic sell" />
          <input name="blackMarketSellPrice" type="number" min={0} defaultValue={config.blackMarketSellPrice} placeholder="Black Market sell" />
          <input name="commonRecyclePrice" type="number" min={0} defaultValue={config.commonRecyclePrice} placeholder="Common recycle" />
          <input name="uncommonRecyclePrice" type="number" min={0} defaultValue={config.uncommonRecyclePrice} placeholder="Uncommon recycle" />
          <input name="rareRecyclePrice" type="number" min={0} defaultValue={config.rareRecyclePrice} placeholder="Rare recycle" />
          <input name="veryRareRecyclePrice" type="number" min={0} defaultValue={config.veryRareRecyclePrice} placeholder="Very Rare recycle" />
          <input name="importRecyclePrice" type="number" min={0} defaultValue={config.importRecyclePrice} placeholder="Import recycle" />
          <input name="exoticRecyclePrice" type="number" min={0} defaultValue={config.exoticRecyclePrice} placeholder="Exotic recycle" />
          <input name="blackMarketRecyclePrice" type="number" min={0} defaultValue={config.blackMarketRecyclePrice} placeholder="Black Market recycle" />
          <input name="commonFragmentReward" type="number" min={0} defaultValue={config.commonFragmentReward} placeholder="Common fragments" />
          <input name="uncommonFragmentReward" type="number" min={0} defaultValue={config.uncommonFragmentReward} placeholder="Uncommon fragments" />
          <input name="rareFragmentReward" type="number" min={0} defaultValue={config.rareFragmentReward} placeholder="Rare fragments" />
          <input name="veryRareFragmentReward" type="number" min={0} defaultValue={config.veryRareFragmentReward} placeholder="Very Rare fragments" />
          <input name="importFragmentReward" type="number" min={0} defaultValue={config.importFragmentReward} placeholder="Import fragments" />
          <input name="exoticFragmentReward" type="number" min={0} defaultValue={config.exoticFragmentReward} placeholder="Exotic fragments" />
          <input name="blackMarketFragmentReward" type="number" min={0} defaultValue={config.blackMarketFragmentReward} placeholder="Black Market fragments" />
          <div style={{ gridColumn: "1 / -1" }}>
            <button type="submit">Enregistrer Economy Settings</button>
          </div>
        </form>
      </article>

      <div style={{ display: "grid", gap: "12px", marginTop: "16px" }}>
        {guilds.map((guild) => {
          const channels = channelMap.get(guild.guildId) ?? [];
          const activeForGuild = guild.spawnChannelId ? activeByChannel.get(guild.spawnChannelId) ?? [] : [];
          return (
            <article key={guild.guildId} style={{ border: "1px solid #ddd", borderRadius: "8px", padding: "12px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", alignItems: "center" }}>
                <div>
                  <strong>{guild.guildName}</strong>
                  <div style={{ color: "var(--muted)", fontSize: "0.9rem" }}>{guild.guildId}</div>
                </div>
                <span style={{ fontSize: "0.85rem", color: guild.isActive ? "#2e7d32" : "#c62828" }}>
                  {guild.isActive ? "Actif" : "Inactif"}
                </span>
              </div>

              <form action={updateSpawnChannel} style={{ display: "grid", gap: "8px", marginTop: "12px", maxWidth: "520px" }}>
                <input type="hidden" name="guildId" value={guild.guildId} />
                <input type="hidden" name="guildName" value={guild.guildName} />
                <label htmlFor={`spawnChannelId-${guild.guildId}`}>Salon de spawn</label>
                <select id={`spawnChannelId-${guild.guildId}`} name="spawnChannelId" defaultValue={guild.spawnChannelId ?? ""}>
                  <option value="">Aucun salon configure</option>
                  {channels.map((channel) => (
                    <option key={channel.id} value={channel.id}>#{channel.name}</option>
                  ))}
                </select>
                <small>
                  Salon actuel: {guild.spawnChannelId || "aucun"}
                </small>
                <label style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                  <input type="checkbox" name="autoSpawnEnabled" defaultChecked={guild.autoSpawnEnabled} />
                  Auto-spawn ON/OFF pour ce serveur
                </label>
                <small>
                  Spawn actif: {activeForGuild.length > 0
                    ? activeForGuild.map((spawn) => spawn.card.name).join(", ")
                    : "aucun"}
                </small>
                <button type="submit">Enregistrer pour ce serveur</button>
              </form>
            </article>
          );
        })}
      </div>

      <p style={{ marginTop: "12px" }}>Les slash commands sont maintenant globales. Discord peut mettre quelques minutes a les propager sur tous les serveurs.</p>
    </section>
  );
}


