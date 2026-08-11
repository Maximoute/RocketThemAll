import {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  type ChatInputCommandInteraction,
  type ButtonInteraction,
  type StringSelectMenuInteraction
} from "discord.js";
import {
  inventoryService,
  inventoryCache,
  economyService,
  prisma,
  recycleService
} from "../service-instances.js";
import { createInteractionToken } from "../interaction-token.js";

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

type CollectionEntry = (typeof inventoryCache) extends Map<string, Array<infer Entry>>
  ? Entry
  : never;

const recyclableRarities = new Set([
  "Common",
  "Uncommon",
  "Rare",
  "Very Rare",
  "Import",
  "Exotic",
  "Black Market"
]);

function recycleMenu(
  discordUserId: string,
  pageItems: CollectionEntry[]
) {
  const recyclable = pageItems.filter((entry) =>
    recyclableRarities.has(entry.card.rarity?.name ?? "")
  );
  if (recyclable.length === 0) return null;
  return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(createInteractionToken("d", discordUserId))
      .setPlaceholder("Recycler une carte de cette page")
      .addOptions(recyclable.map((entry) => {
        const rarityName = entry.card.rarity?.name ?? "?";
        return {
          label: entry.card.name.slice(0, 100),
          value: entry.id,
          description:
            `${entry.variant} · ${rarityName} · ${entry.quantity} possédée(s)`.slice(0, 100)
        };
      }))
  );
}

export async function handleInventory(
  interaction:
    | ChatInputCommandInteraction
    | ButtonInteraction
    | StringSelectMenuInteraction,
  user: any,
  notice?: string
) {
  const inventory = await inventoryService.getInventory(user.id);
  const discordUserId = interaction.user.id;

  const sorted = inventory.sort((a, b) => a.card.name.localeCompare(b.card.name));

  inventoryCache.set(discordUserId, sorted);

  const pageSize = 10;
  const page = 0;
  const start = page * pageSize;
  const end = start + pageSize;
  const pageItems = sorted.slice(start, end);
  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const estimateSkill = await prisma.userSkill.findFirst({
    where: {
      userId: user.id,
      rank: { gt: 0 },
      skill: { effectKey: "COL_CROSS_VALUE_ESTIMATE", status: "PUBLISHED" }
    },
    select: { id: true }
  });
  const estimates = new Map<string, {
    unitPrice: number;
    circulationCount: number;
    wishlistInterest: number;
  }>();
  if (estimateSkill) {
    await Promise.all(pageItems.map(async (entry) => {
      const [value, wishlistInterest] = await Promise.all([
        economyService.getDynamicSellPrice(
          entry.cardId,
          supportedVariant(entry.variant)
        ),
        prisma.userGameplayState.count({
          where: { wishlistDeckId: entry.card.deckId }
        })
      ]);
      estimates.set(entry.id, {
        unitPrice: value.unitPrice,
        circulationCount: value.circulationCount,
        wishlistInterest
      });
    }));
  }

  const embed = new EmbedBuilder()
    .setTitle("🗃️ Collection")
    .setColor(0x5865f2)
    .setFooter({ text: `Page ${page + 1}/${totalPages} (${sorted.length} cartes total)` });

  if (pageItems.length === 0) {
    embed.setDescription(
      `${notice ? `${notice}\n\n` : ""}Ta collection est vide.`
    );
  } else {
    const description = pageItems
      .map((i) => {
        const rarityName = (i.card as any).rarity?.name ?? "?";
        const emoji = rarityEmojiMap[rarityName] ?? "❓";
        const estimate = estimates.get(i.id);
        return `${emoji} **${i.card.name}** [${i.variant}] x${i.quantity}` +
          (estimate
            ? ` · ≈${estimate.unitPrice} cr · circulation ${estimate.circulationCount}` +
              ` · intérêt ${estimate.wishlistInterest}`
            : "");
      })
      .join("\n");
    embed.setDescription(`${notice ? `${notice}\n\n` : ""}${description}`);

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

  const components = [];
  if (buttons.components.length > 0) components.push(buttons);
  const menu = recycleMenu(discordUserId, pageItems);
  if (menu) components.push(menu);
  await interaction.editReply({ embeds: [embed], components });
}

function supportedVariant(value: string): "normal" | "shiny" | "holo" {
  if (value === "normal" || value === "shiny" || value === "holo") return value;
  return "normal";
}

export async function handleRecycleCardSelect(
  interaction: StringSelectMenuInteraction,
  user: any,
  inventoryItemId: string
) {
  const entry = await prisma.inventoryItem.findFirst({
    where: {
      id: inventoryItemId,
      userId: user.id,
      quantity: { gt: 0 }
    },
    include: {
      card: { include: { rarity: true } }
    }
  });
  if (!entry) {
    await handleInventory(interaction, user, "❌ Cette carte n'est plus disponible.");
    return;
  }
  const variant = supportedVariant(entry.variant);
  const quote = await recycleService.getRecycleQuote(
    user.id,
    entry.cardId,
    1,
    variant
  );
  const embed = new EmbedBuilder()
    .setColor(0x9c27b0)
    .setTitle("♻️ Confirmer le recyclage")
    .setDescription(
      `Tu vas détruire **1× ${entry.card.name}** [${variant}].\n\n` +
      `Tu recevras :\n` +
      `💳 **${quote.credits} crédits**\n` +
      `🧩 **${quote.fragmentMin}–${quote.fragmentMax} fragments ${entry.card.rarity.name}**\n\n` +
      `Stock restant après confirmation : **${entry.quantity - 1}**`
    )
    .setFooter({ text: "Cette action est définitive." });
  await interaction.editReply({
    embeds: [embed],
    components: [
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId(createInteractionToken("m", interaction.user.id, entry.id))
          .setLabel("Confirmer le recyclage")
          .setEmoji("♻️")
          .setStyle(ButtonStyle.Danger),
        new ButtonBuilder()
          .setCustomId(createInteractionToken("v", interaction.user.id))
          .setLabel("Annuler")
          .setStyle(ButtonStyle.Secondary)
      )
    ]
  });
}

export async function handleRecycleCardConfirm(
  interaction: ButtonInteraction,
  user: any,
  inventoryItemId: string
) {
  const entry = await prisma.inventoryItem.findFirst({
    where: {
      id: inventoryItemId,
      userId: user.id,
      quantity: { gt: 0 }
    },
    include: { card: true }
  });
  if (!entry) {
    await handleInventory(interaction, user, "❌ Cette carte n'est plus disponible.");
    return;
  }
  const result = await recycleService.recycleCard(
    user.id,
    entry.cardId,
    1,
    interaction.id,
    supportedVariant(entry.variant),
    { confirmedLastCopy: true }
  );
  await handleInventory(
    interaction,
    user,
    `✅ **${result.card.name}** [${entry.variant}] recyclée : ` +
      `+${result.credits} crédits et +${result.fragments} fragments.`
  );
}

export async function handleRecycleCardCancel(
  interaction: ButtonInteraction,
  user: any
) {
  await handleInventory(interaction, user, "Recyclage annulé.");
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
        await interaction.reply({ content: "Cache expiré, refais /collection", ephemeral: true });
        return;
      }

      const pageSize = 10;
      const totalPages = Math.max(1, Math.ceil(cached.length / pageSize));
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
        .setTitle("🗃️ Collection")
        .setColor(0x5865f2)
        .setFooter({ text: `Page ${nextPage + 1}/${totalPages} (${cached.length} cartes total)` });

      const description = pageItems
        .map((i) => {
          const rarityName = (i.card as any).rarity?.name ?? "?";
          const emoji = rarityEmojiMap[rarityName] ?? "❓";
          return `${emoji} **${i.card.name}** [${i.variant}] x${i.quantity}`;
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

      const menu = recycleMenu(userId, pageItems);
      console.log(`[Button] Updating to page ${nextPage + 1}`);
      await interaction.update({
        embeds: [embed],
        components: menu ? [buttons, menu] : [buttons]
      });
    } catch (error) {
      console.error("[Button] Error:", error);
      await interaction.reply({ content: "Erreur lors du changement de page", ephemeral: true });
    }
  }
}
