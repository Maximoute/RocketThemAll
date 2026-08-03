import {
  ActionRowBuilder,
  EmbedBuilder,
  StringSelectMenuBuilder,
  type AutocompleteInteraction,
  type ChatInputCommandInteraction
} from "discord.js";
import {
  sellService,
  recycleService,
  fusionService,
  economyService,
  dailyService,
  usersService
} from "../service-instances.js";
import { findCardByName } from "../helpers.js";
import { createInteractionToken } from "../interaction-token.js";

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
  const result = await sellService.sellCard(user.id, card.id, quantity, interaction.id, variant);
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
  const result = await recycleService.recycleCard(user.id, card.id, quantity, interaction.id);
  const embed = new EmbedBuilder()
    .setColor(0x9c27b0)
    .setTitle("♻️ Fragmentation effectuée")
    .setDescription(`${result.quantity}x ${result.card.name} → ${result.credits} crédits et ${result.fragments} fragments.`);
  await interaction.editReply({ embeds: [embed] });
}

export function fusionReceipt(
  reward: Awaited<ReturnType<typeof fusionService.fuse>>
) {
  const destroyed = reward.consumedCards
    .map((card) => `• ${card.quantity}× **${card.name}** [${card.variant}] · ${card.deckName}`)
    .join("\n");
  return (
    `Tu obtiens **${reward.name}** (${reward.rarity.name}).\n\n` +
    `**Cartes détruites (${reward.fusionCost})**\n${destroyed || "Détail indisponible."}`
  );
}

export async function handleFusionAutocomplete(interaction: AutocompleteInteraction) {
  const rarity = interaction.options.getString("rarity");
  const focused = interaction.options.getFocused(true);
  if (!rarity || !focused.name.startsWith("carte_")) {
    await interaction.respond([]);
    return;
  }
  const user = await usersService.getOrCreateDiscordUser(
    interaction.user.id,
    interaction.user.username,
    interaction.user.displayAvatarURL()
  );
  const options = await fusionService.getSacrificeOptions(
    user.id,
    rarity,
    String(focused.value)
  );
  await interaction.respond(options.map((option) => ({
    name: `${option.name} [${option.variant}] · x${option.removableQuantity} dispo · ${option.deckName}`
      .slice(0, 100),
    value: option.inventoryItemId
  })));
}

export async function handleFusion(interaction: ChatInputCommandInteraction, user: any) {
  const rarityName = interaction.options.getString("rarity");
  if (!rarityName) {
    const history = await fusionService.getFusionHistory(user.id, 5);
    const description = history.length > 0
      ? history.map((entry) => {
          const destroyed = entry.consumedCards
            .map((card) => `${card.quantity}× ${card.name} [${card.variant}]`)
            .join(", ");
          return `<t:${Math.floor(entry.createdAt.getTime() / 1_000)}:R> · ` +
            `**${entry.rewardName}** (${entry.rewardRarity})\n` +
            `Détruites : ${destroyed || "détail historique indisponible"}`;
        }).join("\n\n")
      : "Aucune fusion enregistrée. Choisis d'abord une rareté puis les cartes à détruire.";
    await interaction.editReply({
      embeds: [
        new EmbedBuilder()
          .setColor(0x8e44ad)
          .setTitle("📜 Historique des fusions")
          .setDescription(description)
      ]
    });
    return;
  }
  const preview = await fusionService.getFusionChoices(user.id, rarityName);
  if ("locked" in preview && preview.locked) {
    await interaction.editReply(
      "Débloque la spécialisation **Artisan** et son **Creuset** avant de fusionner."
    );
    return;
  }
  const selectedInventoryItemIds = Array.from({ length: 6 }, (_, index) =>
    interaction.options.getString(`carte_${index + 1}`)
  ).filter((value): value is string => Boolean(value));
  if (selectedInventoryItemIds.length !== preview.cost) {
    await interaction.editReply({
      embeds: [
        new EmbedBuilder()
          .setColor(0xe67e22)
          .setTitle("🧪 Prépare ta fusion")
          .setDescription(
            `Cette fusion coûte **${preview.cost} cartes ${rarityName}**. ` +
            (preview.cost === 5
              ? "Ta compétence **Recette économe** réduit le coût normal de 6 à 5 cartes. "
              : "Le coût normal est de 6 cartes ; **Recette économe** le réduit à 5 sur les tiers compatibles. ") +
            `Relance \`/fusion\` et remplis exactement les champs **carte_1** à ` +
            `**carte_${preview.cost}**. Rien n'a été détruit.`
          )
      ]
    });
    return;
  }
  if (preview.choices.length > 1) {
    const draftKey = await fusionService.prepareFusionDraft({
      userId: user.id,
      rarity: rarityName,
      inventoryItemIds: selectedInventoryItemIds,
      draftKey: interaction.id
    });
    await interaction.editReply({
      embeds: [
        new EmbedBuilder()
          .setColor(0xffd700)
          .setTitle("✨ Transmutation maîtrisée")
          .setDescription(
            `Ta compétence propose **${preview.choices.length} résultats** de même tier. ` +
            `Choisis la carte créée ; tes ${preview.cost} cartes sélectionnées ne seront détruites qu'après ce choix.`
          )
      ],
      components: [
        new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
          new StringSelectMenuBuilder()
            .setCustomId(createInteractionToken("Z", interaction.user.id, draftKey))
            .setPlaceholder("Choisir le résultat de fusion")
            .addOptions(preview.choices.map((card) => ({
              label: card.name.slice(0, 100),
              value: card.id,
              description: `${card.rarity.name} · ${card.deck.name}`.slice(0, 100)
            })))
        )
      ]
    });
    return;
  }
  const reward = await fusionService.fuse(
    user.id,
    rarityName,
    interaction.id,
    undefined,
    selectedInventoryItemIds
  );
  const embed = new EmbedBuilder()
    .setColor(0xffd700)
    .setTitle("✨ Fusion réussie")
    .setDescription(fusionReceipt(reward));
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
