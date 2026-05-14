import { EmbedBuilder, type ChatInputCommandInteraction } from "discord.js";
import {
  configService,
  boosterService
} from "../service-instances.js";

export async function handleShop(interaction: ChatInputCommandInteraction, user: any) {
  const cfg = await configService.getConfig();
  const embed = new EmbedBuilder()
    .setColor(0xff9800)
    .setTitle("🛒 Boutique boosters")
    .addFields(
      { name: "Basic Booster", value: `${cfg.basicBoosterPrice} crédits`, inline: true },
      { name: "Rare Booster", value: `${cfg.rareBoosterPrice} crédits`, inline: true },
      { name: "Epic Booster", value: `${cfg.epicBoosterPrice} crédits`, inline: true },
      { name: "Legendary Booster", value: `${cfg.legendaryBoosterPrice} crédits`, inline: true },
      { name: "Craft booster", value: `${cfg.craftBoosterFragmentCost} fragments`, inline: false }
    );
  await interaction.editReply({ embeds: [embed] });
}

export async function handleBoosters(interaction: ChatInputCommandInteraction, user: any) {
  const boosters = await boosterService.getUserBoosters(user.id);
  const embed = new EmbedBuilder()
    .setColor(0x9c27b0)
    .setTitle("🎁 Boosters possédés")
    .setDescription(`basic ${boosters.basic}, rare ${boosters.rare}, epic ${boosters.epic}, legendary ${boosters.legendary}`);
  await interaction.editReply({ embeds: [embed] });
}

export async function handleCraft(interaction: ChatInputCommandInteraction, user: any) {
  const result = await boosterService.craftBooster(user.id);
  const embed = new EmbedBuilder()
    .setColor(0x4caf50)
    .setTitle("🧪 Craft réussi")
    .setDescription(`${result.cost} fragments → 1 ${result.boosterType} booster.`);
  await interaction.editReply({ embeds: [embed] });
}

export async function handleBoosterBuy(interaction: ChatInputCommandInteraction, user: any) {
  const type = interaction.options.getString("type", true) as "basic" | "rare" | "epic" | "legendary";
  const result = await boosterService.buyBooster(user.id, type);
  const embed = new EmbedBuilder()
    .setColor(0x4caf50)
    .setTitle("🛍️ Achat réussi")
    .setDescription(`${type} booster acheté pour ${result.price} crédits.`);
  await interaction.editReply({ embeds: [embed] });
}

export async function handleBoosterOpen(interaction: ChatInputCommandInteraction, user: any) {
  const type = interaction.options.getString("type", true) as "basic" | "rare" | "epic" | "legendary";
  const guildId = interaction.guildId ?? undefined;
  const opened = await boosterService.openBooster(user.id, type, guildId);
  const cards = opened.cards;

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

  const jackpotLine = opened.upgradedType !== type
    ? `\n🔥 JACKPOT ! Ton ${type} booster s'est transformé en ${opened.upgradedType} booster !`
    : "";
  await interaction.editReply({ embeds: [new EmbedBuilder().setColor(0xffd700).setDescription(`🎁 ${opened.upgradedType} booster ouvert ! **${cards.length} cartes** obtenues :${jackpotLine}`)] });

  for (let i = 0; i < cards.length; i++) {
    const row = cards[i];
    const card = row.card;
    const rarity = (card as any).rarity;
    const rarityName: string = rarity?.name ?? "?";
    const color = rarityColor[rarityName] ?? 0x5865f2;

    const embed = new EmbedBuilder()
      .setTitle(card.name)
      .setDescription(`**Rareté :** ${rarityName}\n**Variante :** ${row.variant}`)
      .setColor(color);

    if (card.description) embed.addFields({ name: "Description", value: card.description });
    if (card.imageUrl) embed.setImage(card.imageUrl);

    await interaction.followUp({ embeds: [embed] });
  }
}
