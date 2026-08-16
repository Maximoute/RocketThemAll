import { prisma } from "./service-instances.js";

export type CommandChannelPolicy = {
  gameChannelId: string | null;
  hallOfFameChannelId: string | null;
  hallOfFameEnabled: boolean;
};

export type CommandChannelDecision = {
  allowed: boolean;
  message?: string;
};

export function missingGameChannelMessage() {
  const publicBaseUrl = process.env.PUBLIC_BASE_URL?.replace(/\/+$/, "");
  return (
    "Aucun salon de jeu n’est configuré. Un propriétaire ou membre avec la permission " +
    "**Gérer le serveur** peut lancer `/setup salon:#votre-salon`" +
    (publicBaseUrl ? ` ou ouvrir <${publicBaseUrl}/setup>` : "") +
    "."
  );
}

export function decideCommandChannel(input: {
  commandName: string;
  channelId: string;
  guildId: string | null;
  config: CommandChannelPolicy | null;
}): CommandChannelDecision {
  if (!input.guildId) {
    if (["explore", "setup", "showcard"].includes(input.commandName)) {
      return {
        allowed: false,
        message: `La commande \`/${input.commandName}\` doit être utilisée dans un serveur Discord.`
      };
    }
    return { allowed: true };
  }

  // Setup must remain reachable before a game channel exists and must not be
  // constrained by the channel it is responsible for configuring.
  if (input.commandName === "setup") {
    return { allowed: true };
  }

  const gameChannelId = input.config?.gameChannelId ?? null;
  const hallOfFameChannelId = input.config?.hallOfFameChannelId ?? null;
  const hallOfFameConfigured = Boolean(
    input.config?.hallOfFameEnabled && hallOfFameChannelId
  );
  const insideHallOfFame = Boolean(
    hallOfFameConfigured && input.channelId === hallOfFameChannelId
  );

  if (insideHallOfFame && input.commandName !== "showcard") {
    return {
      allowed: false,
      message:
        "🏆 Ce salon est réservé au **Hall of Fame**. La seule commande RTA autorisée ici est " +
        "`/showcard`."
    };
  }

  if (input.commandName === "showcard") {
    if (!hallOfFameConfigured) {
      return {
        allowed: false,
        message:
          "Le Hall of Fame du serveur principal n’est pas encore configuré dans le panel admin."
      };
    }
    if (input.channelId !== hallOfFameChannelId) {
      return {
        allowed: false,
        message: `Utilise \`/showcard\` uniquement dans le Hall of Fame <#${hallOfFameChannelId}>.`
      };
    }
    return { allowed: true };
  }

  if (input.commandName === "explore") {
    if (!gameChannelId) {
      return {
        allowed: false,
        message: missingGameChannelMessage()
      };
    }
    if (input.channelId !== gameChannelId) {
      return {
        allowed: false,
        message: `Utilise \`/explore\` uniquement dans le salon de jeu <#${gameChannelId}>.`
      };
    }
  }

  return { allowed: true };
}

export async function resolveCommandChannelDecision(input: {
  commandName: string;
  channelId: string;
  guildId: string | null;
}) {
  const guild = input.guildId
    ? await prisma.guild.findUnique({
        where: { discordId: input.guildId },
        select: {
          isPrimary: true,
          config: {
            select: {
              gameChannelId: true,
              hallOfFameChannelId: true,
              hallOfFameEnabled: true
            }
          }
        }
      })
    : null;

  return decideCommandChannel({
    ...input,
    config: guild?.isPrimary
      ? guild.config ?? null
      : guild?.config
        ? { ...guild.config, hallOfFameChannelId: null, hallOfFameEnabled: false }
        : null
  });
}
