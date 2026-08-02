import { prisma } from "@rta/database";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "../../../lib/guard";
import { fetchGuildGameChannels } from "../../../lib/discord-admin";

const DISCORD_SNOWFLAKE = /^\d{17,20}$/;

export default async function AdminServersPage() {
  const admin = await requireAdmin();

  async function setPrimaryGuild(formData: FormData) {
    "use server";
    const currentAdmin = await requireAdmin();
    const discordId = String(formData.get("guildId") ?? "").trim();
    if (!DISCORD_SNOWFLAKE.test(discordId)) return;

    await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(9842072701)`;
      const guild = await tx.guild.findUnique({
        where: { discordId },
        select: { id: true, name: true, isPrimary: true }
      });
      if (!guild || guild.isPrimary) return;

      await tx.guild.updateMany({
        where: { isPrimary: true },
        data: { isPrimary: false }
      });
      await tx.guild.update({
        where: { id: guild.id },
        data: { isPrimary: true }
      });
      await tx.adminLog.create({
        data: {
          adminId: currentAdmin.id,
          action: "PRIMARY_GUILD_UPDATED",
          target: discordId,
          metadata: { guildName: guild.name }
        }
      });
    });

    revalidatePath("/admin/servers");
    revalidatePath("/admin/config");
  }

  async function updateGuildConfig(formData: FormData) {
    "use server";
    const currentAdmin = await requireAdmin();
    const discordId = String(formData.get("guildId") ?? "").trim();
    const gameChannelId = String(formData.get("gameChannelId") ?? "").trim() || null;
    const requestedHallOfFameChannelId =
      String(formData.get("hallOfFameChannelId") ?? "").trim() || null;
    const requestedHallOfFameEnabled =
      String(formData.get("hallOfFameEnabled") ?? "") === "on";
    const bossAnnouncementChannelId =
      String(formData.get("bossAnnouncementChannelId") ?? "").trim() || null;
    const bossAnnouncementEnabled =
      String(formData.get("bossAnnouncementEnabled") ?? "") === "on" &&
      Boolean(bossAnnouncementChannelId);
    const isActive = String(formData.get("isActive") ?? "") === "on";
    if (!DISCORD_SNOWFLAKE.test(discordId)) return;
    if (gameChannelId && !DISCORD_SNOWFLAKE.test(gameChannelId)) return;
    if (
      requestedHallOfFameChannelId &&
      !DISCORD_SNOWFLAKE.test(requestedHallOfFameChannelId)
    ) return;
    if (bossAnnouncementChannelId && !DISCORD_SNOWFLAKE.test(bossAnnouncementChannelId)) return;

    await prisma.$transaction(async (tx) => {
      const guild = await tx.guild.findUnique({
        where: { discordId },
        select: { id: true, isPrimary: true }
      });
      if (!guild) return;
      const hallOfFameChannelId = guild.isPrimary
        ? requestedHallOfFameChannelId
        : null;
      const hallOfFameEnabled = Boolean(
        guild.isPrimary && requestedHallOfFameEnabled && hallOfFameChannelId
      );
      const selectedChannels = [
        gameChannelId,
        hallOfFameChannelId,
        bossAnnouncementChannelId
      ].filter((channelId): channelId is string => Boolean(channelId));
      if (new Set(selectedChannels).size !== selectedChannels.length) return;
      await tx.guild.update({
        where: { id: guild.id },
        data: { isActive }
      });
      await tx.guildConfiguration.upsert({
        where: { guildId: guild.id },
        update: {
          gameChannelId,
          hallOfFameChannelId,
          hallOfFameEnabled,
          bossAnnouncementChannelId,
          bossAnnouncementEnabled,
          version: { increment: 1 }
        },
        create: {
          guildId: guild.id,
          gameChannelId,
          hallOfFameChannelId,
          hallOfFameEnabled,
          bossAnnouncementChannelId,
          bossAnnouncementEnabled
        }
      });
      await tx.adminLog.create({
        data: {
          adminId: currentAdmin.id,
          action: "CONFIG_GUILD_UPDATED",
          target: discordId,
          metadata: {
            gameChannelId,
            hallOfFameChannelId,
            hallOfFameEnabled,
            bossAnnouncementChannelId,
            bossAnnouncementEnabled,
            isActive
          }
        }
      });
    });

    revalidatePath("/admin/servers");
    revalidatePath("/admin/config");
  }

  const guilds = await prisma.guild.findMany({
    include: { config: true },
    orderBy: [{ isPrimary: "desc" }, { name: "asc" }]
  });
  const guildChannels = await Promise.all(
    guilds.map(async (guild) => ({
      guildId: guild.discordId,
      channels: await fetchGuildGameChannels(guild.discordId)
    }))
  );
  const channelMap = new Map(guildChannels.map((entry) => [entry.guildId, entry.channels]));

  return (
    <section>
      <h1 style={{ marginTop: 0, marginBottom: "4px" }}>Gestion des serveurs</h1>
      <p style={{ color: "#6b5f4f", marginBottom: "20px" }}>
        Choisis le serveur principal, configure le centre <strong>/explore</strong> et active le
        Hall of Fame central du serveur principal et le salon d’annonce des boss.
      </p>

      {!guilds.some((guild) => guild.isPrimary) && (
        <div className="card" style={{ borderColor: "#f59e0b", marginBottom: "16px" }}>
          Aucun serveur principal n’est défini. Utilise le bouton d’un serveur ci-dessous.
        </div>
      )}

      {guilds.length === 0 && (
        <div className="card">
          <p>Aucun serveur enregistré. Redémarre le bot pour synchroniser ses serveurs Discord.</p>
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
        {guilds.map((guild) => {
          const channels = channelMap.get(guild.discordId) ?? [];
          const currentGameChannelId = guild.config?.gameChannelId ?? "";
          const currentHallChannelId = guild.config?.hallOfFameChannelId ?? "";
          const currentBossChannelId = guild.config?.bossAnnouncementChannelId ?? "";
          const currentGameChannel = channels.find(
            (channel) => channel.id === currentGameChannelId
          );
          const currentHallChannel = channels.find(
            (channel) => channel.id === currentHallChannelId
          );
          const currentBossChannel = channels.find(
            (channel) => channel.id === currentBossChannelId
          );
          const gameChannelIsListed = channels.some(
            (channel) => channel.id === currentGameChannelId
          );
          const hallChannelIsListed = channels.some(
            (channel) => channel.id === currentHallChannelId
          );
          const bossChannelIsListed = channels.some(
            (channel) => channel.id === currentBossChannelId
          );

          return (
            <article key={guild.id} className="card">
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  flexWrap: "wrap",
                  gap: "10px",
                  marginBottom: "12px"
                }}
              >
                <div>
                  <h2 style={{ margin: 0, fontSize: "16px" }}>{guild.name}</h2>
                  <code style={{ fontSize: "11px", color: "#6b5f4f" }}>
                    {guild.discordId}
                  </code>
                </div>
                {guild.isPrimary ? (
                  <span
                    style={{
                      background: "#fef3c7",
                      color: "#92400e",
                      padding: "2px 8px",
                      borderRadius: "12px",
                      fontSize: "12px",
                      fontWeight: 700
                    }}
                  >
                    Serveur principal
                  </span>
                ) : (
                  <form action={setPrimaryGuild}>
                    <input type="hidden" name="guildId" value={guild.discordId} />
                    <button
                      type="submit"
                      style={{
                        padding: "5px 10px",
                        background: "#fff7ed",
                        color: "#9a3412",
                        border: "1px solid #fdba74",
                        borderRadius: "8px",
                        cursor: "pointer",
                        fontSize: "12px",
                        fontWeight: 700
                      }}
                    >
                      Définir comme serveur principal
                    </button>
                  </form>
                )}
                <span
                  style={{
                    marginLeft: "auto",
                    background: guild.isActive ? "#dcfce7" : "#fee2e2",
                    color: guild.isActive ? "#166534" : "#991b1b",
                    padding: "2px 8px",
                    borderRadius: "12px",
                    fontSize: "12px"
                  }}
                >
                  {guild.isActive ? "Actif" : "Inactif"}
                </span>
              </div>

              <form action={updateGuildConfig}>
                <input type="hidden" name="guildId" value={guild.discordId} />
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
                    gap: "16px",
                    marginBottom: "16px"
                  }}
                >
                  <div>
                    <label
                      htmlFor={`gameChannelId-${guild.id}`}
                      style={{
                        display: "block",
                        fontSize: "12px",
                        fontWeight: 600,
                        color: "#6b5f4f",
                        marginBottom: "4px"
                      }}
                    >
                      Salon de jeu / exploration
                    </label>
                    <select
                      id={`gameChannelId-${guild.id}`}
                      name="gameChannelId"
                      defaultValue={currentGameChannelId}
                      style={{
                        width: "100%",
                        padding: "7px 10px",
                        border: "1px solid #e4d8c6",
                        borderRadius: "8px",
                        fontSize: "13px"
                      }}
                    >
                      <option value="">Aucun salon configuré</option>
                      {currentGameChannelId && !gameChannelIsListed && (
                        <option value={currentGameChannelId}>
                          Salon actuel ({currentGameChannelId})
                        </option>
                      )}
                      {channels.map((channel) => (
                        <option
                          key={channel.id}
                          value={channel.id}
                          disabled={!channel.botCanPublish && channel.id !== currentGameChannelId}
                        >
                          #{channel.name}
                          {!channel.botCanPublish
                            ? ` — bot bloqué : ${channel.missingPermissions.join(", ")}`
                            : ""}
                        </option>
                      ))}
                    </select>
                    {currentGameChannel && !currentGameChannel.botCanPublish && (
                      <small style={{ display: "block", color: "#b91c1c", marginTop: "6px" }}>
                        Publication impossible directement : autorise le bot à {currentGameChannel.missingPermissions.join(", ")}.
                      </small>
                    )}
                  </div>

                  {guild.isPrimary ? (
                    <div>
                      <label htmlFor={`hallOfFameChannelId-${guild.id}`} style={{
                        display: "block", fontSize: "12px", fontWeight: 600,
                        color: "#6b5f4f", marginBottom: "4px"
                      }}>
                        Hall of Fame central
                      </label>
                      <select
                        id={`hallOfFameChannelId-${guild.id}`}
                        name="hallOfFameChannelId"
                        defaultValue={currentHallChannelId}
                        style={{ width: "100%", padding: "7px 10px", border: "1px solid #e4d8c6", borderRadius: "8px", fontSize: "13px" }}
                      >
                        <option value="">Aucun salon configuré</option>
                        {currentHallChannelId && !hallChannelIsListed && (
                          <option value={currentHallChannelId}>Salon actuel ({currentHallChannelId})</option>
                        )}
                        {channels.map((channel) => (
                          <option
                            key={channel.id}
                            value={channel.id}
                            disabled={!channel.botCanPublish && channel.id !== currentHallChannelId}
                          >
                            #{channel.name}
                            {!channel.botCanPublish
                              ? ` — bot bloqué : ${channel.missingPermissions.join(", ")}`
                              : ""}
                          </option>
                        ))}
                      </select>
                      {currentHallChannel && !currentHallChannel.botCanPublish && (
                        <small style={{ display: "block", color: "#b91c1c", marginTop: "6px" }}>
                          Annonce impossible : autorise le bot à {currentHallChannel.missingPermissions.join(", ")}.
                        </small>
                      )}
                      <label style={{ display: "flex", alignItems: "center", gap: "8px", marginTop: "8px", cursor: "pointer" }}>
                        <input type="checkbox" name="hallOfFameEnabled" defaultChecked={guild.config?.hallOfFameEnabled ?? false} />
                        <span style={{ fontSize: "13px" }}>Hall of Fame actif</span>
                      </label>
                      <small style={{ color: "#6b5f4f" }}>
                        Reçoit les Shiny/Holo de tous les serveurs RTA. Seul <code>/showcard</code> y est autorisé.
                      </small>
                    </div>
                  ) : (
                    <div style={{ fontSize: "12px", color: "#6b5f4f" }}>
                      <strong>Hall of Fame centralisé</strong><br />
                      Les découvertes de ce serveur sont publiées dans le Hall du serveur principal.
                    </div>
                  )}

                  <div>
                    <label htmlFor={`bossAnnouncementChannelId-${guild.id}`} style={{
                      display: "block", fontSize: "12px", fontWeight: 600,
                      color: "#6b5f4f", marginBottom: "4px"
                    }}>
                      Salon d’annonce des boss
                    </label>
                    <select
                      id={`bossAnnouncementChannelId-${guild.id}`}
                      name="bossAnnouncementChannelId"
                      defaultValue={currentBossChannelId}
                      style={{ width: "100%", padding: "7px 10px", border: "1px solid #e4d8c6", borderRadius: "8px", fontSize: "13px" }}
                    >
                      <option value="">Aucun salon configuré</option>
                      {currentBossChannelId && !bossChannelIsListed && (
                        <option value={currentBossChannelId}>Salon actuel ({currentBossChannelId})</option>
                      )}
                      {channels.map((channel) => (
                        <option
                          key={channel.id}
                          value={channel.id}
                          disabled={!channel.botCanPublish && channel.id !== currentBossChannelId}
                        >
                          #{channel.name}
                          {!channel.botCanPublish
                            ? ` — bot bloqué : ${channel.missingPermissions.join(", ")}`
                            : ""}
                        </option>
                      ))}
                    </select>
                    {currentBossChannel && !currentBossChannel.botCanPublish && (
                      <small style={{ display: "block", color: "#b91c1c", marginTop: "6px" }}>
                        Annonce impossible : autorise le bot à {currentBossChannel.missingPermissions.join(", ")}.
                      </small>
                    )}
                    <label style={{ display: "flex", alignItems: "center", gap: "8px", marginTop: "8px", cursor: "pointer" }}>
                      <input type="checkbox" name="bossAnnouncementEnabled" defaultChecked={guild.config?.bossAnnouncementEnabled ?? false} />
                      <span style={{ fontSize: "13px" }}>Annonces de boss actives</span>
                    </label>
                  </div>

                  <div style={{ display: "grid", alignContent: "start", gap: "10px" }}>
                    <label
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "8px",
                        cursor: "pointer"
                      }}
                    >
                      <input type="checkbox" name="isActive" defaultChecked={guild.isActive} />
                      <span style={{ fontSize: "13px" }}>RTA actif sur ce serveur</span>
                    </label>
                    {guild.isPrimary && !currentHallChannelId && (
                      <small style={{ color: "#9a3412" }}>
                        Sélectionne un salon pour pouvoir activer le Hall of Fame.
                      </small>
                    )}
                    {!currentBossChannelId && (
                      <small style={{ color: "#9a3412" }}>
                        Sélectionne un salon pour annoncer l’apparition des boss.
                      </small>
                    )}
                  </div>
                </div>

                <button
                  type="submit"
                  style={{
                    padding: "8px 18px",
                    background: "#d97706",
                    color: "white",
                    border: "none",
                    borderRadius: "8px",
                    cursor: "pointer",
                    fontWeight: 600
                  }}
                >
                  Enregistrer
                </button>
              </form>
            </article>
          );
        })}
      </div>
    </section>
  );
}
