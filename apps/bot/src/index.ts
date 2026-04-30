import { Client, GatewayIntentBits, Events } from "discord.js";
import { AppError } from "@rta/services";
import { handleCommand, registerCommands } from "./commands/register.js";
import { startSpawnLoop } from "./jobs/spawn-loop.js";

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
    await startSpawnLoop(client);
  });

  client.on(Events.InteractionCreate, async (interaction) => {
    if (!interaction.isChatInputCommand()) {
      return;
    }

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
