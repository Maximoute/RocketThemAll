import { Client, Events } from "discord.js";
import { AppError, ConfigService } from "@rta/services";
import { handleCommand, handleButton } from "../commands/index.js";
import { startSpawnLoop } from "../jobs/spawn-loop.js";
import { syncClientGuilds } from "./sync-client-guilds.js";

export function registerClientEvents(client: Client, configService: ConfigService) {
  client.once(Events.ClientReady, async () => {
    console.log(`Logged in as ${client.user?.tag}`);
    await syncClientGuilds(client, configService);
    await startSpawnLoop(client);
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
    if (interaction.isChatInputCommand()) {
      try {
        await interaction.deferReply();
        await handleCommand(interaction);
      } catch (error) {
        console.error(error);
        const message = error instanceof AppError ? error.message : "Erreur commande";
        try {
          if (interaction.deferred || interaction.replied) {
            await interaction.editReply(message);
          } else {
            await interaction.reply(message);
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
        try {
          if (interaction.deferred || interaction.replied) {
            await interaction.editReply("Erreur interaction bouton");
          } else {
            await interaction.reply("Erreur interaction bouton");
          }
        } catch (replyError) {
          console.error("Failed to send button error reply", replyError);
        }
      }
    }
  });

  client.on(Events.Error, (error) => {
    console.error("Discord client error", error);
  });
}