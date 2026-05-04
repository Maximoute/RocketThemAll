import { Client, GatewayIntentBits, Events } from "discord.js";
import { AppError, ConfigService } from "@rta/services";
import { handleCommand, registerCommands, registerGuildCommands, handleButtonInteraction } from "./commands/register.js";
import { startSpawnLoop } from "./jobs/spawn-loop.js";

const configService = new ConfigService();

async function syncClientGuilds(client: Client) {
  const guilds = await client.guilds.fetch();
  const rows = guilds.map((guild) => ({ guildId: guild.id, guildName: guild.name ?? guild.id }));
  await configService.syncGuilds(
    rows
  );
  await registerGuildCommands(rows.map((guild) => guild.guildId));
  console.log(`Synced ${rows.length} guild(s)`);
}

async function main() {
  const token = process.env.DISCORD_TOKEN;
  if (!token) {
    throw new Error("DISCORD_TOKEN missing");
  }

  await registerCommands();

  const client = new Client({
    intents: [GatewayIntentBits.Guilds]
  });

  client.once(Events.ClientReady, async () => {
    console.log(`Logged in as ${client.user?.tag}`);
    await syncClientGuilds(client);
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
    } else if (interaction.isButton()) {
      try {
        await handleButtonInteraction(interaction);
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

  await client.login(token);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
