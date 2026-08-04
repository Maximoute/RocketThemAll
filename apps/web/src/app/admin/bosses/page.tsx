import {
  prisma,
  type BossCategory,
  type BossMechanic
} from "@rta/database";
import { BossService } from "@rta/services";
import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "../../../lib/guard";

const bossService = new BossService();
const DISCORD_SNOWFLAKE = /^\d{17,20}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const mechanics: Array<{ value: BossMechanic; label: string }> = [
  { value: "OFFERING", label: "Offrande de crédits" },
  { value: "HARMONIZATION", label: "Harmonisation de cartes" },
  { value: "HUNT", label: "Chasse par captures" },
  { value: "EXPEDITION_MINION", label: "Créatures d’expédition" },
  { value: "COLLECTIVE_COLLECTION", label: "Collection collective" }
];
const categories: Array<{ value: BossCategory; label: string }> = [
  { value: "TREASURE_GUARDIAN", label: "Gardien de trésor" },
  { value: "CARD_PREDATOR", label: "Prédateur de cartes" },
  { value: "WORLD_INVADER", label: "Envahisseur de monde" }
];

function optionalPositiveInteger(value: FormDataEntryValue | null) {
  if (value === null || String(value).trim() === "") return undefined;
  const parsed = Math.trunc(Number(value));
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : undefined;
}

function redirectBossError(error: unknown): never {
  const message = error instanceof Error ? error.message : "Action de boss impossible.";
  redirect(`/admin/bosses?error=${encodeURIComponent(message)}`);
}

export default async function AdminBossesPage({
  searchParams: searchParamsPromise
}: {
  searchParams: Promise<{ notice?: string; error?: string }>;
}) {
  const searchParams = await searchParamsPromise;
  async function updateBossConfig(formData: FormData) {
    "use server";
    const admin = await requireAdmin();
    const guildDiscordId = String(formData.get("guildDiscordId") ?? "");
    const timezone = String(formData.get("timezone") ?? "Europe/Paris").trim();
    if (!DISCORD_SNOWFLAKE.test(guildDiscordId) || timezone.length > 64) {
      redirect("/admin/bosses?error=Configuration de serveur invalide.");
    }
    try {
      new Intl.DateTimeFormat("fr-FR", { timeZone: timezone }).format(new Date());
    } catch {
      redirect("/admin/bosses?error=Fuseau horaire invalide.");
    }
    const guild = await prisma.guild.findUniqueOrThrow({
      where: { discordId: guildDiscordId }
    }).catch(redirectBossError);
    const progressionBossEnabled =
      String(formData.get("progressionBossEnabled") ?? "") === "on";
    const regularBossEnabled =
      String(formData.get("regularBossEnabled") ?? "") === "on";
    await prisma.$transaction([
      prisma.guildConfiguration.upsert({
        where: { guildId: guild.id },
        update: {
          progressionBossEnabled,
          regularBossEnabled,
          timezone,
          version: { increment: 1 }
        },
        create: {
          guildId: guild.id,
          progressionBossEnabled,
          regularBossEnabled,
          timezone
        }
      }),
      prisma.adminLog.create({
        data: {
          adminId: admin.id,
          action: "GUILD_BOSS_CONFIG_UPDATED",
          target: guild.discordId,
          metadata: {
            progressionBossEnabled,
            regularBossEnabled,
            timezone
          }
        }
      })
    ]).catch(redirectBossError);
    await bossService.reconcileProgressionBosses().catch(redirectBossError);
    await bossService.reconcileDailyBosses().catch(redirectBossError);
    revalidatePath("/admin/bosses");
    redirect("/admin/bosses?notice=Configuration des boss enregistrée.");
  }

  async function startRegularBoss(formData: FormData) {
    "use server";
    const admin = await requireAdmin();
    const guildDiscordId = String(formData.get("guildDiscordId") ?? "");
    const definitionKey = String(formData.get("definitionKey") ?? "");
    const mechanicRaw = String(formData.get("mechanic") ?? "");
    const mechanic = mechanics.some((entry) => entry.value === mechanicRaw)
      ? mechanicRaw as BossMechanic
      : undefined;
    const categoryRaw = String(formData.get("category") ?? "TREASURE_GUARDIAN");
    const category = categories.some((entry) => entry.value === categoryRaw)
      ? categoryRaw as BossCategory
      : null;
    if (
      !DISCORD_SNOWFLAKE.test(guildDiscordId) ||
      !definitionKey ||
      definitionKey.length > 120 ||
      (mechanicRaw && !mechanic) ||
      !category
    ) {
      redirect("/admin/bosses?error=Paramètres de boss invalides.");
    }
    const target = optionalPositiveInteger(formData.get("target"));
    const durationHours = optionalPositiveInteger(formData.get("durationHours"));
    const run = await bossService.scheduleBoss({
      guildDiscordId,
      definitionKey,
      mechanic,
      category,
      target,
      durationHours,
      slotKey: `admin:${definitionKey}:${randomUUID()}`
    }).catch(redirectBossError);
    await prisma.adminLog.create({
      data: {
        adminId: admin.id,
        action: "REGULAR_BOSS_STARTED",
        target: run.id,
        metadata: { guildDiscordId, definitionKey, mechanic, category, target, durationHours }
      }
    });
    revalidatePath("/admin/bosses");
    redirect("/admin/bosses?notice=Boss standard démarré.");
  }

  async function startGuardianNow(formData: FormData) {
    "use server";
    const admin = await requireAdmin();
    const guildDiscordId = String(formData.get("guildDiscordId") ?? "");
    if (!DISCORD_SNOWFLAKE.test(guildDiscordId)) {
      redirect("/admin/bosses?error=Serveur Discord invalide.");
    }
    const guild = await prisma.guild.findUniqueOrThrow({
      where: { discordId: guildDiscordId },
      include: { progress: true }
    }).catch(redirectBossError);
    if (!guild.progress?.frontierWorldId || guild.progress.state !== "BOSS_READY") {
      redirect("/admin/bosses?error=Le gardien de ce serveur n’est pas encore prêt.");
    }
    const guardian = await prisma.bossDefinition.findFirstOrThrow({
      where: {
        kind: "GUARDIAN",
        status: "PUBLISHED",
        worldId: guild.progress.frontierWorldId
      }
    }).catch(redirectBossError);
    const run = await bossService.scheduleBoss({
      guildDiscordId,
      definitionKey: guardian.contentKey,
      startsAt: new Date(),
      slotKey: `admin-guardian:${guardian.contentKey}:${randomUUID()}`
    }).catch(redirectBossError);
    await prisma.adminLog.create({
      data: {
        adminId: admin.id,
        action: "PROGRESSION_GUARDIAN_STARTED",
        target: run.id,
        metadata: { guildDiscordId, guardianKey: guardian.contentKey }
      }
    });
    revalidatePath("/admin/bosses");
    redirect("/admin/bosses?notice=Gardien de progression démarré.");
  }

  async function cancelBoss(formData: FormData) {
    "use server";
    const admin = await requireAdmin();
    const bossRunId = String(formData.get("bossRunId") ?? "");
    if (!UUID.test(bossRunId)) redirect("/admin/bosses?error=Boss invalide.");
    const run = await bossService.cancelRun(bossRunId).catch(redirectBossError);
    await prisma.adminLog.create({
      data: {
        adminId: admin.id,
        action: "BOSS_RUN_CANCELLED",
        target: run.id,
        metadata: { guildId: run.guildId }
      }
    });
    revalidatePath("/admin/bosses");
    redirect("/admin/bosses?notice=Boss annulé.");
  }

  await requireAdmin();
  const [guilds, definitions, recentRuns] = await Promise.all([
    prisma.guild.findMany({
      where: { isActive: true },
      include: {
        config: true,
        progress: { include: { frontierWorld: true } },
        bossRuns: {
          where: { status: { in: ["SCHEDULED", "ACTIVE"] } },
          include: { definition: true },
          orderBy: [{ isPersistent: "desc" }, { startsAt: "asc" }],
          take: 2
        }
      },
      orderBy: [{ isPrimary: "desc" }, { name: "asc" }]
    }),
    prisma.bossDefinition.findMany({
      where: { status: "PUBLISHED", kind: "REGULAR" },
      include: { world: true },
      orderBy: [{ world: { position: "asc" } }, { name: "asc" }]
    }),
    prisma.bossRun.findMany({
      include: {
        guild: true,
        definition: true,
        _count: { select: { contributions: true, rewardGrants: true } }
      },
      orderBy: { createdAt: "desc" },
      take: 30
    })
  ]);

  return (
    <section>
      <h1 style={{ marginTop: 0 }}>Boss et progression</h1>
      <p>
        Le boss journalier apparaît à minuit et reste actif 24 heures. Le gardien du monde
        possède une progression séparée et reste actif jusqu’à sa défaite. Les deux peuvent
        être actifs simultanément.
      </p>
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

      {guilds.map((guild) => {
        const guardianRun = guild.bossRuns.find((run) => run.definition.kind === "GUARDIAN");
        const regularRun = guild.bossRuns.find((run) => run.definition.kind === "REGULAR");
        return (
          <article key={guild.id} className="card" style={{ marginBottom: "16px" }}>
            <h2>{guild.name} {guild.isPrimary ? "· principal" : ""}</h2>
            <p>
              Progression : <strong>{guild.progress?.frontierWorld?.name ?? "Non initialisée"}</strong>
              {" · "}{guild.progress?.mastery ?? 0}/{guild.progress?.masteryTarget ?? 0}
              {" · "}{guild.progress?.state ?? "PROGRESSING"}
            </p>
            {guild.bossRuns.map((run) => (
              <div
                key={run.id}
                style={{
                  padding: "10px",
                  marginTop: "8px",
                  border: `1px solid ${run.isPersistent ? "#7c3aed" : "#ef4444"}`,
                  borderRadius: "8px"
                }}
              >
                <strong>{run.definition.name}</strong>
                {" · "}{run.isPersistent ? "Gardien persistant" : "Boss journalier"}
                {" · "}{run.status}{" · "}{run.progress}/{run.targetSnapshot}
                <form action={cancelBoss} style={{ display: "inline", marginLeft: "12px" }}>
                  <input type="hidden" name="bossRunId" value={run.id} />
                  <button type="submit">Annuler</button>
                </form>
              </div>
            ))}

            <details style={{ marginTop: "12px" }}>
              <summary>Configuration automatique</summary>
              <form action={updateBossConfig} style={{ display: "flex", gap: "10px", flexWrap: "wrap", paddingTop: "10px" }}>
                <input type="hidden" name="guildDiscordId" value={guild.discordId} />
                <label>
                  <input
                    type="checkbox"
                    name="progressionBossEnabled"
                    defaultChecked={guild.config?.progressionBossEnabled ?? true}
                  /> Gardiens automatiques
                </label>
                <label>
                  <input
                    type="checkbox"
                    name="regularBossEnabled"
                    defaultChecked={guild.config?.regularBossEnabled ?? true}
                  /> Boss standards
                </label>
                <input
                  name="timezone"
                  defaultValue={guild.config?.timezone ?? "Europe/Paris"}
                  placeholder="Europe/Paris"
                />
                <button type="submit">Enregistrer</button>
              </form>
            </details>

            {!guardianRun && guild.progress?.state === "BOSS_READY" && (
              <form action={startGuardianNow} style={{ marginTop: "12px" }}>
                <input type="hidden" name="guildDiscordId" value={guild.discordId} />
                <button type="submit">Lancer le gardien prêt maintenant</button>
              </form>
            )}

            {!regularRun && (
              <details style={{ marginTop: "12px" }}>
                <summary>Lancer un boss standard maintenant</summary>
                <form action={startRegularBoss} style={{ display: "grid", gap: "8px", maxWidth: "620px", paddingTop: "10px" }}>
                  <input type="hidden" name="guildDiscordId" value={guild.discordId} />
                  <select name="definitionKey" required>
                    {definitions.map((definition) => (
                      <option key={definition.id} value={definition.contentKey}>
                        {definition.world?.name} · {definition.name}
                      </option>
                    ))}
                  </select>
                  <select name="mechanic" defaultValue="">
                    <option value="">Mécanique recommandée par le Vault</option>
                    {mechanics.map((mechanic) => (
                      <option key={mechanic.value} value={mechanic.value}>{mechanic.label}</option>
                    ))}
                  </select>
                  <select name="category" defaultValue="TREASURE_GUARDIAN">
                    {categories.map((category) => (
                      <option key={category.value} value={category.value}>{category.label}</option>
                    ))}
                  </select>
                  <div style={{ display: "flex", gap: "8px" }}>
                    <input name="target" type="number" min={1} placeholder="Objectif automatique" />
                    <input name="durationHours" type="number" min={1} placeholder="Durée automatique" />
                  </div>
                  <button type="submit">Démarrer le boss</button>
                </form>
              </details>
            )}
          </article>
        );
      })}

      <h2>30 dernières exécutions</h2>
      <div style={{ overflowX: "auto" }}>
        <table>
          <thead>
            <tr>
              <th>Serveur</th>
              <th>Boss</th>
              <th>Mécanique</th>
              <th>État</th>
              <th>Progression</th>
              <th>Actions</th>
              <th>Récompensés</th>
            </tr>
          </thead>
          <tbody>
            {recentRuns.map((run) => (
              <tr key={run.id}>
                <td>{run.guild.name}</td>
                <td>{run.definition.name}</td>
                <td>{run.mechanic}</td>
                <td>{run.status}</td>
                <td>{run.progress}/{run.targetSnapshot}</td>
                <td>{run._count.contributions}</td>
                <td>{run._count.rewardGrants}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
