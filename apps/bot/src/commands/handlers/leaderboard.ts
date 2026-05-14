import { EmbedBuilder, type ChatInputCommandInteraction } from "discord.js";
import { usersService } from "../service-instances.js";

export async function handleLeaderboard(interaction: ChatInputCommandInteraction, user: any) {
  const users = await usersService.listUsers();
  const top = users
    .sort((a, b) => b.level - a.level || b.xp - a.xp)
    .slice(0, 10);

  const embed = new EmbedBuilder()
    .setColor(0xffd700)
    .setTitle("🏆 Classement");

  if (top.length === 0) {
    embed.setDescription("Aucun joueur");
  } else {
    embed.setDescription(
      top.map((u, i) => `${i + 1}. ${u.username} - Lv.${u.level} (${u.xp} XP)`).join("\n")
    );
  }

  await interaction.editReply({ embeds: [embed] });
}
