import { Client, GatewayIntentBits } from "discord.js";
import { ConfigService } from "@rta/services";
import { registerCommands } from "./commands/register.js";
import { registerClientEvents } from "./core/register-client-events.js";

const configService = new ConfigService();

async function main() {
  const token = process.env.DISCORD_TOKEN;
  if (!token) {
    throw new Error("DISCORD_TOKEN missing");
  }

  await registerCommands();

  const client = new Client({
    intents: [GatewayIntentBits.Guilds]
  });
  registerClientEvents(client, configService);

  await client.login(token);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
