import { SlashCommandBuilder, REST, Routes } from "discord.js";

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
