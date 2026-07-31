import { prisma } from "@rta/database";
import { requireAdmin } from "../../../lib/guard";
import { revalidatePath } from "next/cache";
import { fetchGuildGameChannels } from "../../../lib/discord-admin";

export default async function AdminConfigPage() {
  async function updateGameChannel(formData: FormData) {
    "use server";
    const admin = await requireAdmin();
    const guildId = String(formData.get("guildId") ?? "").trim();
    const guildName = String(formData.get("guildName") ?? "").trim();
    const channelIdRaw = String(formData.get("gameChannelId") ?? "").trim();
    const channelId = channelIdRaw.length ? channelIdRaw : null;
    const hallOfFameChannelId =
      String(formData.get("hallOfFameChannelId") ?? "").trim() || null;
    const hallOfFameEnabled =
      String(formData.get("hallOfFameEnabled") ?? "") === "on" &&
      Boolean(hallOfFameChannelId);

    if (!guildId || !guildName) {
      return;
    }

    await prisma.$transaction(async (tx) => {
      const gameGuild = await tx.guild.upsert({
        where: { discordId: guildId },
        update: { name: guildName, isActive: true },
        create: { discordId: guildId, name: guildName, isActive: true }
      });
      await tx.guildConfiguration.upsert({
        where: { guildId: gameGuild.id },
        update: {
          gameChannelId: channelId,
          hallOfFameChannelId,
          hallOfFameEnabled,
          version: { increment: 1 }
        },
        create: {
          guildId: gameGuild.id,
          gameChannelId: channelId,
          hallOfFameChannelId,
          hallOfFameEnabled
        }
      });
    });

    await prisma.adminLog.create({
      data: {
        adminId: admin.id,
        action: "CONFIG_GUILD_CHANNELS_UPDATED",
        target: guildId,
        metadata: {
          guildName,
          gameChannelId: channelId,
          hallOfFameChannelId,
          hallOfFameEnabled
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
  const config = await prisma.appConfig.upsert({
    where: { id: "default" },
    update: {},
    create: { id: "default" }
  });
  const guildRows = await prisma.guild.findMany({
    include: { config: true },
    orderBy: [{ isActive: "desc" }, { name: "asc" }]
  });
  const guilds = guildRows.map((guild) => ({
    guildId: guild.discordId,
    guildName: guild.name,
    isPrimary: guild.isPrimary,
    isActive: guild.isActive,
    gameChannelId: guild.config?.gameChannelId ?? null,
    hallOfFameChannelId: guild.config?.hallOfFameChannelId ?? null,
    hallOfFameEnabled: guild.config?.hallOfFameEnabled ?? false
  }));
  const guildChannels = await Promise.all(
    guilds.map(async (guild) => ({
      guildId: guild.guildId,
      channels: await fetchGuildGameChannels(guild.guildId)
    }))
  );
  const channelMap = new Map(guildChannels.map((entry) => [entry.guildId, entry.channels]));

  return (
    <section className="card">
      <h1>Admin Config</h1>
      <p>Mode de jeu : exploration V2 déclenchée par les joueurs</p>
      <p>Serveurs detectes: {guilds.length}</p>

      <article style={{ border: "1px solid #ddd", borderRadius: "8px", padding: "12px", marginTop: "12px" }}>
        <h2>Exploration V2</h2>
        <p>
          Les rencontres partent du hub persistant créé par <code>/explore</code>.
        </p>
      </article>

      <article style={{ border: "1px solid #ddd", borderRadius: "8px", padding: "12px", marginTop: "12px" }}>
        <h2>Economy Settings</h2>
        <form action={updateEconomySettings} style={{ display: "grid", gap: "8px", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" }}>
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
          return (
            <article key={guild.guildId} style={{ border: "1px solid #ddd", borderRadius: "8px", padding: "12px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", alignItems: "center" }}>
                <div>
                  <strong>{guild.guildName}</strong>
                  {guild.isPrimary && (
                    <span style={{ marginLeft: "8px" }}>🏆 Serveur principal</span>
                  )}
                  <div style={{ color: "var(--muted)", fontSize: "0.9rem" }}>{guild.guildId}</div>
                </div>
                <span style={{ fontSize: "0.85rem", color: guild.isActive ? "#2e7d32" : "#c62828" }}>
                  {guild.isActive ? "Actif" : "Inactif"}
                </span>
              </div>

              <form action={updateGameChannel} style={{ display: "grid", gap: "8px", marginTop: "12px", maxWidth: "520px" }}>
                <input type="hidden" name="guildId" value={guild.guildId} />
                <input type="hidden" name="guildName" value={guild.guildName} />
                <label htmlFor={`gameChannelId-${guild.guildId}`}>Salon de jeu / exploration</label>
                <select id={`gameChannelId-${guild.guildId}`} name="gameChannelId" defaultValue={guild.gameChannelId ?? ""}>
                  <option value="">Aucun salon configure</option>
                  {channels.map((channel) => (
                    <option key={channel.id} value={channel.id}>#{channel.name}</option>
                  ))}
                </select>
                <small>
                  Salon actuel: {guild.gameChannelId || "aucun"}
                </small>
                <label htmlFor={`hallOfFameChannelId-${guild.guildId}`}>
                  Salon Hall of Fame
                </label>
                <select
                  id={`hallOfFameChannelId-${guild.guildId}`}
                  name="hallOfFameChannelId"
                  defaultValue={guild.hallOfFameChannelId ?? ""}
                >
                  <option value="">Aucun salon configuré</option>
                  {guild.hallOfFameChannelId &&
                    !channels.some((channel) => channel.id === guild.hallOfFameChannelId) && (
                      <option value={guild.hallOfFameChannelId}>
                        Salon actuel ({guild.hallOfFameChannelId})
                      </option>
                    )}
                  {channels.map((channel) => (
                    <option key={channel.id} value={channel.id}>#{channel.name}</option>
                  ))}
                </select>
                <label style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                  <input
                    type="checkbox"
                    name="hallOfFameEnabled"
                    defaultChecked={guild.hallOfFameEnabled}
                  />
                  Hall of Fame actif sur ce serveur
                </label>
                <small>
                  Les captures Shiny et Holo y seront annoncées uniquement si cette option est
                  activée et qu’un salon est sélectionné.
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


