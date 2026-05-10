import { Client } from "discord.js";
import { ConfigService } from "@rta/services";
import { registerGuildCommands } from "../commands/register.js";

export async function syncClientGuilds(client: Client, configService: ConfigService) {
  const guilds = await client.guilds.fetch();
  const rows = guilds.map((guild) => ({ guildId: guild.id, guildName: guild.name ?? guild.id }));

  await configService.syncGuilds(rows);
  await registerGuildCommands(rows.map((guild) => guild.guildId));

  console.log(`Synced ${rows.length} guild(s)`);
}