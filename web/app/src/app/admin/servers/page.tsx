import { prisma } from "@rta/database";
import { requireAdmin } from "../../../lib/guard";
import { revalidatePath } from "next/cache";

export default async function AdminServersPage() {
  const admin = await requireAdmin();

  async function updateGuildConfig(formData: FormData) {
    "use server";
    await requireAdmin();
    const guildId = String(formData.get("guildId") ?? "").trim();
    const spawnChannelId = String(formData.get("spawnChannelId") ?? "").trim() || null;
    const autoSpawnEnabled = String(formData.get("autoSpawnEnabled") ?? "") === "on";
    const autoSpawnIntervalMinutesRaw = Number(formData.get("autoSpawnIntervalMinutes") ?? 5);
    const autoSpawnIntervalMinutes = Number.isFinite(autoSpawnIntervalMinutesRaw)
      ? Math.max(1, Math.floor(autoSpawnIntervalMinutesRaw))
      : 5;
    const isActive = String(formData.get("isActive") ?? "") === "on";
    const rawDecks = formData.getAll("allowedDecks").map(String).filter(Boolean);

    if (!guildId) return;

    await prisma.botGuildConfig.update({
      where: { guildId },
      data: { spawnChannelId, autoSpawnEnabled, autoSpawnIntervalMinutes, isActive, allowedDecks: rawDecks }
    });

    await prisma.adminLog.create({
      data: {
        adminId: admin.id,
        action: "CONFIG_GUILD_UPDATED",
        target: guildId,
        metadata: { spawnChannelId, autoSpawnEnabled, autoSpawnIntervalMinutes, isActive, allowedDecks: rawDecks }
      }
    });

    revalidatePath("/admin/servers");
  }

  const [guilds, allDecks] = await Promise.all([
    prisma.botGuildConfig.findMany({ orderBy: { guildName: "asc" } }),
    prisma.deck.findMany({ orderBy: { name: "asc" } }),
  ]);

  return (
    <section>
      <h1 style={{ marginTop: 0, marginBottom: "4px" }}>🖥️ Gestion Serveurs</h1>
      <p style={{ color: "#6b5f4f", marginBottom: "20px" }}>
        Configurez le canal de spawn, le spawn automatique, la frequence et les decks autorisés par serveur.
        Si aucun deck n&apos;est coché, <strong>tous les decks</strong> sont autorisés au spawn.
      </p>

      {guilds.length === 0 && (
        <div className="card">
          <p>Aucun serveur enregistré. Le bot doit rejoindre un serveur pour que la configuration apparaisse ici.</p>
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
        {guilds.map((guild) => (
          <article key={guild.guildId} className="card">
            <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "12px" }}>
              <div style={{
                width: "40px", height: "40px", borderRadius: "8px",
                background: "#ffeccf", border: "1px solid #d9b78a",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: "20px", flexShrink: 0
              }}>
                🖥️
              </div>
              <div>
                <h2 style={{ margin: 0, fontSize: "16px" }}>{guild.guildName}</h2>
                <code style={{ fontSize: "11px", color: "#6b5f4f" }}>{guild.guildId}</code>
              </div>
              <div style={{ marginLeft: "auto", display: "flex", gap: "6px" }}>
                {guild.isActive
                  ? <span style={{ background: "#dcfce7", color: "#166534", padding: "2px 8px", borderRadius: "12px", fontSize: "12px" }}>✓ Actif</span>
                  : <span style={{ background: "#fee2e2", color: "#991b1b", padding: "2px 8px", borderRadius: "12px", fontSize: "12px" }}>✗ Inactif</span>}
                {guild.autoSpawnEnabled
                  ? <span style={{ background: "#dbeafe", color: "#1e40af", padding: "2px 8px", borderRadius: "12px", fontSize: "12px" }}>Auto-spawn ON</span>
                  : <span style={{ background: "#f3f4f6", color: "#374151", padding: "2px 8px", borderRadius: "12px", fontSize: "12px" }}>Auto-spawn OFF</span>}
                <span style={{ background: "#fff7ed", color: "#9a3412", padding: "2px 8px", borderRadius: "12px", fontSize: "12px" }}>
                  {guild.autoSpawnIntervalMinutes} min
                </span>
              </div>
            </div>

            <form action={updateGuildConfig}>
              <input type="hidden" name="guildId" value={guild.guildId} />

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px", marginBottom: "16px" }}>
                <div>
                  <label style={{ display: "block", fontSize: "12px", fontWeight: 600, color: "#6b5f4f", marginBottom: "4px" }}>
                    Canal de spawn (ID)
                  </label>
                  <input
                    type="text"
                    name="spawnChannelId"
                    defaultValue={guild.spawnChannelId ?? ""}
                    placeholder="ID du salon Discord"
                    style={{ width: "100%", padding: "7px 10px", border: "1px solid #e4d8c6", borderRadius: "8px", fontSize: "13px" }}
                  />
                </div>

                <div>
                  <label style={{ display: "block", fontSize: "12px", fontWeight: 600, color: "#6b5f4f", marginBottom: "4px" }}>
                    Frequence auto-spawn (minutes)
                  </label>
                  <input
                    type="number"
                    min={1}
                    name="autoSpawnIntervalMinutes"
                    defaultValue={guild.autoSpawnIntervalMinutes ?? 5}
                    style={{ width: "100%", padding: "7px 10px", border: "1px solid #e4d8c6", borderRadius: "8px", fontSize: "13px" }}
                  />
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: "8px", justifyContent: "flex-end", paddingBottom: "2px" }}>
                  <label style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer" }}>
                    <input type="checkbox" name="autoSpawnEnabled" defaultChecked={guild.autoSpawnEnabled} />
                    <span style={{ fontSize: "13px" }}>Spawn automatique activé</span>
                  </label>
                  <label style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer" }}>
                    <input type="checkbox" name="isActive" defaultChecked={guild.isActive} />
                    <span style={{ fontSize: "13px" }}>Serveur actif</span>
                  </label>
                </div>
              </div>

              <div style={{ marginBottom: "14px" }}>
                <p style={{ margin: "0 0 8px", fontSize: "13px", fontWeight: 600, color: "#6b5f4f" }}>
                  📚 Decks autorisés au spawn{" "}
                  <span style={{ fontWeight: 400, color: "#9b8b7a" }}>
                    (aucune sélection = tous les decks)
                  </span>
                </p>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                  {allDecks.map((deck) => {
                    const isAllowed = guild.allowedDecks.length === 0 || guild.allowedDecks.includes(deck.name);
                    const isChecked = guild.allowedDecks.includes(deck.name);
                    return (
                      <label
                        key={deck.id}
                        style={{
                          display: "flex", alignItems: "center", gap: "6px",
                          padding: "5px 10px", borderRadius: "8px", cursor: "pointer",
                          border: `1px solid ${isChecked ? "#d9b78a" : "#e4d8c6"}`,
                          background: isChecked ? "#ffeccf" : "#fafaf8",
                          fontSize: "13px"
                        }}
                      >
                        <input
                          type="checkbox"
                          name="allowedDecks"
                          value={deck.name}
                          defaultChecked={isChecked}
                        />
                        {deck.name}
                        {guild.allowedDecks.length === 0 && (
                          <span style={{ fontSize: "10px", color: "#9b8b7a" }}>(actif par défaut)</span>
                        )}
                      </label>
                    );
                  })}
                </div>
              </div>

              <button
                type="submit"
                style={{
                  padding: "8px 18px", background: "#d97706", color: "white",
                  border: "none", borderRadius: "8px", cursor: "pointer", fontWeight: 600
                }}
              >
                💾 Enregistrer
              </button>
            </form>
          </article>
        ))}
      </div>
    </section>
  );
}
