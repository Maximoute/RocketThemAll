import { EmbedBuilder, type ChatInputCommandInteraction } from "discord.js";
import { captureService } from "../service-instances.js";
import { findCardByName } from "../helpers.js";

export async function handleCapture(interaction: ChatInputCommandInteraction, user: any) {
  const cardName = interaction.options.getString("nom", true);
  const result = await captureService.capture(user.id, interaction.channelId, cardName);

  const delay = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
  const rarityName: string = (result.card.rarity as any)?.name ?? "";
  const ballEmoji = ["Black Market", "Limited", "Exotic"].includes(rarityName) ? "🖤" :
                    ["Import", "Very Rare"].includes(rarityName) ? "🟣" : "⚪";

  await interaction.editReply({ embeds: [new EmbedBuilder().setColor(0x5865F2).setDescription(`${ballEmoji} **Lancer de Ball sur ${result.card.name}...**`)] });
  await delay(1200);
  await interaction.editReply({ embeds: [new EmbedBuilder().setColor(0x5865F2).setDescription(`${ballEmoji} **3...**`)] });
  await delay(1000);
  await interaction.editReply({ embeds: [new EmbedBuilder().setColor(0x5865F2).setDescription(`${ballEmoji} **2...**`)] });
  await delay(1000);
  await interaction.editReply({ embeds: [new EmbedBuilder().setColor(0x5865F2).setDescription(`${ballEmoji} **1...**`)] });
  await delay(1000);

  if (result.caught) {
    let msg = `✅ **${result.card.name}** [${result.card.variant ?? "normal"}] a été capturée ! 🎉\n+${result.gainedXp} XP · Niveau ${result.level}`;
    if (result.boostersGained > 0) msg += `\n🎁 +${result.boostersGained} booster(s) !`;
    const embed = new EmbedBuilder().setColor(0x4caf50).setDescription(msg);
    await interaction.editReply({ embeds: [embed] });
  } else {
    const embed = new EmbedBuilder().setColor(0xf44336).setDescription(`💨 Oh non... **${result.card.name}** s'est échappée ! La petite crapule...`);
    await interaction.editReply({ embeds: [embed] });
  }
}
