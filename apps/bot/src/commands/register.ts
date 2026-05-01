import {
  SlashCommandBuilder,
  REST,
  Routes,
  EmbedBuilder,
  type ChatInputCommandInteraction
} from "discord.js";
import axios from "axios";
import {
  BoosterService,
  CaptureService,
  InventoryService,
  TradeService,
  UsersService,
  CardsService
} from "@rta/services";

const captureService = new CaptureService();
const inventoryService = new InventoryService();
const boosterService = new BoosterService();
const tradeService = new TradeService();
const usersService = new UsersService();
const cardsService = new CardsService();

export const commandBuilders = [
  new SlashCommandBuilder().setName("capture").setDescription("Capture une carte").addStringOption((o) => o.setName("nom").setDescription("Nom de la carte").setRequired(true)),
  new SlashCommandBuilder().setName("inventory").setDescription("Voir inventaire"),
  new SlashCommandBuilder().setName("profile").setDescription("Voir profil"),
  new SlashCommandBuilder().setName("cardinfo").setDescription("Voir info carte").addStringOption((o) => o.setName("nom").setDescription("Nom de la carte").setRequired(true)),
  new SlashCommandBuilder().setName("leaderboard").setDescription("Classement"),
  new SlashCommandBuilder().setName("booster").setDescription("Gestion booster").addSubcommand((s) => s.setName("open").setDescription("Ouvrir un booster")),
  new SlashCommandBuilder().setName("trade").setDescription("Gestion trade")
    .addSubcommand((s) => s.setName("start").setDescription("Demarrer trade").addUserOption((o) => o.setName("user").setDescription("Utilisateur").setRequired(true)))
    .addSubcommand((s) => s.setName("add").setDescription("Ajouter carte").addStringOption((o) => o.setName("trade_id").setDescription("Trade id").setRequired(true)).addStringOption((o) => o.setName("carte").setDescription("Carte").setRequired(true)).addIntegerOption((o) => o.setName("quantity").setDescription("Quantite")))
    .addSubcommand((s) => s.setName("remove").setDescription("Retirer carte").addStringOption((o) => o.setName("trade_id").setDescription("Trade id").setRequired(true)).addStringOption((o) => o.setName("carte").setDescription("Carte").setRequired(true)).addIntegerOption((o) => o.setName("quantity").setDescription("Quantite")))
    .addSubcommand((s) => s.setName("confirm").setDescription("Confirmer trade").addStringOption((o) => o.setName("trade_id").setDescription("Trade id").setRequired(true)))
    .addSubcommand((s) => s.setName("cancel").setDescription("Annuler trade").addStringOption((o) => o.setName("trade_id").setDescription("Trade id").setRequired(true))),
  new SlashCommandBuilder().setName("admin").setDescription("Commandes admin")
    .addSubcommand((s) => s.setName("import").setDescription("Importer cartes").addStringOption((o) => o.setName("source").setDescription("Source").addChoices(
        { name: "pokemon", value: "pokemon" },
        { name: "pop/movies — Films & séries (TMDb)", value: "pop/movies" },
        { name: "pop/anime — Anime & manga (Jikan)", value: "pop/anime" },
        { name: "pop/games — Jeux vidéo (RAWG)", value: "pop/games" },
        { name: "pop/manual — Cartes manuelles (JSON)", value: "pop/manual" },
        { name: "pop/all — Import complet pop", value: "pop/all" }
      ).setRequired(true)).addIntegerOption((o) => o.setName("limit").setDescription("Limite")))
].map((cmd) => cmd.toJSON());

export async function registerCommands() {
  const token = process.env.DISCORD_TOKEN;
  const clientId = process.env.DISCORD_CLIENT_ID;
  const guildId = process.env.DISCORD_GUILD_ID;

  if (!token || !clientId || !guildId) {
    throw new Error("Missing Discord env variables");
  }

  const rest = new REST({ version: "10" }).setToken(token);
  await rest.put(Routes.applicationGuildCommands(clientId, guildId), { body: commandBuilders });
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
      let msg = `✅ **${result.card.name}** a été capturée ! 🎉\n+${result.gainedXp} XP · Niveau ${result.level}`;
      if (result.boostersGained > 0) msg += `\n🎁 +${result.boostersGained} booster(s) !`;
      return send(msg);
    } else {
      return send(`💨 Oh non... **${result.card.name}** s'est échappée ! La petite crapule...`);
    }
  }

  if (interaction.commandName === "inventory") {
    const inventory = await inventoryService.getInventory(user.id);
    const lines = inventory.slice(0, 20).map((i) => `${i.card.name} x${i.quantity}`);
    const text = lines.length ? lines.join("\n") : "Inventaire vide";
    const webUrl = process.env.NEXTAUTH_URL ?? "http://localhost:3000";
    return send(`${text}\n\n📦 *Consulte ton inventaire complet avec filtres sur ${webUrl}/inventory*`);
  }

  if (interaction.commandName === "profile") {
    return send(`Niveau ${user.level} | XP ${user.xp}`);
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

  if (interaction.commandName === "booster" && interaction.options.getSubcommand() === "open") {
    const cards = await boosterService.openBooster(user.id);

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

    await interaction.editReply(`🎁 Booster ouvert ! **${cards.length} cartes** obtenues :`);

    for (let i = 0; i < cards.length; i++) {
      const card = cards[i];
      const rarity = (card as any).rarity;
      const rarityName: string = rarity?.name ?? "?";
      const color = rarityColor[rarityName] ?? 0x5865f2;

      const embed = new EmbedBuilder()
        .setTitle(card.name)
        .setDescription(`**Rareté :** ${rarityName}`)
        .setColor(color);

      if (card.description) embed.addFields({ name: "Description", value: card.description });
      if (card.imageUrl) embed.setImage(card.imageUrl);

      await interaction.followUp({ embeds: [embed] });
    }
    return;
  }

  if (interaction.commandName === "trade") {
    const sub = interaction.options.getSubcommand();

    if (sub === "start") {
      const target = interaction.options.getUser("user", true);
      const targetUser = await usersService.getOrCreateDiscordUser(target.id, target.username, target.displayAvatarURL());
      const trade = await tradeService.startTrade(user.id, targetUser.id);
      return send(`Trade cree: ${trade.id}`);
    }

    const tradeId = interaction.options.getString("trade_id") ?? "";

    if (sub === "add") {
      const cardName = interaction.options.getString("carte", true);
      const qty = interaction.options.getInteger("quantity") ?? 1;
      const cards = await cardsService.getCards();
      const card = cards.find((c) => c.name.toLowerCase() === cardName.toLowerCase());
      if (!card) {
        return send("Carte introuvable");
      }
      await tradeService.addItem(tradeId, user.id, card.id, qty);
      return send("Carte ajoutee au trade");
    }

    if (sub === "remove") {
      const cardName = interaction.options.getString("carte", true);
      const qty = interaction.options.getInteger("quantity") ?? 1;
      const cards = await cardsService.getCards();
      const card = cards.find((c) => c.name.toLowerCase() === cardName.toLowerCase());
      if (!card) {
        return send("Carte introuvable");
      }
      await tradeService.removeItem(tradeId, user.id, card.id, qty);
      return send("Carte retiree du trade");
    }

    if (sub === "confirm") {
      const id = interaction.options.getString("trade_id", true);
      const trade = await tradeService.confirmTrade(id, user.id);
      return send(`Trade mis a jour: ${trade.status}`);
    }

    if (sub === "cancel") {
      const id = interaction.options.getString("trade_id", true);
      await tradeService.cancelTrade(id, user.id);
      return send("Trade annule");
    }
  }

  if (interaction.commandName === "admin") {
    // Check if user is admin (you might want to add this check)
    if (interaction.options.getSubcommand() === "import") {
      const source = interaction.options.getString("source", true);
      const limit = interaction.options.getInteger("limit") || (source === "pokemon" ? 151 : source === "rocket" ? 0 : 100);

      await interaction.deferReply();

      try {
        const apiUrl = `http://api:4000/import/${source}`;
        const defaultLimit = source === "pokemon" ? 151 : source === "rocket" ? 0 : 100;
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
