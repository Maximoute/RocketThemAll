import { prisma } from "@rta/database";
import { ConfigService } from "@rta/services";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "../../lib/guard";
import {
  canUserManageGuild,
  fetchGuildGameChannels
} from "../../lib/discord-admin";

const DISCORD_SNOWFLAKE = /^\d{17,20}$/;
const configService = new ConfigService();

type SearchParams = {
  notice?: string;
  error?: string;
};

function setupRedirect(kind: "notice" | "error", message: string): never {
  redirect(`/setup?${kind}=${encodeURIComponent(message)}`);
}

export const dynamic = "force-dynamic";

export default async function GuildSetupPage({
  searchParams: searchParamsPromise
}: {
  searchParams: Promise<SearchParams>;
}) {
  const [user, searchParams] = await Promise.all([requireUser(), searchParamsPromise]);

  async function updateGameChannel(formData: FormData) {
    "use server";
    const actor = await requireUser();
    const guildId = String(formData.get("guildId") ?? "").trim();
    const gameChannelId = String(formData.get("gameChannelId") ?? "").trim();
    if (!DISCORD_SNOWFLAKE.test(guildId) || !DISCORD_SNOWFLAKE.test(gameChannelId)) {
      setupRedirect("error", "Serveur ou salon Discord invalide.");
    }

    const guild = await prisma.guild.findFirst({
      where: { discordId: guildId, isActive: true },
      select: { id: true, discordId: true, name: true }
    });
    if (!guild || !await canUserManageGuild(guild.discordId, actor.discordId)) {
      setupRedirect(
        "error",
        "Accès refusé : tu dois posséder la permission Gérer le serveur sur ce serveur."
      );
    }

    const channels = await fetchGuildGameChannels(guild.discordId);
    const selectedChannel = channels.find((channel) => channel.id === gameChannelId);
    if (!selectedChannel) {
      setupRedirect("error", "Ce salon n’appartient pas à ce serveur ou n’est pas textuel.");
    }
    if (!selectedChannel.botCanPublish) {
      setupRedirect(
        "error",
        `Permissions manquantes pour le bot : ${selectedChannel.missingPermissions.join(", ")}.`
      );
    }

    await configService.configureGuildGameChannel({
      guildId: guild.discordId,
      guildName: guild.name,
      gameChannelId: selectedChannel.id,
      actorId: actor.id,
      source: "WEB_GUILD_SETTINGS"
    });
    revalidatePath("/setup");
    setupRedirect("notice", `Le salon #${selectedChannel.name} est maintenant le salon de jeu.`);
  }

  const guildRows = await prisma.guild.findMany({
    where: { isActive: true },
    select: {
      id: true,
      discordId: true,
      name: true,
      config: { select: { gameChannelId: true } }
    },
    orderBy: { name: "asc" }
  });
  const access = await Promise.all(
    guildRows.map(async (guild) => ({
      guild,
      allowed: await canUserManageGuild(guild.discordId, user.discordId)
    }))
  );
  const manageableGuilds = await Promise.all(
    access
      .filter((entry) => entry.allowed)
      .map(async ({ guild }) => ({
        ...guild,
        channels: await fetchGuildGameChannels(guild.discordId)
      }))
  );

  return (
    <section className="space-y-6">
      <header className="rounded-2xl border border-rta-border bg-rta-surface p-6 shadow-[0_0_28px_rgba(72,28,166,0.2)]">
        <p className="mb-2 text-sm font-bold uppercase tracking-[0.18em] text-rta-cta">
          Configuration limitée au serveur
        </p>
        <h1 className="text-3xl font-black tracking-tight">Configurer le salon de jeu</h1>
        <p className="mt-3 max-w-3xl text-rta-muted">
          Cette page ne donne aucun accès au panel administrateur de Rocket Them All. Elle permet
          uniquement au propriétaire du serveur ou à un membre ayant la permission Discord
          <strong className="text-rta-ink"> Gérer le serveur</strong> de choisir le salon où
          fonctionneront <code>/explore</code> et les rencontres publiques.
        </p>
        <p className="mt-3 text-sm text-rta-muted">
          Tu peux aussi effectuer la même opération directement dans Discord avec
          {" "}<code>/setup salon:#ton-salon</code>.
        </p>
      </header>

      {searchParams.notice && (
        <p className="rounded-xl border border-green-500/50 bg-green-500/10 p-3 text-green-300">
          ✅ {searchParams.notice}
        </p>
      )}
      {searchParams.error && (
        <p className="rounded-xl border border-red-500/50 bg-red-500/10 p-3 text-red-300">
          ❌ {searchParams.error}
        </p>
      )}

      {manageableGuilds.length === 0 ? (
        <article className="rounded-2xl border border-rta-border bg-rta-surface p-6">
          <h2 className="text-xl font-bold">Aucun serveur configurable</h2>
          <p className="mt-2 text-rta-muted">
            Vérifie que Rocket Them All est présent sur ton serveur et que ton compte possède la
            permission <strong>Gérer le serveur</strong>, puis recharge cette page.
          </p>
        </article>
      ) : (
        <div className="grid gap-5 md:grid-cols-2">
          {manageableGuilds.map((guild) => {
            const current = guild.channels.find(
              (channel) => channel.id === guild.config?.gameChannelId
            );
            const availableChannels = guild.channels.filter((channel) => channel.botCanPublish);
            return (
              <article
                key={guild.id}
                className="rounded-2xl border border-rta-border bg-rta-surface p-5"
              >
                <h2 className="text-xl font-black">{guild.name}</h2>
                <p className="mt-1 text-sm text-rta-muted">
                  Salon actuel : {current ? `#${current.name}` : "aucun salon valide"}
                </p>
                {availableChannels.length > 0 ? (
                  <form action={updateGameChannel} className="mt-5 space-y-3">
                    <input type="hidden" name="guildId" value={guild.discordId} />
                    <label
                      htmlFor={`game-channel-${guild.id}`}
                      className="block text-sm font-bold text-rta-ink"
                    >
                      Salon de jeu et d’exploration
                    </label>
                    <select
                      id={`game-channel-${guild.id}`}
                      name="gameChannelId"
                      defaultValue={current?.id ?? ""}
                      required
                      className="w-full rounded-xl border px-3 py-2"
                    >
                      <option value="" disabled>Choisir un salon</option>
                      {availableChannels.map((channel) => (
                        <option key={channel.id} value={channel.id}>#{channel.name}</option>
                      ))}
                    </select>
                    <button
                      type="submit"
                      className="rounded-xl bg-rta-cta px-4 py-2 font-black text-rta-bg transition hover:bg-rta-cta/90"
                    >
                      Enregistrer ce salon
                    </button>
                  </form>
                ) : (
                  <p className="mt-4 rounded-xl border border-amber-500/50 bg-amber-500/10 p-3 text-sm text-amber-200">
                    Aucun salon utilisable. Autorise le bot à voir le salon, envoyer des messages,
                    intégrer des liens et joindre des fichiers.
                  </p>
                )}
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
