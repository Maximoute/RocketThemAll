import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  StringSelectMenuBuilder,
  type ButtonInteraction,
  type ChatInputCommandInteraction,
  type StringSelectMenuInteraction
} from "discord.js";
import {
  boosterService,
  itemShopService,
  weeklyCardShopService,
  AppError,
  prisma
} from "../service-instances.js";
import {
  configuredDiscordSku,
  discordMonetizationEnabled,
  MONETIZATION_PRODUCTS
} from "@rta/services";
import { attachCardImage } from "../card-media.js";
import { createInteractionToken } from "../interaction-token.js";

type ShopInteraction =
  | ChatInputCommandInteraction
  | ButtonInteraction
  | StringSelectMenuInteraction;

function shopComponents(
  discordUserId: string,
  items: Array<{
    contentKey: string;
    name: string;
    type: string;
    metadata: unknown;
  }>
) {
  const chunks = [];
  for (let start = 0; start < items.length; start += 25) {
    chunks.push(items.slice(start, start + 25));
  }
  return chunks.slice(0, 5).map((chunk, index) =>
    new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId(createInteractionToken("k", discordUserId, index))
        .setPlaceholder(
          chunks.length === 1
            ? "Choisir un objet à acheter"
            : `Choisir un objet à acheter · liste ${index + 1}/${chunks.length}`
        )
        .addOptions(chunk.map((item) => {
          const metadata = item.metadata as Record<string, unknown>;
          const price = Number(metadata.creditPrice);
          return {
            label: item.name.slice(0, 100),
            value: item.contentKey,
            description: `${price.toLocaleString("fr-FR")} crédits · ${item.type}`.slice(0, 100)
          };
        }))
    )
  );
}

function weeklyCardComponents(
  discordUserId: string,
  offers: Array<{
    id: string;
    price: number;
    rarityName: string;
    purchased: boolean;
    card: { name: string; deck: { name: string } };
  }>
) {
  const available = offers.filter((offer) => !offer.purchased);
  if (available.length === 0) return null;
  return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(createInteractionToken("W", discordUserId))
      .setPlaceholder("Choisir une carte de la rotation hebdomadaire")
      .addOptions(available.map((offer) => ({
        label: offer.card.name.slice(0, 100),
        value: offer.id,
        description: (
          `${offer.rarityName} · ${offer.card.deck.name} · ` +
          `${offer.price.toLocaleString("fr-FR")} crédits`
        ).slice(0, 100)
      })))
  );
}

function monetizationComponents() {
  if (!discordMonetizationEnabled()) return null;
  const buttons = Object.values(MONETIZATION_PRODUCTS).flatMap((product) => {
    const skuId = configuredDiscordSku(product.key);
    return skuId
      ? [new ButtonBuilder().setStyle(ButtonStyle.Premium).setSKUId(skuId)]
      : [];
  });
  return buttons.length > 0
    ? new ActionRowBuilder<ButtonBuilder>().addComponents(buttons.slice(0, 5))
    : null;
}

export async function handleShop(
  interaction: ShopInteraction,
  user: any,
  selectedItem?: string,
  selectedWeeklyOffer?: string
) {
  const requestedItem = selectedItem?.trim() || (
    interaction.isChatInputCommand()
      ? interaction.options.getString("objet")?.trim()
      : undefined
  );
  let purchaseMessage: string | null = null;
  if (selectedWeeklyOffer) {
    const purchase = await weeklyCardShopService.buyWeeklyCard(
      user.id,
      selectedWeeklyOffer,
      interaction.id
    );
    purchaseMessage =
      `✅ **${purchase.offer.card.name}** [Normal] achetée pour ` +
      `**${purchase.price.toLocaleString("fr-FR")} crédits**.`;
  }
  if (requestedItem) {
    const definition = await prisma.itemDefinition.findUnique({
      where: { contentKey: requestedItem }
    });
    if (!definition || definition.status !== "PUBLISHED") {
      throw new AppError("Objet introuvable dans la boutique", 404);
    }
    if (definition.type === "BOOSTER") {
      const type = definition.contentKey.replace(/^booster\./, "");
      if (!["basic", "rare", "epic", "legendary"].includes(type)) {
        throw new AppError("Type de booster invalide", 400);
      }
      const purchase = await boosterService.buyBooster(
        user.id,
        type as "basic" | "rare" | "epic" | "legendary",
        interaction.id
      );
      purchaseMessage = `✅ **${definition.name}** acheté pour **${purchase.price.toLocaleString("fr-FR")} crédits**.`;
    } else {
      const purchase = await itemShopService.buyItem(
        user.id,
        definition.contentKey,
        interaction.id
      );
      purchaseMessage = `✅ **${definition.name}** acheté pour **${purchase.price.toLocaleString("fr-FR")} crédits**.`;
    }
  }
  const weeklyShop = await weeklyCardShopService.getWeeklyShop(user.id);
  const catalog = await prisma.itemDefinition.findMany({
    where: {
      status: "PUBLISHED"
    },
    orderBy: [{ type: "asc" }, { name: "asc" }]
  });
  const buyable = catalog.filter((item) => {
    if (!item.metadata || typeof item.metadata !== "object" || Array.isArray(item.metadata)) return false;
    const price = Number((item.metadata as Record<string, unknown>).creditPrice);
    return Number.isSafeInteger(price) && price > 0;
  });
  const boosterOrder = [
    "booster.basic",
    "booster.rare",
    "booster.epic",
    "booster.legendary"
  ];
  buyable.sort((left, right) => {
    if (left.type === "BOOSTER" && right.type === "BOOSTER") {
      return boosterOrder.indexOf(left.contentKey) - boosterOrder.indexOf(right.contentKey);
    }
    return left.type.localeCompare(right.type) || left.name.localeCompare(right.name, "fr");
  });
  const embed = new EmbedBuilder()
    .setColor(0xff9800)
    .setTitle("🛒 Boutique RTA")
    .setDescription(
      `${purchaseMessage ? `${purchaseMessage}\n\n` : ""}` +
      `💳 Ton solde : **${weeklyShop.credits.toLocaleString("fr-FR")} crédits**\n\n` +
      "Pour acheter : `/shop objet:<clé>`."
    );

  embed.addFields({
    name: "🃏 Cartes rares de la semaine",
    value: weeklyShop.offers.map((offer) =>
      `${offer.purchased ? "✅" : "•"} **${offer.card.name}** · ` +
      `${offer.rarityName} · ${offer.card.deck.name} · ` +
      `**${offer.price.toLocaleString("fr-FR")} crédits** · ` +
      `${offer.circulationSnapshot} en circulation au tirage`
    ).join("\n") +
      `\n\nNouvelle rotation <t:${Math.floor(weeklyShop.endsAt.getTime() / 1000)}:R>. ` +
      "Chaque carte ne peut être achetée qu’une fois par joueur pendant la semaine."
  });

  const groups = new Map<string, string[]>();
  for (const item of buyable) {
    const metadata = item.metadata as Record<string, unknown>;
    const price = Number(metadata.creditPrice);
    const category = typeof metadata.category === "string" ? metadata.category : item.type;
    const rows = groups.get(category) ?? [];
    rows.push(`\`${item.contentKey}\` — ${price.toLocaleString("fr-FR")} crédits`);
    groups.set(category, rows);
  }
  for (const [category, rows] of groups) {
    embed.addFields({ name: category, value: rows.join("\n"), inline: false });
  }
  const premiumRow = monetizationComponents();
  if (premiumRow) {
    embed.addFields({
      name: "💎 VIP, Fondateur et packs de crédits",
      value:
        "Les boutons Premium ci-dessous ouvrent le paiement natif Discord. " +
        "Les packs ajoutent directement des crédits, sans monnaie premium intermédiaire."
    });
  }
  const website = process.env.PUBLIC_BASE_URL?.replace(/\/+$/, "");
  if (website) {
    embed.addFields({
      name: "Boutique web sécurisée",
      value: `${website}/shop#support`
    });
  }
  embed.setFooter({
    text: `${weeklyShop.offers.length} cartes hebdomadaires · ${buyable.length} objets achetables`
  });
  const catalogRows = shopComponents(interaction.user.id, buyable);
  const weeklyRow = weeklyCardComponents(interaction.user.id, weeklyShop.offers);
  await interaction.editReply({
    embeds: [embed],
    components: premiumRow
      ? [...(weeklyRow ? [weeklyRow] : []), ...catalogRows.slice(0, 3), premiumRow]
      : [...(weeklyRow ? [weeklyRow] : []), ...catalogRows.slice(0, 4)]
  });
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
  const result = await boosterService.craftBooster(user.id, interaction.id);
  const embed = new EmbedBuilder()
    .setColor(0x4caf50)
    .setTitle("🧪 Craft réussi")
    .setDescription(`${result.cost} fragments → 1 ${result.boosterType} booster.`);
  await interaction.editReply({ embeds: [embed] });
}

export async function handleBoosterBuy(interaction: ChatInputCommandInteraction, user: any) {
  const type = interaction.options.getString("type", true) as "basic" | "rare" | "epic" | "legendary";
  const result = await boosterService.buyBooster(user.id, type, interaction.id);
  const embed = new EmbedBuilder()
    .setColor(0x4caf50)
    .setTitle("🛍️ Achat réussi")
    .setDescription(`${type} booster acheté pour ${result.price} crédits.`);
  await interaction.editReply({ embeds: [embed] });
}

export async function handleBoosterOpen(interaction: ChatInputCommandInteraction, user: any) {
  const type = interaction.options.getString("type", true) as "basic" | "rare" | "epic" | "legendary";
  const guildId = interaction.guildId ?? undefined;
  const opened = await boosterService.openBooster(user.id, type, guildId, interaction.id);
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

  await interaction.editReply({
    embeds: [
      new EmbedBuilder()
        .setColor(0xffd700)
        .setDescription(`🎁 Booster ${type} ouvert : **1 carte** obtenue.`)
    ]
  });

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
    const files = await attachCardImage(embed, card, row.variant);

    await interaction.followUp({ embeds: [embed], files });
  }
}
