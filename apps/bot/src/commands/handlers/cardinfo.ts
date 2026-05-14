import { EmbedBuilder, type ChatInputCommandInteraction } from "discord.js";
import { inventoryService, economyService } from "../service-instances.js";

export async function handleCardinfo(interaction: ChatInputCommandInteraction, user: any) {
  const name = interaction.options.getString("nom", true).toLowerCase();

  const inventory = await inventoryService.getInventory(user.id);
  const item = inventory.find((i) => i.card.name.toLowerCase() === name);
  if (!item) {
    const embed = new EmbedBuilder()
      .setColor(0xf44336)
      .setDescription("Tu ne possèdes pas cette carte (ou elle n'existe pas).");
    await interaction.editReply({ embeds: [embed] });
    return;
  }

  const card = item.card as any;
  const rarityName: string = card.rarity?.name ?? "?";
  const rarityColor: Record<string, number> = {
    Common: 0x9e9e9e,
    Uncommon: 0x4caf50,
    Rare: 0x2196f3,
    "Very Rare": 0x9c27b0,
    Import: 0xff9800,
    Exotic: 0xf44336,
    "Black Market": 0x000000,
    Limited: 0xffd700
  };
  const color = rarityColor[rarityName] ?? 0x5865f2;

  const embed = new EmbedBuilder()
    .setTitle(card.name)
    .setDescription(`**Rareté :** ${rarityName}\n**Deck :** ${card.deck?.name ?? "?"}\n**Quantité possédée :** ${item.quantity}`)
    .setColor(color);

  const dynamic = await economyService.getDynamicSellPrice(card.id, "normal");
  embed.addFields({ name: "Valeur dynamique (normal)", value: `${dynamic.unitPrice} crédits` });

  if (card.description) embed.addFields({ name: "Description", value: card.description });
  if (card.imageUrl) embed.setImage(card.imageUrl);

  await interaction.editReply({ embeds: [embed] });
}
