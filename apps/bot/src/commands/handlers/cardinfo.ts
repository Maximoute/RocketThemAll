import {
  EmbedBuilder,
  type AutocompleteInteraction,
  type ChatInputCommandInteraction
} from "discord.js";
import {
  cardsService,
  economyService,
  prisma
} from "../service-instances.js";
import {
  attachCardImage,
  type CardImageVariant
} from "../card-media.js";
import {
  cardinfoDeckChoices,
  cardinfoNameChoices,
  type CardinfoAutocompleteCard
} from "../cardinfo-autocomplete.js";

const AUTOCOMPLETE_CACHE_MS = 5 * 60_000;
let autocompleteCache: { expiresAt: number; cards: CardinfoAutocompleteCard[] } | null = null;

async function autocompleteCatalog() {
  if (autocompleteCache && autocompleteCache.expiresAt > Date.now()) {
    return autocompleteCache.cards;
  }
  const cards = (await cardsService.getCards()).map((card) => ({
    id: card.id,
    name: card.name,
    contentKey: card.contentKey,
    acceptedNames: card.acceptedNames,
    deckName: card.deck.name
  }));
  autocompleteCache = { expiresAt: Date.now() + AUTOCOMPLETE_CACHE_MS, cards };
  return cards;
}

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

function normalizeSearch(value: string) {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .trim()
    .replace(/\s+/g, " ")
    .toLocaleLowerCase("fr-FR");
}

function acceptedNames(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === "string");
}

function cardTerms(card: {
  name: string;
  contentKey: string | null;
  acceptedNames: unknown;
}) {
  return [card.name, card.contentKey, ...acceptedNames(card.acceptedNames)]
    .filter((value): value is string => Boolean(value))
    .map(normalizeSearch);
}

function truncate(value: string, maximum: number) {
  if (value.length <= maximum) return value;
  return `${value.slice(0, maximum - 1)}…`;
}

function firstExternalUrl(value: unknown): string | null {
  if (typeof value === "string") {
    return /^https?:\/\//i.test(value) ? value : null;
  }
  if (Array.isArray(value)) {
    for (const entry of value) {
      const url = firstExternalUrl(entry);
      if (url) return url;
    }
    return null;
  }
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    for (const key of ["url", "link", "href", "videoUrl", "sourceUrl"]) {
      const url = firstExternalUrl(record[key]);
      if (url) return url;
    }
  }
  return null;
}

export async function handleCardinfoAutocomplete(interaction: AutocompleteInteraction) {
  const focused = interaction.options.getFocused(true);
  const cards = await autocompleteCatalog();

  if (focused.name === "nom") {
    const deck = interaction.options.getString("deck");
    await interaction.respond(cardinfoNameChoices(cards, String(focused.value), deck));
    return;
  }
  if (focused.name === "deck") {
    await interaction.respond(cardinfoDeckChoices(cards, String(focused.value)));
    return;
  }
  await interaction.respond([]);
}

export async function handleCardinfo(interaction: ChatInputCommandInteraction, user: any) {
  const rawQuery = interaction.options.getString("nom", true);
  const query = normalizeSearch(rawQuery);
  const requestedDeck = interaction.options.getString("deck")?.trim();
  const deckQuery = requestedDeck ? normalizeSearch(requestedDeck) : null;
  const requestedVariant = interaction.options.getString("variant") as CardImageVariant | null;
  const catalog = await cardsService.getCards();
  const deckMatches = deckQuery
    ? catalog.filter((card) => normalizeSearch(card.deck.name) === deckQuery)
    : catalog;
  const exactMatches = deckMatches.filter((card) =>
    cardTerms(card).some((term) => term === query)
  );
  const matches = exactMatches.length > 0
    ? exactMatches
    : deckMatches.filter((card) => cardTerms(card).some((term) => term.includes(query)));

  if (matches.length === 0) {
    const embed = new EmbedBuilder()
      .setColor(0xf44336)
      .setTitle("Carte introuvable")
      .setDescription(
        `Aucune carte Vault publiée ne correspond à **${truncate(rawQuery, 100)}**` +
        (requestedDeck ? ` dans le deck **${truncate(requestedDeck, 100)}**.` : ".")
      );
    await interaction.editReply({ embeds: [embed] });
    return;
  }

  if (matches.length > 1) {
    const choices = matches
      .slice(0, 12)
      .map((card) => `• **${card.name}** — ${card.deck.name} — \`${card.contentKey}\``)
      .join("\n");
    const suffix = matches.length > 12 ? `\n… et ${matches.length - 12} autre(s).` : "";
    const embed = new EmbedBuilder()
      .setColor(0xf1c40f)
      .setTitle("Plusieurs cartes correspondent")
      .setDescription(
        `${truncate(choices, 3600)}${suffix}\n\n` +
        "Relance `/cardinfo` avec l’identifiant Vault affiché, ou précise le champ `deck`."
      );
    await interaction.editReply({ embeds: [embed] });
    return;
  }

  const card = matches[0]!;
  const ownedRows = await prisma.inventoryItem.findMany({
    where: {
      userId: user.id,
      cardId: card.id,
      quantity: { gt: 0 }
    },
    select: {
      variant: true,
      quantity: true
    }
  });
  const quantities: Record<CardImageVariant, number> = {
    normal: 0,
    shiny: 0,
    holo: 0
  };
  for (const row of ownedRows) {
    quantities[row.variant] = row.quantity;
  }
  const displayVariant =
    requestedVariant ??
    (quantities.holo > 0
      ? "holo"
      : quantities.shiny > 0
        ? "shiny"
        : "normal");
  const values = await Promise.all(
    (["normal", "shiny", "holo"] as const).map((variant) =>
      economyService.getDynamicSellPrice(card.id, variant)
    )
  );
  const metadata =
    card.metadata && typeof card.metadata === "object" && !Array.isArray(card.metadata)
      ? card.metadata as Record<string, unknown>
      : {};
  const sourceUrl = firstExternalUrl(metadata.sourceUrl);
  const videoUrl = firstExternalUrl(metadata.videos);

  const embed = new EmbedBuilder()
    .setColor(rarityColors[card.rarity.name] ?? 0x5865f2)
    .setTitle(truncate(`${card.name} • ${displayVariant.toUpperCase()}`, 256))
    .setDescription(
      card.description
        ? truncate(card.description, 4000)
        : "Aucune description disponible."
    )
    .addFields(
      { name: "Rareté", value: card.rarity.name, inline: true },
      { name: "Deck", value: card.deck.name, inline: true },
      { name: "Identifiant Vault", value: `\`${card.contentKey ?? card.id}\``, inline: true },
      {
        name: "Tes exemplaires",
        value:
          `Normal : **${quantities.normal}**\n` +
          `Shiny : **${quantities.shiny}**\n` +
          `Holo : **${quantities.holo}**`,
        inline: true
      },
      {
        name: "Valeur dynamique",
        value: values
          .map((value) =>
            `${value.variant[0]!.toUpperCase()}${value.variant.slice(1)} : **${value.unitPrice.toLocaleString("fr-FR")} crédits**`
          )
          .join("\n"),
        inline: true
      },
      {
        name: "Récompense",
        value: `**${card.xpReward.toLocaleString("fr-FR")} XP** à la capture`,
        inline: true
      }
    )
    .setFooter({
      text: `Image affichée : variante ${displayVariant}`
    });

  const links = [
    sourceUrl ? `[Source](${sourceUrl})` : null,
    videoUrl ? `[Vidéo](${videoUrl})` : null
  ].filter((value): value is string => Boolean(value));
  if (links.length > 0) {
    embed.addFields({ name: "En savoir plus", value: links.join(" • ") });
  }

  const files = await attachCardImage(embed, card, displayVariant);
  await interaction.editReply({ embeds: [embed], files });
}
