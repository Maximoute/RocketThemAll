import { EmbedBuilder, type ChatInputCommandInteraction } from "discord.js";
import axios from "axios";
import {
  cardsService,
  spawnService,
  configService,
  AppError
} from "../service-instances.js";
import {
  hasDiscordAdminRole,
  ADMIN_ROLE_ID,
  resolveGuildSpawnChannelId,
  sendSpawnCards
} from "../helpers.js";

export async function handleAdmin(interaction: ChatInputCommandInteraction, user: any) {
  if (!user.isAdmin) {
    console.warn(`[bot:security] Admin command denied: user ${user.id} is not app-admin`);
    const embed = new EmbedBuilder().setColor(0xf44336).setDescription("Commande reservee aux administrateurs.");
    await interaction.editReply({ embeds: [embed] });
    return;
  }

  if (!ADMIN_ROLE_ID) {
    console.warn("[bot:security] Missing admin role env var (DISCORD_ADMIN_ROLE_ID or ADMIN_ROLE_ID), admin command denied");
    const embed = new EmbedBuilder().setColor(0xf44336).setDescription("Configuration admin manquante: DISCORD_ADMIN_ROLE_ID non defini.");
    await interaction.editReply({ embeds: [embed] });
    return;
  }

  if (!hasDiscordAdminRole(interaction)) {
    console.warn(`[bot:security] Admin command denied: user ${user.id} missing Discord role ${ADMIN_ROLE_ID}`);
    const embed = new EmbedBuilder().setColor(0xf44336).setDescription("Accès refusé: rôle admin Discord requis.");
    await interaction.editReply({ embeds: [embed] });
    return;
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
          const embed = new EmbedBuilder().setColor(0xf44336).setDescription("Carte introuvable pour spawn force.");
          await interaction.editReply({ embeds: [embed] });
          return;
        }
        cardId = selected.id;
      }

      try {
        const cards = await spawnService.createAdminSpawn(spawnChannelId, user.id, cardId);
        await sendSpawnCards(interaction, spawnChannelId, cards, `Spawn admin force par <@${interaction.user.id}>.`);
        const embed = new EmbedBuilder().setColor(0x4caf50).setDescription(`Spawn admin effectue dans <#${spawnChannelId}>.`);
        await interaction.editReply({ embeds: [embed] });
      } catch (error) {
        if (error instanceof AppError) {
          const embed = new EmbedBuilder().setColor(0xf44336).setDescription(error.message);
          await interaction.editReply({ embeds: [embed] });
          return;
        }
        throw error;
      }
    }

    if (subcommand === "cancel") {
      const count = await spawnService.cancelActiveSpawn(spawnChannelId);
      const embed = new EmbedBuilder()
        .setColor(count > 0 ? 0x4caf50 : 0xff9800)
        .setDescription(count > 0 ? `Spawn actif annule dans <#${spawnChannelId}>.` : "Aucun spawn actif a annuler.");
      await interaction.editReply({ embeds: [embed] });
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

      const embed = new EmbedBuilder()
        .setColor(0x2196f3)
        .setTitle("Config spawn")
        .addFields(
          { name: "autoSpawnEnabled", value: cfg.autoSpawnEnabled ? "ON" : "OFF", inline: true },
          { name: "autoSpawnIntervalMinutes", value: `${cfg.autoSpawnIntervalMinutes}`, inline: true },
          { name: "manualSpawnEnabled", value: cfg.manualSpawnEnabled ? "ON" : "OFF", inline: true },
          { name: "manualSpawnMaxCharges", value: `${cfg.manualSpawnMaxCharges}`, inline: true },
          { name: "manualSpawnRegenHours", value: `${cfg.manualSpawnRegenHours}`, inline: true }
        );
      await interaction.editReply({ embeds: [embed] });
    }

    return;
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
      const embed = new EmbedBuilder().setColor(0x4caf50).setDescription(msg);
      await interaction.editReply({ embeds: [embed] });
    } catch (error) {
      const embed = new EmbedBuilder()
        .setColor(0xf44336)
        .setDescription(`❌ Erreur lors de l'import: ${error instanceof Error ? error.message : "Erreur inconnue"}`);
      await interaction.editReply({ embeds: [embed] });
    }
  }
}
