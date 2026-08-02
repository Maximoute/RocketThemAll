import { Client, Events, MessageFlags } from "discord.js";
import { AppError, ConfigService } from "@rta/services";
import {
  handleAutocomplete,
  handleCommand,
  handleButton,
  handleSelectMenu
} from "../commands/index.js";
import {
  resumePendingEncounterPublications,
  retireLegacyPublicExplorationHubs
} from "../commands/handlers/explore.js";
import { syncClientGuilds } from "./sync-client-guilds.js";
import {
  registerMonetizationEvents,
  syncDiscordMonetization
} from "../monetization-events.js";
import { registerLevelRoleSynchronization } from "../level-role-sync.js";
import { resolveCommandChannelDecision } from "../commands/channel-policy.js";
import { registerHallOfFameSynchronization } from "../commands/hall-of-fame.js";
import { registerBossAnnouncementSynchronization } from "../boss-announcements.js";

const privateCommands = new Set([
  "explore",
  "collection",
  "profile",
  "quests",
  "achievements",
  "skills",
  "items",
  "boss",
  "shop",
  "recycle",
  "fragment"
]);

export function commandIsPrivate(commandName: string) {
  return privateCommands.has(commandName);
}

export function registerClientEvents(client: Client, configService: ConfigService) {
  client.once(Events.ClientReady, async (readyClient) => {
    console.log(`Logged in as ${readyClient.user.tag}`);
    await syncClientGuilds(readyClient, configService);
    await retireLegacyPublicExplorationHubs(readyClient);
    await resumePendingEncounterPublications(readyClient);
    registerHallOfFameSynchronization(readyClient);
    registerBossAnnouncementSynchronization(readyClient);
    await syncDiscordMonetization(readyClient).catch((error) => {
      console.error("Discord monetization synchronization failed", error);
    });
    registerLevelRoleSynchronization();
  });

  client.on(Events.GuildCreate, async (guild) => {
    await configService.upsertGuildConfig({ guildId: guild.id, guildName: guild.name, isActive: true });
    console.log(`Guild joined: ${guild.name} (${guild.id})`);
  });

  client.on(Events.GuildDelete, async (guild) => {
    await configService.markGuildInactive(guild.id);
    console.log(`Guild removed: ${guild.name} (${guild.id})`);
  });

  client.on(Events.InteractionCreate, async (interaction) => {
    if (interaction.isAutocomplete()) {
      try {
        const channelDecision = await resolveCommandChannelDecision({
          commandName: interaction.commandName,
          channelId: interaction.channelId,
          guildId: interaction.guildId
        });
        if (!channelDecision.allowed) {
          await interaction.respond([]);
          return;
        }
        await handleAutocomplete(interaction);
      } catch (error) {
        console.error("Unable to answer command autocomplete", error);
        if (!interaction.responded) {
          await interaction.respond([]).catch(() => undefined);
        }
      }
      return;
    }

    if (interaction.isChatInputCommand()) {
      try {
        const channelDecision = await resolveCommandChannelDecision({
          commandName: interaction.commandName,
          channelId: interaction.channelId,
          guildId: interaction.guildId
        });
        if (!channelDecision.allowed) {
          await interaction.reply({
            content: channelDecision.message ?? "Cette commande n’est pas autorisée dans ce salon.",
            flags: MessageFlags.Ephemeral
          });
          return;
        }
        await interaction.deferReply(
          commandIsPrivate(interaction.commandName)
            ? { flags: MessageFlags.Ephemeral }
            : {}
        );
        await handleCommand(interaction);
      } catch (error) {
        console.error(error);
        const message = error instanceof AppError ? error.message : "Erreur commande";
        try {
          if (interaction.deferred || interaction.replied) {
            await interaction.editReply(message);
          } else {
            await interaction.reply({ content: message, flags: MessageFlags.Ephemeral });
          }
        } catch (replyError) {
          console.error("Failed to send interaction error reply", replyError);
        }
      }
      return;
    }

    if (interaction.isButton()) {
      try {
        await handleButton(interaction);
      } catch (error) {
        console.error(error);
        const message = error instanceof AppError ? error.message : "Erreur interaction bouton";
        try {
          if (interaction.deferred || interaction.replied) {
            await interaction.editReply({ content: message, embeds: [], components: [] });
          } else {
            await interaction.reply({ content: message, ephemeral: true });
          }
        } catch (replyError) {
          console.error("Failed to send button error reply", replyError);
        }
      }
      return;
    }

    if (interaction.isStringSelectMenu()) {
      try {
        await handleSelectMenu(interaction);
      } catch (error) {
        console.error(error);
        const message = error instanceof AppError ? error.message : "Erreur interaction RTA";
        try {
          if (interaction.deferred || interaction.replied) {
            await interaction.editReply({ content: message, embeds: [], components: [] });
          } else {
            await interaction.reply({ content: message, ephemeral: true });
          }
        } catch (replyError) {
          console.error("Failed to send select menu error reply", replyError);
        }
      }
    }
  });

  client.on(Events.Error, (error) => {
    console.error("Discord client error", error);
  });

  registerMonetizationEvents(client);
}
