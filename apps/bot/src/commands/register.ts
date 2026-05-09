import {
  SlashCommandBuilder,
  REST,
  Routes,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  type ChatInputCommandInteraction,
  type ButtonInteraction,
  type AutocompleteInteraction
} from "discord.js";
import axios from "axios";
import {
  BoosterService,
  CaptureService,
  InventoryService,
  TradeService,
  UsersService,
  CardsService,
  ConfigService,
  SpawnService,
  SpawnEnergyService,
  EconomyService,
  SellService,
  RecycleService,
  FusionService,
  DailyService,
  LogsService,
  AppError
} from "@rta/services";
import { prisma } from "@rta/database";

const captureService = new CaptureService();
const inventoryService = new InventoryService();
const boosterService = new BoosterService();
const tradeService = new TradeService();
const usersService = new UsersService();
const cardsService = new CardsService();
const configService = new ConfigService();
const spawnService = new SpawnService();
const spawnEnergyService = new SpawnEnergyService();
const economyService = new EconomyService();
const sellService = new SellService();
const recycleService = new RecycleService();
const fusionService = new FusionService();
const dailyService = new DailyService();
const logsService = new LogsService();

// Cache pour la pagination de l'inventaire (userId -> items triés)
const inventoryCache = new Map<string, Array<{ card: any; quantity: number }>>();
type DeckOwnedFilter = "all" | "owned" | "missing";
type DeckBrowseRow = {
  card: any;
  totalQty: number;
  normalQty: number;
  shinyQty: number;
  holoQty: number;
};
type DeckBrowseFilters = {
  cardName: string;
  rarity: string;
  owned: DeckOwnedFilter;
  category: string;
};
type DeckBrowseCacheEntry = {
  deckName: string;
  filters: DeckBrowseFilters;
  ownedUnique: number;
  totalCards: number;
  rows: DeckBrowseRow[];
};
const deckBrowseCache = new Map<string, DeckBrowseCacheEntry>();

const DECK_OWNED_FILTER_LABEL: Record<DeckOwnedFilter, string> = {
  all: "Toutes",
  owned: "Possédées",
  missing: "Manquantes"
};
const ADMIN_ROLE_ID = process.env.DISCORD_ADMIN_ROLE_ID ?? process.env.ADMIN_ROLE_ID;
const COMMAND_COOLDOWN_MS = Number(process.env.BOT_COMMAND_COOLDOWN_MS ?? 1500);
const commandCooldowns = new Map<string, number>();
const ADMIN_IMPORT_SOURCES = new Set([
  "pokemon",
  "pop/movies",
  "pop/anime",
  "pop/games",
  "pop/nekos",
  "pop/manual",
  "pop/all"
]);

function hasDiscordAdminRole(interaction: ChatInputCommandInteraction): boolean {
  if (!ADMIN_ROLE_ID) {
    return false;
  }

  const member = interaction.member as { roles?: { cache?: Map<string, unknown> } | string[] } | null;
  if (!member?.roles) {
    return false;
  }

  if (Array.isArray(member.roles)) {
    return member.roles.includes(ADMIN_ROLE_ID);
  }

  const rolesCache = (member.roles as { cache?: { has?: (roleId: string) => boolean } }).cache;
  if (!rolesCache || typeof rolesCache.has !== "function") {
    return false;
  }

  return rolesCache.has(ADMIN_ROLE_ID);
}

function formatDuration(ms: number | null) {
  if (ms === null || ms <= 0) {
    return "0h 0m";
  }

  const totalMinutes = Math.ceil(ms / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${hours}h ${minutes}m`;
}

function serializeCommandOptions(options: Array<{ name: string; value?: unknown; options?: Array<{ name: string; value?: unknown; options?: unknown[] }> }>) {
  return options.map((option) => ({
    name: option.name,
    value: option.value ?? null,
    options: Array.isArray(option.options) ? serializeCommandOptions(option.options as Array<{ name: string; value?: unknown; options?: unknown[] }>) : []
  }));
}

function inferCommandStatusFromResponse(content: string) {
  const normalized = content.toLowerCase();
  const errorMarkers = [
    "introuvable",
    "aucun",
    "erreur",
    "insuffisant",
    "désactiv",
    "refus",
    "impossible",
    "cooldown",
    "trop rapide",
    "échappée",
    "échappé"
  ];
  return errorMarkers.some((marker) => normalized.includes(marker)) ? "error" : "success";
}

function buildDeckEmbed(
  userId: string,
  cacheKey: string,
  currentPage: number,
  entry: DeckBrowseCacheEntry
) {
  const pageSize = 10;
  const totalPages = Math.max(1, Math.ceil(entry.rows.length / pageSize));
  const safePage = Math.max(0, Math.min(currentPage, totalPages - 1));
  const start = safePage * pageSize;
  const end = start + pageSize;
  const pageRows = entry.rows.slice(start, end);

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

  const filtersSummary = [
    `nom: ${entry.filters.cardName || "-"}`,
    `rareté: ${entry.filters.rarity === "all" ? "Toutes" : entry.filters.rarity}`,
    `possédé: ${DECK_OWNED_FILTER_LABEL[entry.filters.owned]}`,
    `catégorie: ${entry.filters.category || "-"}`
  ].join(" · ");

  const embed = new EmbedBuilder()
    .setTitle(`📚 Deck ${entry.deckName}`)
    .setColor(0x5865f2)
    .setDescription(
      `Progression : **${entry.ownedUnique}/${entry.totalCards}**\n` +
      `Filtres : **${filtersSummary}**`
    )
    .setFooter({ text: `Page ${safePage + 1}/${totalPages} (${entry.rows.length} cartes affichées)` });

  if (pageRows.length === 0) {
    embed.addFields({ name: "Résultat", value: "Aucune carte avec ce filtre." });
  } else {
    embed.addFields({
      name: "Cartes",
      value: pageRows.map((row) => {
        const rarityName = (row.card as any).rarity?.name ?? "?";
        const emoji = rarityEmojiMap[rarityName] ?? "❓";
        return `${emoji} **${row.card.name}** · ${row.totalQty} (N:${row.normalQty} S:${row.shinyQty} H:${row.holoQty})`;
      }).join("\n")
    });
  }

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`deck_prev_${userId}_${safePage}_${cacheKey}`)
      .setLabel("◀ Précédent")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(safePage === 0),
    new ButtonBuilder()
      .setCustomId(`deck_next_${userId}_${safePage}_${cacheKey}`)
      .setLabel("Suivant ▶")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(safePage >= totalPages - 1)
  );

  return { embed, components: totalPages > 1 ? [row] : [] as ActionRowBuilder<ButtonBuilder>[] };
}

function scheduleManualSpawnPublicNotice(params: {
  interaction: ChatInputCommandInteraction;
  channelId: string;
  launcherUserId: string;
  launcherDiscordId: string;
  spawnCreatedAt: Date;
}) {
  const PRIVATE_WINDOW_MS = 2 * 60 * 1000;
  const TOTAL_WINDOW_MS = 5 * 60 * 1000;

  setTimeout(async () => {
    try {
      const active = await spawnService.getActiveSpawn(params.channelId);
      const windowStart = params.spawnCreatedAt.getTime() - 1000;
      const windowEnd = params.spawnCreatedAt.getTime() + 1000;
      const sameSpawn = active.filter((entry) =>
        entry.spawnType === "manual" &&
        entry.userId === params.launcherUserId &&
        entry.createdAt.getTime() >= windowStart &&
        entry.createdAt.getTime() <= windowEnd
      );

      const channel = await params.interaction.client.channels.fetch(params.channelId);
      if (!channel || !("send" in channel)) {
        return;
      }

      const remaining = sameSpawn.length;
      if (remaining > 0) {
        await channel.send(
          `🌍 Le spawn de <@${params.launcherDiscordId}> est maintenant **PUBLIC** pour tout le monde pendant **3 minutes**.\n` +
          `Il reste **${remaining}** carte(s) en jeu.`
        );
      } else {
        await channel.send(
          `🌍 Le spawn de <@${params.launcherDiscordId}> est passé en phase **publique** (3 min), mais toutes les cartes ont déjà été capturées.`
        );
      }
    } catch (error) {
      console.error("Failed to announce manual spawn public phase", error);
    }
  }, PRIVATE_WINDOW_MS);

  setTimeout(async () => {
    try {
      const active = await spawnService.getActiveSpawn(params.channelId);
      const windowStart = params.spawnCreatedAt.getTime() - 1000;
      const windowEnd = params.spawnCreatedAt.getTime() + 1000;
      const sameSpawnCount = active.filter((entry) =>
        entry.spawnType === "manual" &&
        entry.userId === params.launcherUserId &&
        entry.createdAt.getTime() >= windowStart &&
        entry.createdAt.getTime() <= windowEnd
      ).length;

      if (sameSpawnCount === 0) {
        return;
      }

      const channel = await params.interaction.client.channels.fetch(params.channelId);
      if (!channel || !("send" in channel)) {
        return;
      }

      await channel.send(`⌛ Le spawn de <@${params.launcherDiscordId}> a expiré.`);
    } catch (error) {
      console.error("Failed to announce manual spawn expiration", error);
    }
  }, TOTAL_WINDOW_MS);
}

export const commandBuilders = [
  new SlashCommandBuilder().setName("capture").setDescription("Capture une carte").addStringOption((o) => o.setName("nom").setDescription("Nom de la carte").setRequired(true)),
  new SlashCommandBuilder().setName("spawn").setDescription("Forcer un spawn manuel (cooldown personnel)"),
  new SlashCommandBuilder().setName("sell").setDescription("Vendre une carte contre des crédits")
    .addStringOption((o) => o.setName("nom").setDescription("Nom de la carte").setRequired(true))
    .addIntegerOption((o) => o.setName("quantite").setDescription("Quantité").setRequired(true).setMinValue(1))
    .addStringOption((o) => o.setName("variant").setDescription("Variante").addChoices(
      { name: "normal", value: "normal" },
      { name: "shiny", value: "shiny" },
      { name: "holo", value: "holo" }
    )),
  new SlashCommandBuilder().setName("recycle").setDescription("Recycler une carte contre crédits + fragments")
    .addStringOption((o) => o.setName("nom").setDescription("Nom de la carte").setRequired(true))
    .addIntegerOption((o) => o.setName("quantite").setDescription("Quantité").setRequired(true).setMinValue(1))
    .addStringOption((o) => o.setName("variant").setDescription("Variante à recycler").addChoices(
      { name: "normal", value: "normal" },
      { name: "shiny", value: "shiny" },
      { name: "holo", value: "holo" },
      { name: "toutes (mix)", value: "any" }
    )),
  new SlashCommandBuilder().setName("fragment").setDescription("Fragmenter une carte contre crédits + fragments")
    .addStringOption((o) => o.setName("nom").setDescription("Nom de la carte").setRequired(true))
    .addIntegerOption((o) => o.setName("quantite").setDescription("Quantité").setRequired(true).setMinValue(1))
    .addStringOption((o) => o.setName("variant").setDescription("Variante à recycler").addChoices(
      { name: "normal", value: "normal" },
      { name: "shiny", value: "shiny" },
      { name: "holo", value: "holo" },
      { name: "toutes (mix)", value: "any" }
    )),
  new SlashCommandBuilder().setName("value").setDescription("Voir la valeur dynamique d'une carte")
    .addStringOption((o) => o.setName("nom").setDescription("Nom de la carte").setRequired(true))
    .addStringOption((o) => o.setName("variant").setDescription("Variante").addChoices(
      { name: "normal", value: "normal" },
      { name: "shiny", value: "shiny" },
      { name: "holo", value: "holo" }
    )),
  new SlashCommandBuilder().setName("fusion").setDescription("Fusionner 5 cartes d'une rareté vers le tier supérieur")
    .addStringOption((o) => o.setName("rarity").setDescription("Rareté à fusionner").setRequired(true).addChoices(
      { name: "Common", value: "Common" },
      { name: "Uncommon", value: "Uncommon" },
      { name: "Rare", value: "Rare" },
      { name: "Very Rare", value: "Very Rare" },
      { name: "Import", value: "Import" },
      { name: "Exotic", value: "Exotic" }
    )),
  new SlashCommandBuilder().setName("daily").setDescription("Réclamer la récompense quotidienne"),
  new SlashCommandBuilder().setName("shop").setDescription("Voir la boutique de boosters"),
  new SlashCommandBuilder().setName("boosters").setDescription("Voir les boosters possédés"),
  new SlashCommandBuilder().setName("craft").setDescription("Craft avec des fragments")
    .addSubcommand((s) => s.setName("booster").setDescription("Craft un basic booster avec des fragments")),
  new SlashCommandBuilder().setName("inventory").setDescription("Voir inventaire")
    .addStringOption((o) => o.setName("deck").setDescription("Deck actif du serveur ou 'tous'").setRequired(true).setAutocomplete(true))
    .addStringOption((o) => o.setName("carte").setDescription("Filtre par nom de carte").setAutocomplete(true))
    .addStringOption((o) => o.setName("rarete").setDescription("Filtre par rareté").addChoices(
      { name: "Common", value: "Common" },
      { name: "Uncommon", value: "Uncommon" },
      { name: "Rare", value: "Rare" },
      { name: "Very Rare", value: "Very Rare" },
      { name: "Import", value: "Import" },
      { name: "Exotic", value: "Exotic" },
      { name: "Black Market", value: "Black Market" },
      { name: "Limited", value: "Limited" }
    ))
    .addStringOption((o) => o.setName("categorie").setDescription("Filtre par catégorie").setAutocomplete(true)),
  new SlashCommandBuilder().setName("deck").setDescription("Parcourir un deck et ta progression")
    .addStringOption((o) => o.setName("nom").setDescription("Nom du deck").setRequired(true).setAutocomplete(true))
    .addStringOption((o) => o.setName("carte").setDescription("Filtre par nom de carte"))
    .addStringOption((o) => o.setName("rarete").setDescription("Filtre par rareté").addChoices(
      { name: "toutes", value: "all" },
      { name: "Common", value: "Common" },
      { name: "Uncommon", value: "Uncommon" },
      { name: "Rare", value: "Rare" },
      { name: "Very Rare", value: "Very Rare" },
      { name: "Import", value: "Import" },
      { name: "Exotic", value: "Exotic" },
      { name: "Black Market", value: "Black Market" },
      { name: "Limited", value: "Limited" }
    ))
    .addStringOption((o) => o.setName("possede").setDescription("Filtre possession").addChoices(
      { name: "toutes", value: "all" },
      { name: "possédées", value: "owned" },
      { name: "manquantes", value: "missing" }
    ))
    .addStringOption((o) => o.setName("categorie").setDescription("Filtre par catégorie (ex: movie, anime, body...)")),
  new SlashCommandBuilder().setName("profile").setDescription("Voir profil"),
  new SlashCommandBuilder().setName("cardinfo").setDescription("Voir info carte")
    .addStringOption((o) => o.setName("nom").setDescription("Nom de la carte").setRequired(true))
    .addStringOption((o) => o.setName("variant").setDescription("Variante à afficher").addChoices(
      { name: "toutes", value: "all" },
      { name: "normal", value: "normal" },
      { name: "shiny", value: "shiny" },
      { name: "holo", value: "holo" }
    )),
  new SlashCommandBuilder().setName("leaderboard").setDescription("Classement"),
  new SlashCommandBuilder().setName("booster").setDescription("Gestion booster")
    .addSubcommand((s) =>
      s
        .setName("buy")
        .setDescription("Acheter un booster")
        .addStringOption((o) =>
          o
            .setName("type")
            .setDescription("Type de booster")
            .setRequired(true)
            .addChoices(
              { name: "basic", value: "basic" },
              { name: "rare", value: "rare" },
              { name: "epic", value: "epic" },
              { name: "legendary", value: "legendary" }
            )
        )
    )
    .addSubcommand((s) =>
      s
        .setName("open")
        .setDescription("Ouvrir un booster")
        .addStringOption((o) =>
          o
            .setName("type")
            .setDescription("Type de booster")
            .setRequired(true)
            .addChoices(
              { name: "basic", value: "basic" },
              { name: "rare", value: "rare" },
              { name: "epic", value: "epic" },
              { name: "legendary", value: "legendary" }
            )
        )
    ),
  new SlashCommandBuilder().setName("trade").setDescription("Gestion trade")
    .addSubcommand((s) => s.setName("user").setDescription("Inviter un joueur en trade").addUserOption((o) => o.setName("user").setDescription("Utilisateur").setRequired(true)))
    .addSubcommand((s) => s.setName("accept").setDescription("Accepter une invitation de trade"))
    .addSubcommandGroup((g) =>
      g
        .setName("add")
        .setDescription("Ajouter au trade")
        .addSubcommand((s) =>
          s
            .setName("card")
            .setDescription("Ajouter carte")
            .addStringOption((o) => o.setName("carte").setDescription("Carte").setRequired(true))
            .addIntegerOption((o) => o.setName("quantity").setDescription("Quantite").setMinValue(1))
            .addStringOption((o) => o.setName("variant").setDescription("Variante").addChoices(
              { name: "normal", value: "normal" },
              { name: "shiny", value: "shiny" },
              { name: "holo", value: "holo" }
            ))
        )
        .addSubcommand((s) =>
          s
            .setName("booster")
            .setDescription("Ajouter booster")
            .addStringOption((o) => o.setName("type").setDescription("Type booster").setRequired(true).addChoices(
              { name: "basic", value: "basic" },
              { name: "rare", value: "rare" },
              { name: "epic", value: "epic" },
              { name: "legendary", value: "legendary" }
            ))
            .addIntegerOption((o) => o.setName("quantity").setDescription("Quantite").setMinValue(1))
        )
    )
    .addSubcommandGroup((g) =>
      g
        .setName("remove")
        .setDescription("Retirer du trade")
        .addSubcommand((s) =>
          s
            .setName("card")
            .setDescription("Retirer carte")
            .addStringOption((o) => o.setName("carte").setDescription("Carte").setRequired(true))
            .addIntegerOption((o) => o.setName("quantity").setDescription("Quantite").setMinValue(1))
            .addStringOption((o) => o.setName("variant").setDescription("Variante").addChoices(
              { name: "normal", value: "normal" },
              { name: "shiny", value: "shiny" },
              { name: "holo", value: "holo" }
            ))
        )
        .addSubcommand((s) =>
          s
            .setName("booster")
            .setDescription("Retirer booster")
            .addStringOption((o) => o.setName("type").setDescription("Type booster").setRequired(true).addChoices(
              { name: "basic", value: "basic" },
              { name: "rare", value: "rare" },
              { name: "epic", value: "epic" },
              { name: "legendary", value: "legendary" }
            ))
            .addIntegerOption((o) => o.setName("quantity").setDescription("Quantite").setMinValue(1))
        )
    )
    .addSubcommand((s) => s.setName("confirm").setDescription("Confirmer trade"))
    .addSubcommand((s) => s.setName("cancel").setDescription("Annuler trade")),
  new SlashCommandBuilder().setName("admin").setDescription("Commandes admin")
    .addSubcommand((s) => s.setName("import").setDescription("Importer cartes").addStringOption((o) => o.setName("source").setDescription("Source").addChoices(
        { name: "pokemon", value: "pokemon" },
        { name: "pop/movies — Films & séries (TMDb)", value: "pop/movies" },
        { name: "pop/anime — Anime & manga (Jikan)", value: "pop/anime" },
        { name: "pop/games — Jeux vidéo (RAWG)", value: "pop/games" },
        { name: "pop/nekos — Neko cards (nekos.best)", value: "pop/nekos" },
        { name: "pop/manual — Cartes manuelles (JSON)", value: "pop/manual" },
        { name: "pop/all — Import complet pop", value: "pop/all" }
      ).setRequired(true)).addIntegerOption((o) => o.setName("limit").setDescription("Limite")))
    .addSubcommandGroup((group) =>
      group
        .setName("spawn")
        .setDescription("Gestion admin des spawns")
        .addSubcommand((s) =>
          s
            .setName("force")
            .setDescription("Force un spawn immediat")
            .addStringOption((o) => o.setName("card_name").setDescription("Nom exact de la carte (optionnel)"))
        )
        .addSubcommand((s) => s.setName("cancel").setDescription("Annule le spawn actif du serveur"))
        .addSubcommand((s) =>
          s
            .setName("config")
            .setDescription("Met a jour la configuration des spawns")
            .addBooleanOption((o) => o.setName("auto_enabled").setDescription("Activer le spawn automatique"))
            .addIntegerOption((o) => o.setName("auto_interval_minutes").setDescription("Frequence auto (minutes)").setMinValue(1).setMaxValue(1440))
            .addBooleanOption((o) => o.setName("manual_enabled").setDescription("Activer le spawn manuel"))
            .addIntegerOption((o) => o.setName("manual_max_charges").setDescription("Charges max de /spawn").setMinValue(1).setMaxValue(20))
            .addIntegerOption((o) => o.setName("manual_regen_hours").setDescription("Heures pour regenerer 1 charge").setMinValue(1).setMaxValue(168))
        )
    )
].map((cmd) => cmd.toJSON());

export async function registerCommands() {
  const token = process.env.DISCORD_TOKEN;
  const clientId = process.env.DISCORD_CLIENT_ID;

  if (!token || !clientId) {
    throw new Error("Missing Discord env variables");
  }

  const rest = new REST({ version: "10" }).setToken(token);
  await rest.put(Routes.applicationCommands(clientId), { body: commandBuilders });
  console.log(`Registered ${commandBuilders.length} global slash commands`);
}

export async function registerGuildCommands(guildIds: string[]) {
  const token = process.env.DISCORD_TOKEN;
  const clientId = process.env.DISCORD_CLIENT_ID;

  if (!token || !clientId || guildIds.length === 0) {
    return;
  }

  const rest = new REST({ version: "10" }).setToken(token);
  for (const guildId of guildIds) {
    await rest.put(Routes.applicationGuildCommands(clientId, guildId), { body: commandBuilders });
  }

  console.log(`Registered ${commandBuilders.length} guild slash commands for ${guildIds.length} guild(s)`);
}

async function resolveGuildSpawnChannelId(guildId: string | null) {
  if (!guildId) {
    throw new AppError("Commande utilisable uniquement dans un serveur Discord.", 400);
  }

  const guildConfig = await configService.getGuildConfig(guildId);
  const channelId = guildConfig?.spawnChannelId || process.env.DISCORD_SPAWN_CHANNEL_ID;
  if (!channelId) {
    throw new AppError("Aucun salon de spawn n'est configuré pour ce serveur.", 400);
  }

  return channelId;
}

async function sendSpawnCards(
  interaction: ChatInputCommandInteraction,
  channelId: string,
  cards: Array<{ imageUrl: string | null; rarity: { name: string } }>,
  content: string
) {
  const channel = await interaction.client.channels.fetch(channelId);
  if (!channel || !("send" in channel)) {
    throw new AppError("Impossible d'envoyer le spawn dans le salon configuré.", 500);
  }

  const embeds = cards.map((card, index) => {
    const embed = new EmbedBuilder()
      .setTitle(`Carte mysterieuse #${index + 1}`)
      .setDescription(`**Rarete :** ${card.rarity?.name ?? "?"}\nUtilisez /capture <nom> pour la capturer.`)
      .setColor(0x5865F2);

    if (card.imageUrl) {
      embed.setImage(card.imageUrl);
    }

    return embed;
  });

  await channel.send({ content, embeds });
}

async function findCardByName(cardName: string) {
  const cards = await cardsService.getCards();
  return cards.find((card) => card.name.toLowerCase() === cardName.toLowerCase());
}

async function resolveActiveTradeForUser(userId: string) {
  return prisma.trade.findFirst({
    where: {
      status: "pending",
      expiresAt: { gt: new Date() },
      OR: [{ user1Id: userId }, { user2Id: userId }]
    },
    orderBy: { createdAt: "desc" }
  });
}

async function resolveIncomingTradeForUser(userId: string) {
  return prisma.trade.findFirst({
    where: {
      status: "pending",
      expiresAt: { gt: new Date() },
      user2Id: userId
    },
    orderBy: { createdAt: "desc" }
  });
}

async function isTradeAccepted(tradeId: string) {
  const accepted = await prisma.adminLog.findFirst({
    where: { action: "TRADE_ACCEPTED", target: tradeId }
  });
  return Boolean(accepted);
}

export async function handleCommand(interaction: ChatInputCommandInteraction) {
  const commandOptions = serializeCommandOptions(interaction.options.data as Array<{ name: string; value?: unknown; options?: Array<{ name: string; value?: unknown; options?: unknown[] }> }>);
  let commandStatus = "success";
  let commandResponse: string | undefined;
  let commandError: string | undefined;
  let user: Awaited<ReturnType<typeof usersService.getOrCreateDiscordUser>> | null = null;
  const send = async (content: string) => {
    commandResponse = content;
    commandStatus = inferCommandStatusFromResponse(content);
    if (interaction.deferred || interaction.replied) {
      return interaction.editReply(content);
    }
    return interaction.reply(content);
  };

  const discordId = interaction.user.id;

  try {
    // Lightweight anti-spam guard across all slash commands.
    const cooldownKey = `${discordId}:${interaction.commandName}`;
    const now = Date.now();
    const nextAllowedAt = commandCooldowns.get(cooldownKey) ?? 0;
    if (now < nextAllowedAt) {
      const waitSeconds = Math.ceil((nextAllowedAt - now) / 1000);
      return send(`⏳ Trop rapide. Réessaie dans ${waitSeconds}s.`);
    }
    commandCooldowns.set(cooldownKey, now + Math.max(500, COMMAND_COOLDOWN_MS));

    user = await usersService.getOrCreateDiscordUser(discordId, interaction.user.username, interaction.user.displayAvatarURL());

    if (interaction.commandName === "spawn") {
    try {
      const spawnChannelId = await resolveGuildSpawnChannelId(interaction.guildId);
      const result = await spawnService.createManualSpawn(user.id, spawnChannelId, {
        spawnType: "manual",
        guildId: interaction.guildId ?? undefined,
        guildName: interaction.guild?.name ?? undefined,
        discordUserId: interaction.user.id,
        username: interaction.user.username
      });

      await sendSpawnCards(
        interaction,
        spawnChannelId,
        result.cards,
        `Spawn manuel lance par <@${interaction.user.id}>.\n🔒 Privé 2 minutes pour le lanceur, puis 🌍 public 3 minutes pour tout le monde (durée totale: 5 minutes).`
      );

      scheduleManualSpawnPublicNotice({
        interaction,
        channelId: spawnChannelId,
        launcherUserId: user.id,
        launcherDiscordId: interaction.user.id,
        spawnCreatedAt: result.spawnCreatedAt
      });

      const remainingText = `Tu as utilisé 1 charge de spawn. Charges restantes : ${result.energy.charges}/${result.energy.maxCharges}.`;
      if (interaction.channelId === spawnChannelId) {
        return send(`${remainingText}\n3 cartes se sont ajoutées au spawn actif.`);
      }

      return send(`${remainingText}\nSpawn manuel effectue dans <#${spawnChannelId}>: 3 cartes se sont ajoutées au spawn actif.`);
    } catch (error) {
      if (error instanceof AppError) {
        if (error.message === "NO_SPAWN_CHARGES") {
          const nextChargeInMs = await spawnEnergyService.getTimeUntilNextCharge(user.id);
          return send(`Tu n’as plus de /spawn disponible. Prochaine charge dans ${formatDuration(nextChargeInMs)}.`);
        }
        return send(error.message);
      }
      throw error;
    }
  }

  if (interaction.commandName === "sell") {
    const cardName = interaction.options.getString("nom", true);
    const quantity = interaction.options.getInteger("quantite", true);
    const variant = (interaction.options.getString("variant") ?? "normal") as "normal" | "shiny" | "holo";
    const card = await findCardByName(cardName);
    if (!card) return send("Carte introuvable");
    const result = await sellService.sellCard(user.id, card.id, quantity, variant);
    return send(`💰 Vente effectuée: ${result.quantity}x ${result.card.name} [${result.variant}] à ${result.unitPrice}/u pour ${result.credits} crédits.`);
  }

  if (interaction.commandName === "recycle" || interaction.commandName === "fragment") {
    const cardName = interaction.options.getString("nom", true);
    const quantity = interaction.options.getInteger("quantite", true);
    const variant = (interaction.options.getString("variant") ?? "any") as "normal" | "shiny" | "holo" | "any";
    const card = await findCardByName(cardName);
    if (!card) return send("Carte introuvable");
    const result = await recycleService.recycleCard(user.id, card.id, quantity, variant, {
      guildId: interaction.guildId,
      guildName: interaction.guild?.name ?? undefined,
      channelId: interaction.channelId,
      discordUserId: interaction.user.id,
      username: interaction.user.username
    });
    return send(`♻️ Fragmentation effectuée: ${result.quantity}x ${result.card.name} [${result.variant}] → ${result.credits} crédits et ${result.fragments} fragments.`);
  }

  if (interaction.commandName === "fusion") {
    const rarityName = interaction.options.getString("rarity", true);
    const reward = await fusionService.fuse(user.id, rarityName);
    return send(`✨ Fusion réussie: 5 cartes ${rarityName} détruites, tu obtiens ${reward.name} (${reward.rarity.name}).`);
  }

  if (interaction.commandName === "value") {
    const cardName = interaction.options.getString("nom", true);
    const variant = (interaction.options.getString("variant") ?? "normal") as "normal" | "shiny" | "holo";
    const card = await findCardByName(cardName);
    if (!card) return send("Carte introuvable");
    const value = await economyService.getDynamicSellPrice(card.id, variant);
    return send(
      `📈 Valeur de ${card.name} [${variant}]\n` +
      `- Rareté: ${value.rarityName}\n` +
      `- Deck: ${value.deckName}\n` +
      `- Circulation: ${value.circulationCount}\n` +
      `- Multiplicateur circulation: x${value.scarcityMultiplier.toFixed(2)}\n` +
      `- Prix actuel: ${value.unitPrice} crédits`
    );
  }

  if (interaction.commandName === "daily") {
    const result = await dailyService.claimDaily(user.id);
    return send(`🎁 Daily claimée: ${result.credits} crédits${result.grantedBooster ? " et 1 basic booster" : ""}.`);
  }

  if (interaction.commandName === "shop") {
    const cfg = await configService.getConfig();
    return send(
      `🛒 Boutique boosters\n` +
      `- Basic Booster: ${cfg.basicBoosterPrice} crédits\n` +
      `- Rare Booster: ${cfg.rareBoosterPrice} crédits\n` +
      `- Epic Booster: ${cfg.epicBoosterPrice} crédits\n` +
      `- Legendary Booster: ${cfg.legendaryBoosterPrice} crédits\n` +
      `Craft booster: ${cfg.craftBoosterFragmentCost} fragments`
    );
  }

  if (interaction.commandName === "boosters") {
    const boosters = await boosterService.getUserBoosters(user.id);
    return send(`🎁 Boosters possédés: basic ${boosters.basic}, rare ${boosters.rare}, epic ${boosters.epic}, legendary ${boosters.legendary}`);
  }

  if (interaction.commandName === "craft" && interaction.options.getSubcommand() === "booster") {
    const result = await boosterService.craftBooster(user.id, {
      guildId: interaction.guildId,
      guildName: interaction.guild?.name ?? undefined,
      channelId: interaction.channelId,
      discordUserId: interaction.user.id,
      username: interaction.user.username
    });
    return send(`🧪 Craft réussi: ${result.cost} fragments → 1 ${result.boosterType} booster.`);
  }

  if (interaction.commandName === "capture") {
    const cardName = interaction.options.getString("nom", true);
    const result = await captureService.capture(user.id, interaction.channelId, cardName, {
      guildId: interaction.guildId,
      guildName: interaction.guild?.name ?? undefined,
      discordUserId: interaction.user.id,
      username: interaction.user.username
    });

    // Animation de suspense 3-2-1
    const delay = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
    const rarityName: string = (result.card.rarity as any)?.name ?? "";
    const ballEmoji = ["Black Market", "Limited", "Exotic"].includes(rarityName) ? "🖤" :
                      ["Import", "Very Rare"].includes(rarityName) ? "🟣" : "⚪";

    await send(`${ballEmoji} **Lancer de Ball sur ${result.card.name}...**`);
    await delay(1200);
    await send(`${ballEmoji} **3...**`);
    await delay(1000);
    await send(`${ballEmoji} **2...**`);
    await delay(1000);
    await send(`${ballEmoji} **1...**`);
    await delay(1000);

    if (result.caught) {
      let msg = `✅ **${result.card.name}** [${result.variant ?? "normal"}] a été capturée ! 🎉\n+${result.gainedXp} XP · Niveau ${result.level}`;
      if (result.boostersGained > 0) msg += `\n🎁 +${result.boostersGained} booster(s) !`;
      return send(msg);
    } else {
      return send(`💨 Oh non... **${result.card.name}** s'est échappée ! La petite crapule...`);
    }
  }

  if (interaction.commandName === "inventory") {
    const deckFilterInput = interaction.options.getString("deck", true).trim().toLowerCase();
    const cardNameFilter = (interaction.options.getString("carte") ?? "").trim().toLowerCase();
    const rarityFilter = (interaction.options.getString("rarete") ?? "").trim();
    const categoryFilter = (interaction.options.getString("categorie") ?? "").trim().toLowerCase();

    const decks = await cardsService.listDecks();
    const guildConfig = interaction.guildId ? await configService.getGuildConfig(interaction.guildId) : null;
    const allowedDecks = new Set((guildConfig?.allowedDecks ?? []).map((name) => name.toLowerCase()));
    const availableDecks = allowedDecks.size > 0
      ? decks.filter((deck) => allowedDecks.has(deck.name.toLowerCase()))
      : decks;

    let selectedDeckName: string | undefined;
    if (deckFilterInput !== "tous" && deckFilterInput !== "all") {
      const exactDeck = availableDecks.find((deck) => deck.name.toLowerCase() === deckFilterInput);
      const partialDeck = availableDecks.find((deck) => deck.name.toLowerCase().includes(deckFilterInput));
      const selectedDeck = exactDeck ?? partialDeck;
      if (!selectedDeck) {
        const suggestions = ["tous", ...availableDecks.slice(0, 9).map((d) => d.name)].join(", ");
        return send(`Deck introuvable sur ce serveur. Exemples: ${suggestions}`);
      }
      selectedDeckName = selectedDeck.name;
    }

    const inventory = await inventoryService.getInventory(user.id, {
      deck: selectedDeckName,
      rarity: rarityFilter || undefined
    });
    const discordUserId = interaction.user.id;

    const filteredInventory = inventory.filter((item) => {
      if (cardNameFilter && !item.card.name.toLowerCase().includes(cardNameFilter)) return false;
      const category = String((item.card as any).category ?? "").toLowerCase();
      if (categoryFilter && !category.includes(categoryFilter)) return false;
      return true;
    });
    
    // Trier alphabétiquement par nom de carte
    const sorted = filteredInventory.sort((a, b) => a.card.name.localeCompare(b.card.name));
    
    // Cacher pour la pagination
    inventoryCache.set(discordUserId, sorted);
    
    const pageSize = 10;
    const page = 0;
    const start = page * pageSize;
    const end = start + pageSize;
    const pageItems = sorted.slice(start, end);
    const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));
    
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
    
    const embed = new EmbedBuilder()
      .setTitle("📦 Inventaire")
      .setColor(0x5865f2)
      .setFooter({ text: `Page ${page + 1}/${totalPages} (${sorted.length} cartes total)` });

    const inventoryFiltersSummary = [
      `deck: ${selectedDeckName ?? "tous"}`,
      `carte: ${cardNameFilter || "-"}`,
      `rareté: ${rarityFilter || "Toutes"}`,
      `categorie: ${categoryFilter || "-"}`
    ].join(" | ");
    embed.addFields({ name: "Filtres", value: inventoryFiltersSummary });
    
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
      commandResponse = `Inventaire affiché (${sorted.length} cartes)`;
      return interaction.editReply({ embeds: [embed], components: [buttons] });
    } else {
      commandResponse = `Inventaire affiché (${sorted.length} cartes)`;
      return interaction.editReply({ embeds: [embed] });
    }
  }

  if (interaction.commandName === "profile") {
    const energy = await spawnEnergyService.getUserSpawnCharges(user.id);
    const nextRecharge = energy.nextChargeInMs === null ? "Aucune (charges pleines)" : formatDuration(energy.nextChargeInMs);
    const boosters = await boosterService.getUserBoosters(user.id);
    const inventoryValue = await economyService.getInventoryEstimatedValue(user.id);
    return send(
      `Niveau ${user.level} | XP ${user.xp}` +
      `\nCrédits : ${user.credits}` +
      `\nFragments : ${user.fragments}` +
      `\nValeur inventaire estimée : ${inventoryValue} crédits` +
      `\nBoosters : basic ${boosters.basic}, rare ${boosters.rare}, epic ${boosters.epic}, legendary ${boosters.legendary}` +
      `\nSpawn disponibles : ${energy.charges}/${energy.maxCharges}` +
      `\nProchaine recharge : ${nextRecharge}`
    );
  }

  if (interaction.commandName === "cardinfo") {
    const name = interaction.options.getString("nom", true).toLowerCase();
    const variantFilter = (interaction.options.getString("variant") ?? "all") as "all" | "normal" | "shiny" | "holo";

    // Only allow cards the user owns
    const inventory = await inventoryService.getInventory(user.id);
    const matches = inventory.filter((i) => i.card.name.toLowerCase() === name);
    if (matches.length === 0) {
      return send("Tu ne possèdes pas cette carte (ou elle n'existe pas).");
    }

    const selectedItem = variantFilter === "all"
      ? matches[0]
      : matches.find((i) => i.variant === variantFilter);

    if (!selectedItem) {
      return send(`Tu ne possèdes pas cette carte en variante ${variantFilter}.`);
    }

    const variantTotals = {
      normal: matches.filter((m) => m.variant === "normal").reduce((sum, m) => sum + m.quantity, 0),
      shiny: matches.filter((m) => m.variant === "shiny").reduce((sum, m) => sum + m.quantity, 0),
      holo: matches.filter((m) => m.variant === "holo").reduce((sum, m) => sum + m.quantity, 0)
    };
    const totalOwned = variantTotals.normal + variantTotals.shiny + variantTotals.holo;

    const card = selectedItem.card as any;
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
      .setDescription(
        `**Rareté :** ${rarityName}\n` +
        `**Deck :** ${card.deck?.name ?? "?"}\n` +
        `**Possession :** total ${totalOwned} (N:${variantTotals.normal} S:${variantTotals.shiny} H:${variantTotals.holo})`
      )
      .setColor(color);

    if (variantFilter === "all") {
      const [normalValue, shinyValue, holoValue] = await Promise.all([
        economyService.getDynamicSellPrice(card.id, "normal"),
        economyService.getDynamicSellPrice(card.id, "shiny"),
        economyService.getDynamicSellPrice(card.id, "holo")
      ]);
      embed.addFields({
        name: "Valeur dynamique",
        value:
          `normal: ${normalValue.unitPrice} crédits\n` +
          `shiny: ${shinyValue.unitPrice} crédits\n` +
          `holo: ${holoValue.unitPrice} crédits`
      });
    } else {
      const dynamic = await economyService.getDynamicSellPrice(card.id, variantFilter);
      embed.addFields({ name: `Valeur dynamique (${variantFilter})`, value: `${dynamic.unitPrice} crédits` });
    }

    if (card.description) embed.addFields({ name: "Description", value: card.description });
    if (card.imageUrl) embed.setImage(card.imageUrl);

    await interaction.editReply({ embeds: [embed] });
    return;
  }

  if (interaction.commandName === "deck") {
    const deckQuery = interaction.options.getString("nom", true).trim().toLowerCase();
    const cardNameFilter = (interaction.options.getString("carte") ?? "").trim().toLowerCase();
    const rarityFilter = (interaction.options.getString("rarete") ?? "all").trim();
    const ownedFilter = (interaction.options.getString("possede") ?? "all") as DeckOwnedFilter;
    const categoryFilter = (interaction.options.getString("categorie") ?? "").trim().toLowerCase();

    const decks = await cardsService.listDecks();
    const guildConfig = interaction.guildId ? await configService.getGuildConfig(interaction.guildId) : null;
    const allowedDecks = new Set((guildConfig?.allowedDecks ?? []).map((name) => name.toLowerCase()));
    const availableDecks = allowedDecks.size > 0
      ? decks.filter((deck) => allowedDecks.has(deck.name.toLowerCase()))
      : decks;
    const exact = availableDecks.find((deck) => deck.name.toLowerCase() === deckQuery);
    const partial = availableDecks.find((deck) => deck.name.toLowerCase().includes(deckQuery));
    const selectedDeck = exact ?? partial;

    if (!selectedDeck) {
      const suggestions = availableDecks.slice(0, 10).map((d) => d.name).join(", ");
      return send(`Deck introuvable. Exemples: ${suggestions}`);
    }

    const deckCards = await prisma.card.findMany({
      where: { deckId: selectedDeck.id, deletedAt: null },
      include: { rarity: true, deck: true },
      orderBy: { name: "asc" }
    });

    if (deckCards.length === 0) {
      return send(`Le deck ${selectedDeck.name} ne contient aucune carte.`);
    }

    const inventoryRows = await prisma.inventoryItem.findMany({
      where: {
        userId: user.id,
        cardId: { in: deckCards.map((card) => card.id) }
      }
    });

    const byCard = new Map<string, { normal: number; shiny: number; holo: number }>();
    for (const row of inventoryRows) {
      const current = byCard.get(row.cardId) ?? { normal: 0, shiny: 0, holo: 0 };
      if (row.variant === "normal") current.normal += row.quantity;
      if (row.variant === "shiny") current.shiny += row.quantity;
      if (row.variant === "holo") current.holo += row.quantity;
      byCard.set(row.cardId, current);
    }

    const allRows: DeckBrowseRow[] = deckCards.map((card) => {
      const quantities = byCard.get(card.id) ?? { normal: 0, shiny: 0, holo: 0 };
      return {
        card,
        normalQty: quantities.normal,
        shinyQty: quantities.shiny,
        holoQty: quantities.holo,
        totalQty: quantities.normal + quantities.shiny + quantities.holo
      };
    });

    const ownedUnique = allRows.filter((row) => row.totalQty > 0).length;
    const totalCards = allRows.length;

    const filteredRows = allRows.filter((row) => {
      if (cardNameFilter && !row.card.name.toLowerCase().includes(cardNameFilter)) return false;
      if (rarityFilter !== "all" && ((row.card as any).rarity?.name ?? "") !== rarityFilter) return false;
      if (ownedFilter === "owned" && row.totalQty <= 0) return false;
      if (ownedFilter === "missing" && row.totalQty > 0) return false;
      const cardCategory = String((row.card as any).category ?? "").toLowerCase();
      if (categoryFilter && !cardCategory.includes(categoryFilter)) return false;
      return true;
    });

    const cacheKey = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
    deckBrowseCache.set(cacheKey, {
      deckName: selectedDeck.name,
      filters: {
        cardName: cardNameFilter,
        rarity: rarityFilter,
        owned: ownedFilter,
        category: categoryFilter
      },
      ownedUnique,
      totalCards,
      rows: filteredRows
    });

    const payload = buildDeckEmbed(interaction.user.id, cacheKey, 0, deckBrowseCache.get(cacheKey)!);
    if (payload.components.length > 0) {
      commandResponse = `Deck affiché (${filteredRows.length} cartes)`;
      return interaction.editReply({ embeds: [payload.embed], components: payload.components });
    }
    commandResponse = `Deck affiché (${filteredRows.length} cartes)`;
    return interaction.editReply({ embeds: [payload.embed] });
  }

  if (interaction.commandName === "leaderboard") {
    const users = await usersService.listUsers();
    const top = users
      .sort((a, b) => b.level - a.level || b.xp - a.xp)
      .slice(0, 10)
      .map((u, i) => `${i + 1}. ${u.username} - Lv.${u.level} (${u.xp} XP)`)
      .join("\n");
    return send(top || "Aucun joueur");
  }

  if (interaction.commandName === "booster" && interaction.options.getSubcommand() === "buy") {
    const type = interaction.options.getString("type", true) as "basic" | "rare" | "epic" | "legendary";
    const result = await boosterService.buyBooster(user.id, type, {
      guildId: interaction.guildId,
      guildName: interaction.guild?.name ?? undefined,
      channelId: interaction.channelId,
      discordUserId: interaction.user.id,
      username: interaction.user.username
    });
    return send(`🛍️ ${type} booster acheté pour ${result.price} crédits.`);
  }

  if (interaction.commandName === "booster" && interaction.options.getSubcommand() === "open") {
    const type = interaction.options.getString("type", true) as "basic" | "rare" | "epic" | "legendary";
    const guildId = interaction.guildId ?? undefined;
    const opened = await boosterService.openBooster(user.id, type, guildId, {
      guildId: interaction.guildId,
      guildName: interaction.guild?.name ?? undefined,
      channelId: interaction.channelId,
      discordUserId: interaction.user.id,
      username: interaction.user.username
    });
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
      ? `\n🔥 JACKPOT ! Ton ${type} booster s’est transformé en ${opened.upgradedType} booster !`
      : "";
    commandResponse = `${opened.upgradedType} booster ouvert (${cards.length} cartes)`;
    await interaction.editReply(`🎁 ${opened.upgradedType} booster ouvert ! **${cards.length} cartes** obtenues :${jackpotLine}`);

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
    return;
  }

  if (interaction.commandName === "trade") {
    const group = interaction.options.getSubcommandGroup(false);
    const sub = interaction.options.getSubcommand();

    if (sub === "user") {
      const target = interaction.options.getUser("user", true);
      if (target.id === interaction.user.id) {
        return send("Tu ne peux pas trader avec toi-même.");
      }

      const targetUser = await usersService.getOrCreateDiscordUser(target.id, target.username, target.displayAvatarURL());
      const existing = await prisma.trade.findFirst({
        where: {
          status: "pending",
          expiresAt: { gt: new Date() },
          OR: [
            { user1Id: user.id, user2Id: targetUser.id },
            { user1Id: targetUser.id, user2Id: user.id }
          ]
        },
        orderBy: { createdAt: "desc" }
      });

      const trade = existing ?? await tradeService.startTrade(user.id, targetUser.id, {
        guildId: interaction.guildId,
        guildName: interaction.guild?.name ?? undefined,
        channelId: interaction.channelId,
        discordUserId: interaction.user.id,
        username: interaction.user.username
      });
      return send(`🤝 Demande de trade envoyée à <@${target.id}>.\nIl doit faire **/trade accept** pour ouvrir la phase de trade.`);
    }

    if (sub === "accept") {
      const trade = await resolveIncomingTradeForUser(user.id);
      if (!trade) {
        return send("Aucune demande de trade en attente.");
      }

      const alreadyAccepted = await isTradeAccepted(trade.id);
      if (!alreadyAccepted) {
        await prisma.adminLog.create({
          data: {
            action: "TRADE_ACCEPTED",
            target: trade.id,
            metadata: { acceptedBy: user.id }
          }
        });
        await logsService.logGuildEvent({
          guildId: interaction.guildId,
          guildName: interaction.guild?.name ?? undefined,
          channelId: interaction.channelId,
          userId: user.id,
          discordUserId: interaction.user.id,
          username: interaction.user.username,
          category: "trade",
          action: "trade_accepted",
          status: "pending",
          summary: `${interaction.user.username} accepte le trade ${trade.id}`,
          details: { tradeId: trade.id }
        });
      }

      return send("✅ Trade accepté. Vous pouvez maintenant faire /trade add card|booster, puis /trade confirm des deux côtés.");
    }

    if (group === "add" && sub === "card") {
      const trade = await resolveActiveTradeForUser(user.id);
      if (!trade) {
        return send("Aucun trade actif. Lance d'abord /trade user @joueur.");
      }
      if (!(await isTradeAccepted(trade.id))) {
        return send("Le trade n'est pas encore accepté. Le joueur invité doit faire /trade accept.");
      }

      const cardName = interaction.options.getString("carte", true);
      const qty = interaction.options.getInteger("quantity") ?? 1;
      const variant = (interaction.options.getString("variant") ?? "normal") as "normal" | "shiny" | "holo";
      const card = await findCardByName(cardName);
      if (!card) {
        return send("Carte introuvable");
      }
      await tradeService.addItem(trade.id, user.id, card.id, qty, variant, {
        guildId: interaction.guildId,
        guildName: interaction.guild?.name ?? undefined,
        channelId: interaction.channelId,
        discordUserId: interaction.user.id,
        username: interaction.user.username
      });
      return send("Carte ajoutee au trade");
    }

    if (group === "add" && sub === "booster") {
      const trade = await resolveActiveTradeForUser(user.id);
      if (!trade) {
        return send("Aucun trade actif. Lance d'abord /trade user @joueur.");
      }
      if (!(await isTradeAccepted(trade.id))) {
        return send("Le trade n'est pas encore accepté. Le joueur invité doit faire /trade accept.");
      }

      const qty = interaction.options.getInteger("quantity") ?? 1;
      const type = interaction.options.getString("type", true) as "basic" | "rare" | "epic" | "legendary";
      await tradeService.addBooster(trade.id, user.id, type, qty, {
        guildId: interaction.guildId,
        guildName: interaction.guild?.name ?? undefined,
        channelId: interaction.channelId,
        discordUserId: interaction.user.id,
        username: interaction.user.username
      });
      return send("Booster ajouté au trade");
    }

    if (group === "remove" && sub === "card") {
      const trade = await resolveActiveTradeForUser(user.id);
      if (!trade) {
        return send("Aucun trade actif.");
      }
      if (!(await isTradeAccepted(trade.id))) {
        return send("Le trade n'est pas encore accepté. Le joueur invité doit faire /trade accept.");
      }

      const cardName = interaction.options.getString("carte", true);
      const qty = interaction.options.getInteger("quantity") ?? 1;
      const variant = (interaction.options.getString("variant") ?? "normal") as "normal" | "shiny" | "holo";
      const card = await findCardByName(cardName);
      if (!card) {
        return send("Carte introuvable");
      }
      await tradeService.removeItem(trade.id, user.id, card.id, qty, variant, {
        guildId: interaction.guildId,
        guildName: interaction.guild?.name ?? undefined,
        channelId: interaction.channelId,
        discordUserId: interaction.user.id,
        username: interaction.user.username
      });
      return send("Carte retiree du trade");
    }

    if (group === "remove" && sub === "booster") {
      const trade = await resolveActiveTradeForUser(user.id);
      if (!trade) {
        return send("Aucun trade actif.");
      }
      if (!(await isTradeAccepted(trade.id))) {
        return send("Le trade n'est pas encore accepté. Le joueur invité doit faire /trade accept.");
      }

      const qty = interaction.options.getInteger("quantity") ?? 1;
      const type = interaction.options.getString("type", true) as "basic" | "rare" | "epic" | "legendary";
      await tradeService.removeBooster(trade.id, user.id, type, qty, {
        guildId: interaction.guildId,
        guildName: interaction.guild?.name ?? undefined,
        channelId: interaction.channelId,
        discordUserId: interaction.user.id,
        username: interaction.user.username
      });
      return send("Booster retiré du trade");
    }

    if (sub === "confirm") {
      const activeTrade = await resolveActiveTradeForUser(user.id);
      if (!activeTrade) {
        return send("Aucun trade actif à confirmer.");
      }
      if (!(await isTradeAccepted(activeTrade.id))) {
        return send("Le trade n'est pas encore accepté. Le joueur invité doit faire /trade accept.");
      }

      const trade = await tradeService.confirmTrade(activeTrade.id, user.id, {
        guildId: interaction.guildId,
        guildName: interaction.guild?.name ?? undefined,
        channelId: interaction.channelId,
        discordUserId: interaction.user.id,
        username: interaction.user.username
      });
      if (!trade) {
        return send("Trade introuvable");
      }
      if (trade.status === "completed") {
        return send("✅ Trade complété avec succès.");
      }
      return send("✅ Confirmation prise en compte. En attente de l'autre joueur.");
    }

    if (sub === "cancel") {
      const activeTrade = await resolveActiveTradeForUser(user.id);
      if (!activeTrade) {
        return send("Aucun trade actif à annuler.");
      }
      await tradeService.cancelTrade(activeTrade.id, user.id, {
        guildId: interaction.guildId,
        guildName: interaction.guild?.name ?? undefined,
        channelId: interaction.channelId,
        discordUserId: interaction.user.id,
        username: interaction.user.username
      });
      return send("Trade annule");
    }
  }

  if (interaction.commandName === "admin") {
    if (!user.isAdmin) {
      console.warn(`[bot:security] Admin command denied: user ${user.id} is not app-admin`);
      return send("Commande reservee aux administrateurs.");
    }

    if (!ADMIN_ROLE_ID) {
      console.warn("[bot:security] DISCORD_ADMIN_ROLE_ID is missing, admin command denied");
      return send("Configuration admin manquante: DISCORD_ADMIN_ROLE_ID non défini.");
    }

    if (!hasDiscordAdminRole(interaction)) {
      console.warn(`[bot:security] Admin command denied: user ${user.id} missing Discord role ${ADMIN_ROLE_ID}`);
      return send("Accès refusé: rôle admin Discord requis.");
    }

    const subcommandGroup = interaction.options.getSubcommandGroup(false);
    if (subcommandGroup === "spawn") {
      const subcommand = interaction.options.getSubcommand(true);
      const spawnChannelId = await resolveGuildSpawnChannelId(interaction.guildId);

      if (subcommand === "force") {
        const cardName = interaction.options.getString("card_name");
        let cardId: string | undefined;

        if (cardName) {
          const cards = await cardsService.getCards();
          const selected = cards.find((card) => card.name.toLowerCase() === cardName.toLowerCase());
          if (!selected) {
            return send("Carte introuvable pour spawn force.");
          }
          cardId = selected.id;
        }

        try {
          const cards = await spawnService.createAdminSpawn(spawnChannelId, user.id, cardId, interaction.guildId ?? undefined, interaction.guild?.name ?? undefined);
          await sendSpawnCards(interaction, spawnChannelId, cards, `Spawn admin force par <@${interaction.user.id}>.`);
          return send(`Spawn admin effectue dans <#${spawnChannelId}>.`);
        } catch (error) {
          if (error instanceof AppError) {
            return send(error.message);
          }
          throw error;
        }
      }

      if (subcommand === "cancel") {
        const count = await spawnService.cancelActiveSpawn(spawnChannelId);
        return send(count > 0 ? `Spawn actif annule dans <#${spawnChannelId}>.` : "Aucun spawn actif a annuler.");
      }

      if (subcommand === "config") {
        const autoEnabled = interaction.options.getBoolean("auto_enabled");
        const autoInterval = interaction.options.getInteger("auto_interval_minutes");
        const manualEnabled = interaction.options.getBoolean("manual_enabled");
        const manualMaxCharges = interaction.options.getInteger("manual_max_charges");
        const manualRegenHours = interaction.options.getInteger("manual_regen_hours");

        const updates: Record<string, unknown> = {};
        if (autoEnabled !== null) updates.autoSpawnEnabled = autoEnabled;
        if (autoInterval !== null) updates.autoSpawnIntervalMinutes = autoInterval;
        if (manualEnabled !== null) updates.manualSpawnEnabled = manualEnabled;
        if (manualMaxCharges !== null) updates.manualSpawnMaxCharges = manualMaxCharges;
        if (manualRegenHours !== null) updates.manualSpawnRegenHours = manualRegenHours;

        const cfg = Object.keys(updates).length > 0
          ? await configService.patchConfig(updates as {
              autoSpawnEnabled?: boolean;
              autoSpawnIntervalMinutes?: number;
              manualSpawnEnabled?: boolean;
              manualSpawnMaxCharges?: number;
              manualSpawnRegenHours?: number;
            })
          : await configService.getConfig();

        return send(
          `Config spawn:\n- autoSpawnEnabled: ${cfg.autoSpawnEnabled ? "ON" : "OFF"}` +
          `\n- autoSpawnIntervalMinutes: ${cfg.autoSpawnIntervalMinutes}` +
          `\n- manualSpawnEnabled: ${cfg.manualSpawnEnabled ? "ON" : "OFF"}` +
          `\n- manualSpawnMaxCharges: ${cfg.manualSpawnMaxCharges}` +
          `\n- manualSpawnRegenHours: ${cfg.manualSpawnRegenHours}`
        );
      }
    }

    if (interaction.options.getSubcommand() === "import") {
      const source = interaction.options.getString("source", true);
      const limit = interaction.options.getInteger("limit") || (source === "pokemon" ? 151 : 100);

      if (!ADMIN_IMPORT_SOURCES.has(source)) {
        console.warn(`[bot:security] Admin import denied: invalid source '${source}' by user ${user.id}`);
        return send("Source d'import non autorisée.");
      }

      await interaction.deferReply();

      try {
        const apiBaseUrl = process.env.INTERNAL_API_URL ?? process.env.API_BASE_URL ?? "http://api:4000";
        const apiUrl = `${apiBaseUrl.replace(/\/$/, "")}/import/${source}`;
        const defaultLimit = source === "pokemon" ? 151 : 100;
        const body = source === "pop/all"
          ? { tmdbLimit: limit || 150, animeLimit: limit || 100, gameLimit: limit || 100 }
          : { limit: limit || defaultLimit, pages: 3 };
        const response = await axios.post(apiUrl, body, { timeout: 30_000 });

        const data = response.data;
        let msg = `✅ Import réussi!\n${data.message ?? ""}`;
        if (data.tmdb !== undefined) {
          msg += `\n  🎬 Films/séries : ${data.tmdb}\n  🎌 Anime/manga : ${data.anime}\n  🎮 Jeux vidéo : ${data.games}\n  📋 Manuel : ${data.manual}`;
        }
        return send(msg);
      } catch (error) {
        const details = axios.isAxiosError(error)
          ? `${error.response?.status ?? "network"}`
          : (error instanceof Error ? error.message : String(error));
        console.warn(`[bot:security] Admin import failed for source ${source} by user ${user.id}: ${details}`);
        return send("❌ Erreur lors de l'import.");
      }
    }
  }
  } catch (error) {
    commandStatus = "error";
    commandError = error instanceof Error ? error.message : String(error);
    throw error;
  } finally {
    await logsService.logGuildEvent({
      guildId: interaction.guildId,
      guildName: interaction.guild?.name ?? undefined,
      channelId: interaction.channelId,
      userId: user?.id,
      discordUserId: interaction.user.id,
      username: interaction.user.username,
      category: "command",
      action: interaction.commandName,
      status: commandStatus,
      summary: `/${interaction.commandName} par ${interaction.user.username}`,
      details: {
        options: commandOptions,
        response: commandResponse ?? null,
        error: commandError ?? null
      }
    });
  }
}

export async function handleAutocompleteInteraction(interaction: AutocompleteInteraction) {
  if (interaction.commandName !== "deck" && interaction.commandName !== "inventory") {
    return interaction.respond([]);
  }

  const focused = interaction.options.getFocused(true);
  if (
    (interaction.commandName === "deck" && focused.name !== "nom") ||
    (interaction.commandName === "inventory" && focused.name !== "deck" && focused.name !== "carte" && focused.name !== "categorie")
  ) {
    return interaction.respond([]);
  }

  const decks = await cardsService.listDecks();
  const guildConfig = interaction.guildId ? await configService.getGuildConfig(interaction.guildId) : null;
  const allowedDecks = new Set((guildConfig?.allowedDecks ?? []).map((name) => name.toLowerCase()));

  const available = allowedDecks.size > 0
    ? decks.filter((deck) => allowedDecks.has(deck.name.toLowerCase()))
    : decks;

  if (interaction.commandName === "inventory" && (focused.name === "carte" || focused.name === "categorie")) {
    const deckFilterInput = String(interaction.options.getString("deck") ?? "").trim().toLowerCase();
    const rarityFilter = String(interaction.options.getString("rarete") ?? "").trim();
    let selectedDeckName: string | undefined;

    if (deckFilterInput && deckFilterInput !== "tous" && deckFilterInput !== "all") {
      const exactDeck = available.find((deck) => deck.name.toLowerCase() === deckFilterInput);
      const partialDeck = available.find((deck) => deck.name.toLowerCase().includes(deckFilterInput));
      selectedDeckName = (exactDeck ?? partialDeck)?.name;
    }

    const query = String(focused.value ?? "").trim().toLowerCase();
    const inventory = await inventoryService.getInventory(interaction.user.id, {
      deck: selectedDeckName,
      rarity: rarityFilter || undefined
    });

    const suggestions = new Map<string, string>();
    for (const item of inventory) {
      const value = focused.name === "carte"
        ? item.card.name.trim()
        : String((item.card as any).category ?? "").trim();
      if (value) suggestions.set(value.toLowerCase(), value);
    }

    const rankedFilters = Array.from(suggestions.values())
      .map((value) => ({
        value,
        score: value.toLowerCase() === query
          ? 0
          : value.toLowerCase().startsWith(query)
            ? 1
            : value.toLowerCase().includes(query)
              ? 2
              : 3
      }))
      .filter((entry) => query.length === 0 || entry.score < 3)
      .sort((a, b) => a.score - b.score || a.value.localeCompare(b.value))
      .slice(0, 25)
      .map((entry) => ({ name: entry.value, value: entry.value }));

    return interaction.respond(rankedFilters);
  }

  const query = String(focused.value ?? "").trim().toLowerCase();

  if (interaction.commandName === "inventory" && focused.name === "deck") {
    const allEntry = { name: "tous", value: "tous" };
    const rankedDecks = available
      .map((deck) => ({
        deck,
        score: deck.name.toLowerCase() === query
          ? 0
          : deck.name.toLowerCase().startsWith(query)
            ? 1
            : deck.name.toLowerCase().includes(query)
              ? 2
              : 3
      }))
      .filter((entry) => query.length === 0 || entry.score < 3)
      .sort((a, b) => a.score - b.score || a.deck.name.localeCompare(b.deck.name))
      .slice(0, 24)
      .map((entry) => ({ name: entry.deck.name, value: entry.deck.name }));

    const includeAll = query.length === 0 || "tous".includes(query) || "all".includes(query);
    return interaction.respond(includeAll ? [allEntry, ...rankedDecks] : rankedDecks);
  }

  const ranked = available
    .map((deck) => ({
      deck,
      score: deck.name.toLowerCase() === query
        ? 0
        : deck.name.toLowerCase().startsWith(query)
          ? 1
          : deck.name.toLowerCase().includes(query)
            ? 2
            : 3
    }))
    .filter((entry) => query.length === 0 || entry.score < 3)
    .sort((a, b) => a.score - b.score || a.deck.name.localeCompare(b.deck.name))
    .slice(0, 25)
    .map((entry) => ({ name: entry.deck.name, value: entry.deck.name }));

  return interaction.respond(ranked);
}

export async function handleButtonInteraction(interaction: ButtonInteraction) {
  const customId = interaction.customId;
  
  if (customId.startsWith("inv_")) {
    try {
      const parts = customId.split("_");
      console.log(`[Button] Custom ID: ${customId}, Parts: ${JSON.stringify(parts)}`);
      
      if (parts.length < 4) {
        console.error(`[Button] Invalid parts length: ${parts.length}`);
        return interaction.reply({ content: "Erreur: bouton invalide", ephemeral: true });
      }
      
      const direction = parts[1];
      const userId = parts[2];
      const currentPage = parseInt(parts[3], 10);
      
      console.log(`[Button] Direction: ${direction}, UserId: ${userId}, CurrentPage: ${currentPage}`);
      
      if (interaction.user.id !== userId) {
        return interaction.reply({ content: "Tu ne peux pas utiliser ce bouton", ephemeral: true });
      }
      
      const cached = inventoryCache.get(userId);
      if (!cached || cached.length === 0) {
        console.error(`[Button] Cache miss or empty for user ${userId}`);
        return interaction.reply({ content: "Cache expiré, refais /inventory", ephemeral: true });
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
        return interaction.reply({ content: "Vous êtes déjà à cette page", ephemeral: true });
      }
      
      const start = nextPage * pageSize;
      const end = start + pageSize;
      const pageItems = cached.slice(start, end);
      
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
      return interaction.update({ embeds: [embed], components: [buttons] });
    } catch (error) {
      console.error("[Button] Error:", error);
      return interaction.reply({ content: "Erreur lors du changement de page", ephemeral: true });
    }
  }

  if (customId.startsWith("deck_")) {
    try {
      const parts = customId.split("_");
      if (parts.length < 5) {
        return interaction.reply({ content: "Erreur: bouton deck invalide", ephemeral: true });
      }

      const direction = parts[1];
      const userId = parts[2];
      const currentPage = parseInt(parts[3], 10);
      const cacheKey = parts[4];

      if (interaction.user.id !== userId) {
        return interaction.reply({ content: "Tu ne peux pas utiliser ce bouton", ephemeral: true });
      }

      const entry = deckBrowseCache.get(cacheKey);
      if (!entry) {
        return interaction.reply({ content: "Cache expiré, refais /deck", ephemeral: true });
      }

      const pageSize = 10;
      const totalPages = Math.max(1, Math.ceil(entry.rows.length / pageSize));
      let nextPage = currentPage;
      if (direction === "next" && currentPage < totalPages - 1) {
        nextPage = currentPage + 1;
      } else if (direction === "prev" && currentPage > 0) {
        nextPage = currentPage - 1;
      } else {
        return interaction.reply({ content: "Vous êtes déjà à cette page", ephemeral: true });
      }

      const payload = buildDeckEmbed(userId, cacheKey, nextPage, entry);
      return interaction.update({ embeds: [payload.embed], components: payload.components });
    } catch (error) {
      console.error("[Button deck] Error:", error);
      return interaction.reply({ content: "Erreur lors du changement de page", ephemeral: true });
    }
  }
}
