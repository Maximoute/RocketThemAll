import {
  SlashCommandBuilder,
  REST,
  Routes,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  type ChatInputCommandInteraction,
  type ButtonInteraction
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

// Cache pour la pagination de l'inventaire (userId -> items triés)
const inventoryCache = new Map<string, Array<{ card: any; quantity: number }>>();
const ADMIN_ROLE_ID = process.env.DISCORD_ADMIN_ROLE_ID;

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
    .addIntegerOption((o) => o.setName("quantite").setDescription("Quantité").setRequired(true).setMinValue(1)),
  new SlashCommandBuilder().setName("fragment").setDescription("Fragmenter une carte contre crédits + fragments")
    .addStringOption((o) => o.setName("nom").setDescription("Nom de la carte").setRequired(true))
    .addIntegerOption((o) => o.setName("quantite").setDescription("Quantité").setRequired(true).setMinValue(1)),
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
  new SlashCommandBuilder().setName("inventory").setDescription("Voir inventaire"),
  new SlashCommandBuilder().setName("profile").setDescription("Voir profil"),
  new SlashCommandBuilder().setName("cardinfo").setDescription("Voir info carte").addStringOption((o) => o.setName("nom").setDescription("Nom de la carte").setRequired(true)),
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
  const send = async (content: string) => {
    if (interaction.deferred || interaction.replied) {
      return interaction.editReply(content);
    }
    return interaction.reply(content);
  };

  const discordId = interaction.user.id;
  const user = await usersService.getOrCreateDiscordUser(discordId, interaction.user.username, interaction.user.displayAvatarURL());

  if (interaction.commandName === "spawn") {
    try {
      const spawnChannelId = await resolveGuildSpawnChannelId(interaction.guildId);
      const result = await spawnService.createManualSpawn(user.id, spawnChannelId, {
        spawnType: "manual"
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
    const card = await findCardByName(cardName);
    if (!card) return send("Carte introuvable");
    const result = await recycleService.recycleCard(user.id, card.id, quantity);
    return send(`♻️ Fragmentation effectuée: ${result.quantity}x ${result.card.name} → ${result.credits} crédits et ${result.fragments} fragments.`);
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
    const result = await boosterService.craftBooster(user.id);
    return send(`🧪 Craft réussi: ${result.cost} fragments → 1 ${result.boosterType} booster.`);
  }

  if (interaction.commandName === "capture") {
    const cardName = interaction.options.getString("nom", true);
    const result = await captureService.capture(user.id, interaction.channelId, cardName);

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
    const inventory = await inventoryService.getInventory(user.id);
    const discordUserId = interaction.user.id;
    
    // Trier alphabétiquement par nom de carte
    const sorted = inventory.sort((a, b) => a.card.name.localeCompare(b.card.name));
    
    // Cacher pour la pagination
    inventoryCache.set(discordUserId, sorted);
    
    const pageSize = 10;
    const page = 0;
    const start = page * pageSize;
    const end = start + pageSize;
    const pageItems = sorted.slice(start, end);
    const totalPages = Math.ceil(sorted.length / pageSize);
    
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
      return interaction.editReply({ embeds: [embed], components: [buttons] });
    } else {
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

    // Only allow cards the user owns
    const inventory = await inventoryService.getInventory(user.id);
    const item = inventory.find((i) => i.card.name.toLowerCase() === name);
    if (!item) {
      return send("Tu ne possèdes pas cette carte (ou elle n'existe pas).");
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
    return;
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
    const result = await boosterService.buyBooster(user.id, type);
    return send(`🛍️ ${type} booster acheté pour ${result.price} crédits.`);
  }

  if (interaction.commandName === "booster" && interaction.options.getSubcommand() === "open") {
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
      ? `\n🔥 JACKPOT ! Ton ${type} booster s’est transformé en ${opened.upgradedType} booster !`
      : "";
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

      const trade = existing ?? await tradeService.startTrade(user.id, targetUser.id);
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
      await tradeService.addItem(trade.id, user.id, card.id, qty, variant);
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
      await tradeService.addBooster(trade.id, user.id, type, qty);
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
      await tradeService.removeItem(trade.id, user.id, card.id, qty, variant);
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
      await tradeService.removeBooster(trade.id, user.id, type, qty);
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

      const trade = await tradeService.confirmTrade(activeTrade.id, user.id);
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
      await tradeService.cancelTrade(activeTrade.id, user.id);
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
          const cards = await spawnService.createAdminSpawn(spawnChannelId, user.id, cardId);
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

      await interaction.deferReply();

      try {
        const apiUrl = `http://api:4000/import/${source}`;
        const defaultLimit = source === "pokemon" ? 151 : 100;
        const body = source === "pop/all"
          ? { tmdbLimit: limit || 150, animeLimit: limit || 100, gameLimit: limit || 100 }
          : { limit: limit || defaultLimit, pages: 3 };
        const response = await axios.post(apiUrl, body);

        const data = response.data;
        let msg = `✅ Import réussi!\n${data.message ?? ""}`;
        if (data.tmdb !== undefined) {
          msg += `\n  🎬 Films/séries : ${data.tmdb}\n  🎌 Anime/manga : ${data.anime}\n  🎮 Jeux vidéo : ${data.games}\n  📋 Manuel : ${data.manual}`;
        }
        return send(msg);
      } catch (error) {
        return send(`❌ Erreur lors de l'import: ${error instanceof Error ? error.message : "Erreur inconnue"}`);
      }
    }
  }
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
}
