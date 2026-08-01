import { REST, Routes, SlashCommandBuilder } from "discord.js";

const cardNameOption = (option: any) =>
  option.setName("nom").setDescription("Nom de la carte").setRequired(true);
const quantityOption = (option: any) =>
  option.setName("quantite").setDescription("Quantité").setRequired(true).setMinValue(1);
const variantOption = (option: any) =>
  option.setName("variant").setDescription("Variante").addChoices(
    { name: "normal", value: "normal" },
    { name: "shiny", value: "shiny" },
    { name: "holo", value: "holo" }
  );
const boosterTypeOption = (option: any) =>
  option.setName("type").setDescription("Type de booster").setRequired(true).addChoices(
    { name: "basic", value: "basic" },
    { name: "rare", value: "rare" },
    { name: "epic", value: "epic" },
    { name: "legendary", value: "legendary" }
  );

export const commandBuilders = [
  new SlashCommandBuilder().setName("explore").setDescription("Ouvrir ou réparer le centre d'exploration"),
  new SlashCommandBuilder().setName("collection").setDescription("Voir ta collection de cartes"),
  new SlashCommandBuilder().setName("profile").setDescription("Voir ton profil et ta progression"),
  new SlashCommandBuilder().setName("quests").setDescription("Voir tes quêtes quotidiennes"),
  new SlashCommandBuilder().setName("achievements").setDescription("Voir tes succès et leur progression"),
  new SlashCommandBuilder()
    .setName("skills")
    .setDescription("Voir ou débloquer tes compétences")
    .addStringOption((option) =>
      option
        .setName("noeud")
        .setDescription("Clé du nœud à débloquer, par exemple EXP-C1")
        .setRequired(false)
    ),
  new SlashCommandBuilder().setName("items").setDescription("Voir tes objets et artefacts"),
  new SlashCommandBuilder().setName("boss").setDescription("Voir le boss communautaire"),
  new SlashCommandBuilder()
    .setName("sell")
    .setDescription("Vendre une carte contre des crédits")
    .addStringOption(cardNameOption)
    .addIntegerOption(quantityOption)
    .addStringOption(variantOption),
  new SlashCommandBuilder()
    .setName("recycle")
    .setDescription("Recycler une carte contre des crédits et fragments")
    .addStringOption(cardNameOption)
    .addIntegerOption(quantityOption),
  new SlashCommandBuilder()
    .setName("fragment")
    .setDescription("Fragmenter une carte contre des crédits et fragments")
    .addStringOption(cardNameOption)
    .addIntegerOption(quantityOption),
  new SlashCommandBuilder()
    .setName("value")
    .setDescription("Voir la valeur dynamique d'une carte")
    .addStringOption(cardNameOption)
    .addStringOption(variantOption),
  new SlashCommandBuilder()
    .setName("fusion")
    .setDescription("Fusionner cinq cartes vers la rareté supérieure")
    .addStringOption((option) =>
      option.setName("rarity").setDescription("Rareté à fusionner").setRequired(true).addChoices(
        { name: "Common", value: "Common" },
        { name: "Uncommon", value: "Uncommon" },
        { name: "Rare", value: "Rare" },
        { name: "Very Rare", value: "Very Rare" },
        { name: "Import", value: "Import" },
        { name: "Exotic", value: "Exotic" }
      )
    ),
  new SlashCommandBuilder().setName("daily").setDescription("Réclamer la récompense quotidienne"),
  new SlashCommandBuilder()
    .setName("shop")
    .setDescription("Voir la boutique ou acheter un objet")
    .addStringOption((option) =>
      option
        .setName("objet")
        .setDescription("Clé de l'objet à acheter")
        .setRequired(false)
    ),
  new SlashCommandBuilder()
    .setName("cardinfo")
    .setDescription("Voir les informations d'une carte")
    .addStringOption((option) =>
      option
        .setName("nom")
        .setDescription("Nom ou identifiant Vault de la carte")
        .setRequired(true)
    )
    .addStringOption(variantOption)
    .addStringOption((option) =>
      option
        .setName("deck")
        .setDescription("Deck de la carte si plusieurs cartes ont le même nom")
        .setRequired(false)
    ),
  new SlashCommandBuilder().setName("leaderboard").setDescription("Voir le classement"),
  new SlashCommandBuilder()
    .setName("trade")
    .setDescription("Gérer un échange")
    .addSubcommand((subcommand) =>
      subcommand
        .setName("user")
        .setDescription("Inviter un joueur")
        .addUserOption((option) => option.setName("user").setDescription("Utilisateur").setRequired(true))
    )
    .addSubcommand((subcommand) => subcommand.setName("accept").setDescription("Accepter une invitation"))
    .addSubcommandGroup((group) =>
      group
        .setName("add")
        .setDescription("Ajouter à l'échange")
        .addSubcommand((subcommand) =>
          subcommand
            .setName("card")
            .setDescription("Ajouter une carte")
            .addStringOption((option) => option.setName("carte").setDescription("Carte").setRequired(true))
            .addIntegerOption((option) => option.setName("quantity").setDescription("Quantité").setMinValue(1))
            .addStringOption(variantOption)
        )
        .addSubcommand((subcommand) =>
          subcommand
            .setName("booster")
            .setDescription("Ajouter un booster")
            .addStringOption(boosterTypeOption)
            .addIntegerOption((option) => option.setName("quantity").setDescription("Quantité").setMinValue(1))
        )
    )
    .addSubcommandGroup((group) =>
      group
        .setName("remove")
        .setDescription("Retirer de l'échange")
        .addSubcommand((subcommand) =>
          subcommand
            .setName("card")
            .setDescription("Retirer une carte")
            .addStringOption((option) => option.setName("carte").setDescription("Carte").setRequired(true))
            .addIntegerOption((option) => option.setName("quantity").setDescription("Quantité").setMinValue(1))
            .addStringOption(variantOption)
        )
        .addSubcommand((subcommand) =>
          subcommand
            .setName("booster")
            .setDescription("Retirer un booster")
            .addStringOption(boosterTypeOption)
            .addIntegerOption((option) => option.setName("quantity").setDescription("Quantité").setMinValue(1))
        )
    )
    .addSubcommand((subcommand) => subcommand.setName("confirm").setDescription("Confirmer l'échange"))
    .addSubcommand((subcommand) => subcommand.setName("cancel").setDescription("Annuler l'échange")),
].map((command) => command.toJSON());

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

export async function clearGuildCommands(guildIds: string[]) {
  const token = process.env.DISCORD_TOKEN;
  const clientId = process.env.DISCORD_CLIENT_ID;
  if (!token || !clientId || guildIds.length === 0) {
    return;
  }
  const rest = new REST({ version: "10" }).setToken(token);
  for (const guildId of guildIds) {
    await rest.put(Routes.applicationGuildCommands(clientId, guildId), { body: [] });
  }
  console.log(`Cleared legacy guild slash commands for ${guildIds.length} guild(s)`);
}
