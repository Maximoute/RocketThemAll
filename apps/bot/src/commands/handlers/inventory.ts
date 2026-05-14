import {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  type ChatInputCommandInteraction,
  type ButtonInteraction
} from "discord.js";
import { inventoryService, inventoryCache } from "../service-instances.js";

const rarityEmojiMap: Record<string, string> = {
  Common: "⚪",
  Uncommon: "💚",
  Rare: "💙",
  "Very Rare": "💜",
  Import: "🧡",
  Exotic: "❤️",
  "Black Market": "⬛",
  Limited: "💛"
};

const rarityColorMap: Record<string, number> = {
  Common: 0x9e9e9e,
  Uncommon: 0x4caf50,
  Rare: 0x2196f3,
  "Very Rare": 0x9c27b0,
  Import: 0xff9800,
  Exotic: 0xf44336,
  "Black Market": 0x000000,
  Limited: 0xffd700
};

export async function handleInventory(interaction: ChatInputCommandInteraction, user: any) {
  const inventory = await inventoryService.getInventory(user.id);
  const discordUserId = interaction.user.id;

  const sorted = inventory.sort((a, b) => a.card.name.localeCompare(b.card.name));

  inventoryCache.set(discordUserId, sorted);

  const pageSize = 10;
  const page = 0;
  const start = page * pageSize;
  const end = start + pageSize;
  const pageItems = sorted.slice(start, end);
  const totalPages = Math.ceil(sorted.length / pageSize);

  const embed = new EmbedBuilder()
    .setTitle("📦 Inventaire")
    .setColor(0x5865f2)
    .setFooter({ text: `Page ${page + 1}/${totalPages} (${sorted.length} cartes total)` });

  if (pageItems.length === 0) {
    embed.setDescription("Inventaire vide");
  } else {
    const description = pageItems
      .map((i) => {
        const rarityName = (i.card as any).rarity?.name ?? "?";
        const emoji = rarityEmojiMap[rarityName] ?? "❓";
        return `${emoji} **${i.card.name}** x${i.quantity}`;
      })
      .join("\n");
    embed.setDescription(description);

    const firstRarityName = (pageItems[0].card as any).rarity?.name ?? "?";
    const embedColor = rarityColorMap[firstRarityName] ?? 0x5865f2;
    embed.setColor(embedColor);
  }

  const buttons = new ActionRowBuilder<ButtonBuilder>();
  if (totalPages > 1) {
    buttons.addComponents(
      new ButtonBuilder()
        .setCustomId(`inv_prev_${discordUserId}_${page}`)
        .setLabel("◀ Précédent")
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(page === 0),
      new ButtonBuilder()
        .setCustomId(`inv_next_${discordUserId}_${page}`)
        .setLabel("Suivant ▶")
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(page >= totalPages - 1)
    );
  }

  if (buttons.components.length > 0) {
    await interaction.editReply({ embeds: [embed], components: [buttons] });
  } else {
    await interaction.editReply({ embeds: [embed] });
  }
}

export async function handleInventoryButton(interaction: ButtonInteraction) {
  const customId = interaction.customId;

  if (customId.startsWith("inv_")) {
    try {
      const parts = customId.split("_");
      console.log(`[Button] Custom ID: ${customId}, Parts: ${JSON.stringify(parts)}`);

      if (parts.length < 4) {
        console.error(`[Button] Invalid parts length: ${parts.length}`);
        await interaction.reply({ content: "Erreur: bouton invalide", ephemeral: true });
        return;
      }

      const direction = parts[1];
      const userId = parts[2];
      const currentPage = parseInt(parts[3], 10);

      console.log(`[Button] Direction: ${direction}, UserId: ${userId}, CurrentPage: ${currentPage}`);

      if (interaction.user.id !== userId) {
        await interaction.reply({ content: "Tu ne peux pas utiliser ce bouton", ephemeral: true });
        return;
      }

      const cached = inventoryCache.get(userId);
      if (!cached || cached.length === 0) {
        console.error(`[Button] Cache miss or empty for user ${userId}`);
        await interaction.reply({ content: "Cache expiré, refais /inventory", ephemeral: true });
        return;
      }

      const pageSize = 10;
      const totalPages = Math.ceil(cached.length / pageSize);
      let nextPage = currentPage;

      if (direction === "next" && currentPage < totalPages - 1) {
        nextPage = currentPage + 1;
      } else if (direction === "prev" && currentPage > 0) {
        nextPage = currentPage - 1;
      } else {
        console.log(`[Button] Already at page or invalid direction`);
        await interaction.reply({ content: "Vous êtes déjà à cette page", ephemeral: true });
        return;
      }

      const start = nextPage * pageSize;
      const end = start + pageSize;
      const pageItems = cached.slice(start, end);

      const embed = new EmbedBuilder()
        .setTitle("📦 Inventaire")
        .setColor(0x5865f2)
        .setFooter({ text: `Page ${nextPage + 1}/${totalPages} (${cached.length} cartes total)` });

      const description = pageItems
        .map((i) => {
          const rarityName = (i.card as any).rarity?.name ?? "?";
          const emoji = rarityEmojiMap[rarityName] ?? "❓";
          return `${emoji} **${i.card.name}** x${i.quantity}`;
        })
        .join("\n");
      embed.setDescription(description);

      const firstRarityName = (pageItems[0].card as any).rarity?.name ?? "?";
      const embedColor = rarityColorMap[firstRarityName] ?? 0x5865f2;
      embed.setColor(embedColor);

      const buttons = new ActionRowBuilder<ButtonBuilder>();
      buttons.addComponents(
        new ButtonBuilder()
          .setCustomId(`inv_prev_${userId}_${nextPage}`)
          .setLabel("◀ Précédent")
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(nextPage === 0),
        new ButtonBuilder()
          .setCustomId(`inv_next_${userId}_${nextPage}`)
          .setLabel("Suivant ▶")
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(nextPage >= totalPages - 1)
      );

      console.log(`[Button] Updating to page ${nextPage + 1}`);
      await interaction.update({ embeds: [embed], components: [buttons] });
    } catch (error) {
      console.error("[Button] Error:", error);
      await interaction.reply({ content: "Erreur lors du changement de page", ephemeral: true });
    }
  }
}
