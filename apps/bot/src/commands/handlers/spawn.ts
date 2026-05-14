import { EmbedBuilder, type ChatInputCommandInteraction } from "discord.js";
import {
  spawnService,
  spawnEnergyService,
  AppError
} from "../service-instances.js";
import {
  resolveGuildSpawnChannelId,
  sendSpawnCards,
  scheduleManualSpawnPublicNotice,
  formatDuration
} from "../helpers.js";

export async function handleSpawn(interaction: ChatInputCommandInteraction, user: any) {
  try {
    const spawnChannelId = await resolveGuildSpawnChannelId(interaction.guildId);
    const result = await spawnService.createManualSpawn(user.id, spawnChannelId, {
      spawnType: "manual"
    });

    await sendSpawnCards(
      interaction,
      spawnChannelId,
      result.cards,
      `Spawn manuel lance par <@${interaction.user.id}>.\n🔒 Privé 2 minutes pour le lanceur, puis 🌍 public 3 minutes pour tout le monde (durée totale: 5 minutes).`
    );

    scheduleManualSpawnPublicNotice({
      interaction,
      channelId: spawnChannelId,
      launcherUserId: user.id,
      launcherDiscordId: interaction.user.id,
      spawnCreatedAt: result.spawnCreatedAt
    });

    const remainingText = `Tu as utilisé 1 charge de spawn. Charges restantes : ${result.energy.charges}/${result.energy.maxCharges}.`;
    const embed = new EmbedBuilder()
      .setColor(0x5865F2)
      .setDescription(
        interaction.channelId === spawnChannelId
          ? `${remainingText}\n3 cartes se sont ajoutées au spawn actif.`
          : `${remainingText}\nSpawn manuel effectue dans <#${spawnChannelId}>: 3 cartes se sont ajoutées au spawn actif.`
      );

    await interaction.editReply({ embeds: [embed] });
  } catch (error) {
    if (error instanceof AppError) {
      if (error.message === "NO_SPAWN_CHARGES") {
        const nextChargeInMs = await spawnEnergyService.getTimeUntilNextCharge(user.id);
        const embed = new EmbedBuilder()
          .setColor(0xf44336)
          .setDescription(`Tu n'as plus de /spawn disponible. Prochaine charge dans ${formatDuration(nextChargeInMs)}.`);
        await interaction.editReply({ embeds: [embed] });
        return;
      }
      const embed = new EmbedBuilder()
        .setColor(0xf44336)
        .setDescription(error.message);
      await interaction.editReply({ embeds: [embed] });
      return;
    }
    throw error;
  }
}
