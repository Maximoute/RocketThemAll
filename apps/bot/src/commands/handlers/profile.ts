import { EmbedBuilder, type ChatInputCommandInteraction } from "discord.js";
import {
  spawnEnergyService,
  boosterService,
  economyService
} from "../service-instances.js";
import { formatDuration } from "../helpers.js";

export async function handleProfile(interaction: ChatInputCommandInteraction, user: any) {
  const energy = await spawnEnergyService.getUserSpawnCharges(user.id);
  const nextRecharge = energy.nextChargeInMs === null ? "Aucune (charges pleines)" : formatDuration(energy.nextChargeInMs);
  const boosters = await boosterService.getUserBoosters(user.id);
  const inventoryValue = await economyService.getInventoryEstimatedValue(user.id);

  const embed = new EmbedBuilder()
    .setColor(0x5865F2)
    .setTitle(`Profil de ${interaction.user.username}`)
    .setThumbnail(interaction.user.displayAvatarURL())
    .addFields(
      { name: "Niveau", value: `${user.level}`, inline: true },
      { name: "XP", value: `${user.xp}`, inline: true },
      { name: "Crédits", value: `${user.credits}`, inline: true },
      { name: "Fragments", value: `${user.fragments}`, inline: true },
      { name: "Valeur inventaire", value: `${inventoryValue} crédits`, inline: true },
      { name: "Boosters", value: `basic ${boosters.basic}, rare ${boosters.rare}, epic ${boosters.epic}, legendary ${boosters.legendary}`, inline: false },
      { name: "Spawn disponibles", value: `${energy.charges}/${energy.maxCharges}`, inline: true },
      { name: "Prochaine recharge", value: `${nextRecharge}`, inline: true }
    );

  await interaction.editReply({ embeds: [embed] });
}
