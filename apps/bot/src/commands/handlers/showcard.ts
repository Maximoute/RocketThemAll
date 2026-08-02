import {
  EmbedBuilder,
  type AutocompleteInteraction,
  type ChatInputCommandInteraction
} from "discord.js";
import { AppError, prisma } from "../service-instances.js";
import { attachCardImage } from "../card-media.js";
import { showcardAutocompleteChoices } from "../showcard-autocomplete.js";

const rarityColors: Record<string, number> = {
  Common: 0x9e9e9e,
  Uncommon: 0x4caf50,
  Rare: 0x2196f3,
  "Very Rare": 0x9c27b0,
  Import: 0xff9800,
  Exotic: 0xf44336,
  "Black Market": 0x111111,
  Limited: 0xffd700
};

const variantLabels = {
  normal: "NORMAL",
  shiny: "✨ SHINY",
  holo: "🌌 HOLO"
} as const;

export async function handleShowcardAutocomplete(interaction: AutocompleteInteraction) {
  const user = await prisma.user.findUnique({
    where: { discordId: interaction.user.id },
    select: { id: true }
  });
  if (!user) {
    await interaction.respond([]);
    return;
  }

  const inventory = await prisma.inventoryItem.findMany({
    where: { userId: user.id, quantity: { gt: 0 } },
    select: {
      id: true,
      variant: true,
      quantity: true,
      card: {
        select: {
          name: true,
          contentKey: true,
          deck: { select: { name: true } },
          rarity: { select: { weight: true } }
        }
      }
    },
    take: 3_000
  });
  const focused = String(interaction.options.getFocused() ?? "");
  await interaction.respond(showcardAutocompleteChoices(
    inventory.map((item) => ({
      id: item.id,
      name: item.card.name,
      contentKey: item.card.contentKey,
      deckName: item.card.deck.name,
      rarityWeight: item.card.rarity.weight,
      variant: item.variant,
      quantity: item.quantity
    })),
    focused
  ));
}

export async function handleShowcard(
  interaction: ChatInputCommandInteraction,
  user: { id: string; username: string }
) {
  const inventoryItemId = interaction.options.getString("carte", true);
  const item = await prisma.inventoryItem.findFirst({
    where: {
      id: inventoryItemId,
      userId: user.id,
      quantity: { gt: 0 }
    },
    include: {
      card: { include: { deck: true, rarity: true } }
    }
  });
  if (!item) {
    throw new AppError(
      "Cette carte n’est pas dans ton inventaire. Choisis une carte proposée par l’autocomplétion.",
      403
    );
  }

  const ownerName = interaction.member && "displayName" in interaction.member
    ? interaction.member.displayName
    : interaction.user.globalName ?? interaction.user.username;
  const variantLabel = variantLabels[item.variant];
  const embed = new EmbedBuilder()
    .setColor(rarityColors[item.card.rarity.name] ?? 0x5865f2)
    .setAuthor({
      name: `Collection certifiée de ${ownerName}`,
      iconURL: interaction.user.displayAvatarURL()
    })
    .setTitle(`🏆 ${item.card.name} · ${variantLabel}`)
    .setDescription(
      `**<@${interaction.user.id}> possède réellement cette carte.**\n` +
      `Elle est certifiée dans son inventaire Rocket Them All — ce n’est pas une simple fiche de catalogue.`
    )
    .addFields(
      { name: "Propriétaire", value: `<@${interaction.user.id}>`, inline: true },
      { name: "Variante possédée", value: `**${variantLabel}**`, inline: true },
      { name: "Quantité possédée", value: `**${item.quantity}**`, inline: true },
      { name: "Rareté", value: item.card.rarity.name, inline: true },
      { name: "Deck", value: item.card.deck.name, inline: true },
      {
        name: "Identifiant Vault",
        value: `\`${item.card.contentKey ?? item.card.id}\``,
        inline: true
      }
    )
    .setFooter({
      text: `Propriété vérifiée dans l’inventaire de ${user.username} • Rocket Them All`
    })
    .setTimestamp();

  const files = await attachCardImage(embed, item.card, item.variant);
  await interaction.editReply({
    embeds: [embed],
    files,
    allowedMentions: { parse: [] }
  });
}
