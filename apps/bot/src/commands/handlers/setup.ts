import {
  ChannelType,
  PermissionFlagsBits,
  type ChatInputCommandInteraction,
  type PermissionsBitField
} from "discord.js";
import { AppError, configService } from "../service-instances.js";

const REQUIRED_BOT_PERMISSIONS = [
  { bit: PermissionFlagsBits.ViewChannel, label: "Voir le salon" },
  { bit: PermissionFlagsBits.SendMessages, label: "Envoyer des messages" },
  { bit: PermissionFlagsBits.EmbedLinks, label: "Intégrer des liens" },
  { bit: PermissionFlagsBits.AttachFiles, label: "Joindre des fichiers" }
] as const;

export function canConfigureGuild(
  permissions: Readonly<PermissionsBitField> | null,
  isGuildOwner: boolean
) {
  return isGuildOwner || permissions?.has(PermissionFlagsBits.ManageGuild) === true;
}

export async function handleSetup(interaction: ChatInputCommandInteraction, user: { id: string }) {
  if (!interaction.guildId || !interaction.guild) {
    throw new AppError("La commande `/setup` doit être utilisée dans un serveur Discord.", 400);
  }

  if (!canConfigureGuild(
    interaction.memberPermissions,
    interaction.guild.ownerId === interaction.user.id
  )) {
    throw new AppError(
      "Tu dois être propriétaire du serveur ou posséder la permission **Gérer le serveur**.",
      403
    );
  }

  const selected = interaction.options.getChannel("salon", true);
  const channel = await interaction.guild.channels.fetch(selected.id);
  if (
    !channel ||
    (channel.type !== ChannelType.GuildText && channel.type !== ChannelType.GuildAnnouncement)
  ) {
    throw new AppError("Choisis un salon textuel ou un salon d’annonces de ce serveur.", 400);
  }

  const botMember = interaction.guild.members.me ?? await interaction.guild.members.fetchMe();
  const permissions = channel.permissionsFor(botMember);
  const missingPermissions = REQUIRED_BOT_PERMISSIONS
    .filter((required) => !permissions?.has(required.bit))
    .map((required) => required.label);
  if (missingPermissions.length > 0) {
    throw new AppError(
      `Je ne peux pas publier dans <#${channel.id}>. Permissions manquantes : ${missingPermissions.join(", ")}.`,
      409
    );
  }

  await configService.configureGuildGameChannel({
    guildId: interaction.guildId,
    guildName: interaction.guild.name,
    gameChannelId: channel.id,
    actorId: user.id,
    source: "DISCORD_SETUP_COMMAND"
  });

  const publicBaseUrl = process.env.PUBLIC_BASE_URL?.replace(/\/+$/, "");
  await interaction.editReply(
    `✅ <#${channel.id}> est maintenant le salon de jeu de **${interaction.guild.name}**.\n` +
    "Lance `/explore` dans ce salon pour créer ou réparer le centre d’exploration." +
    (publicBaseUrl ? `\nConfiguration web : <${publicBaseUrl}/setup>` : "")
  );
}
