import { prisma } from "@rta/database";
import { requireAdmin } from "../../../lib/guard";
import { revalidatePath } from "next/cache";

export default async function AdminConfigPage() {
  async function updateSpawnChannel(formData: FormData) {
    "use server";
    const admin = await requireAdmin();
    const channelIdRaw = String(formData.get("spawnChannelId") ?? "").trim();
    const channelId = channelIdRaw.length ? channelIdRaw : null;

    await prisma.appConfig.upsert({
      where: { id: "default" },
      update: { spawnChannelId: channelId },
      create: {
        id: "default",
        spawnIntervalS: 300,
        captureCooldownS: 5,
        spawnChannelId: channelId
      }
    });

    await prisma.adminLog.create({
      data: {
        adminId: admin.id,
        action: "CONFIG_SPAWN_CHANNEL_UPDATED",
        target: "default",
        metadata: { spawnChannelId: channelId }
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

  await requireAdmin();
  const config = await prisma.appConfig.findUnique({ where: { id: "default" } });

  return (
    <section className="card">
      <h1>Admin Config</h1>
      <p>Spawn interval: {config?.spawnIntervalS ?? 0}s</p>
      <p>Capture cooldown: {config?.captureCooldownS ?? 0}s</p>
      <p>Salon spawn Discord: {config?.spawnChannelId || "non configure (fallback .env)"}</p>

      <form action={updateSpawnChannel} style={{ display: "grid", gap: "8px", maxWidth: "520px", marginTop: "12px" }}>
        <label htmlFor="spawnChannelId">ID du salon Discord de spawn</label>
        <input
          id="spawnChannelId"
          name="spawnChannelId"
          type="text"
          placeholder="Ex: 1369374278042255401"
          defaultValue={config?.spawnChannelId ?? ""}
        />
        <small>
          Laisse vide pour utiliser DISCORD_SPAWN_CHANNEL_ID depuis le fichier .env.
        </small>
        <button type="submit">Enregistrer le salon de spawn</button>
      </form>

      <form action={forceSpawnNow} style={{ marginTop: "12px" }}>
        <button type="submit">Forcer une apparition maintenant</button>
      </form>

      <p style={{ marginTop: "12px" }}>Edition API: PATCH /config (admin).</p>
    </section>
  );
}


