import { EmbedBuilder, type ChatInputCommandInteraction } from "discord.js";
import {
  sellService,
  recycleService,
  fusionService,
  economyService,
  dailyService
} from "../service-instances.js";
import { findCardByName } from "../helpers.js";

export async function handleSell(interaction: ChatInputCommandInteraction, user: any) {
  const cardName = interaction.options.getString("nom", true);
  const quantity = interaction.options.getInteger("quantite", true);
  const variant = (interaction.options.getString("variant") ?? "normal") as "normal" | "shiny" | "holo";
  const card = await findCardByName(cardName);
  if (!card) {
    const embed = new EmbedBuilder().setColor(0xf44336).setDescription("Carte introuvable");
    await interaction.editReply({ embeds: [embed] });
    return;
  }
  const result = await sellService.sellCard(user.id, card.id, quantity, variant);
  const embed = new EmbedBuilder()
    .setColor(0x4caf50)
    .setTitle("💰 Vente effectuée")
    .setDescription(`${result.quantity}x ${result.card.name} [${result.variant}] à ${result.unitPrice}/u pour ${result.credits} crédits.`);
  await interaction.editReply({ embeds: [embed] });
}

export async function handleRecycle(interaction: ChatInputCommandInteraction, user: any) {
  const cardName = interaction.options.getString("nom", true);
  const quantity = interaction.options.getInteger("quantite", true);
  const card = await findCardByName(cardName);
  if (!card) {
    const embed = new EmbedBuilder().setColor(0xf44336).setDescription("Carte introuvable");
    await interaction.editReply({ embeds: [embed] });
    return;
  }
  const result = await recycleService.recycleCard(user.id, card.id, quantity);
  const embed = new EmbedBuilder()
    .setColor(0x9c27b0)
    .setTitle("♻️ Fragmentation effectuée")
    .setDescription(`${result.quantity}x ${result.card.name} → ${result.credits} crédits et ${result.fragments} fragments.`);
  await interaction.editReply({ embeds: [embed] });
}

export async function handleFusion(interaction: ChatInputCommandInteraction, user: any) {
  const rarityName = interaction.options.getString("rarity", true);
  const reward = await fusionService.fuse(user.id, rarityName);
  const embed = new EmbedBuilder()
    .setColor(0xffd700)
    .setTitle("✨ Fusion réussie")
    .setDescription(`5 cartes ${rarityName} détruites, tu obtiens ${reward.name} (${reward.rarity.name}).`);
  await interaction.editReply({ embeds: [embed] });
}

export async function handleValue(interaction: ChatInputCommandInteraction, user: any) {
  const cardName = interaction.options.getString("nom", true);
  const variant = (interaction.options.getString("variant") ?? "normal") as "normal" | "shiny" | "holo";
  const card = await findCardByName(cardName);
  if (!card) {
    const embed = new EmbedBuilder().setColor(0xf44336).setDescription("Carte introuvable");
    await interaction.editReply({ embeds: [embed] });
    return;
  }
  const value = await economyService.getDynamicSellPrice(card.id, variant);
  const embed = new EmbedBuilder()
    .setColor(0x2196f3)
    .setTitle(`📈 Valeur de ${card.name} [${variant}]`)
    .addFields(
      { name: "Rareté", value: value.rarityName, inline: true },
      { name: "Deck", value: value.deckName, inline: true },
      { name: "Circulation", value: `${value.circulationCount}`, inline: true },
      { name: "Multiplicateur", value: `x${value.scarcityMultiplier.toFixed(2)}`, inline: true },
      { name: "Prix actuel", value: `${value.unitPrice} crédits`, inline: true }
    );
  await interaction.editReply({ embeds: [embed] });
}

export async function handleDaily(interaction: ChatInputCommandInteraction, user: any) {
  const result = await dailyService.claimDaily(user.id);
  const embed = new EmbedBuilder()
    .setColor(0xff9800)
    .setTitle("🎁 Daily claimée")
    .setDescription(`${result.credits} crédits${result.grantedBooster ? " et 1 basic booster" : ""}.`);
  await interaction.editReply({ embeds: [embed] });
}
