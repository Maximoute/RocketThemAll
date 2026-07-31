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
  achievementService,
  boosterService,
  economyService,
  equipmentService,
  explorationEnergyService,
  monetizationService,
  prisma
} from "../service-instances.js";
import { levelRoleRange } from "@rta/services";
import { createInteractionToken } from "../interaction-token.js";

type ProfileInteraction =
  | ChatInputCommandInteraction
  | ButtonInteraction
  | StringSelectMenuInteraction;

export function equipmentDescription(
  equipped: Awaited<ReturnType<typeof equipmentService.getEquipment>>["equipped"],
  slotLimit: number
) {
  const bySlot = new Map(equipped.map((entry) => [entry.slot, entry.item.name]));
  return Array.from({ length: slotLimit }, (_, index) => {
    const slot = index + 1;
    return `**Slot ${slot}** — ${bySlot.get(slot) ?? "Libre"}`;
  }).join("\n");
}

export function equipmentComponents(
  discordUserId: string,
  equipment: Awaited<ReturnType<typeof equipmentService.getEquipment>>,
  returnView: "profile" | "items" = "profile"
) {
  return Array.from(
    { length: Math.min(equipment.slotLimit, 5) },
    (_, index) => {
      const slot = index + 1;
      const options = [
        {
          label: `Libérer le slot ${slot}`,
          value: `clear|${slot}`,
          emoji: "🗑️",
          description: `Retirer l'artefact équipé du slot ${slot}`
        },
        ...equipment.ownedArtifacts.slice(0, 24).map((owned) => ({
          label: owned.item.name.slice(0, 100),
          value: `equip|${slot}|${owned.item.id}`,
          emoji: "🧿",
          description: `Équiper dans le slot ${slot}`.slice(0, 100)
        }))
      ];
      return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId(createInteractionToken(
            returnView === "items" ? "y" : "x",
            discordUserId,
            slot
          ))
          .setPlaceholder(`Slot ${slot} — choisir un artefact`)
          .addOptions(options)
      );
    }
  );
}

function profileNavigationComponents() {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(createInteractionToken("g", "skills"))
      .setLabel("Arbre de compétences")
      .setEmoji("🌳")
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(createInteractionToken("g", "items"))
      .setLabel("Inventaire d’objets")
      .setEmoji("🎒")
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(createInteractionToken("g", "achievements"))
      .setLabel("Achievements")
      .setEmoji("🏆")
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(createInteractionToken("g", "contracts"))
      .setLabel("Contrats")
      .setEmoji("📋")
      .setStyle(ButtonStyle.Secondary)
  );
}

export async function handleProfile(interaction: ProfileInteraction, user: any) {
  const [
    progress,
    boosters,
    inventoryValue,
    guild,
    equipment,
    explorationEnergy,
    achievements,
    supporterAccess
  ] = await Promise.all([
    prisma.userProgress.upsert({
      where: { userId: user.id },
      update: {},
      create: { userId: user.id, level: user.level, xp: user.xp }
    }),
    boosterService.getUserBoosters(user.id),
    economyService.getInventoryEstimatedValue(user.id),
    interaction.guildId
      ? prisma.guild.findUnique({
          where: { discordId: interaction.guildId },
          include: { progress: { include: { frontierWorld: true } } }
        })
      : null,
    equipmentService.getEquipment(user.id),
    explorationEnergyService.getSnapshot(user.id),
    achievementService.getUserSummary(user.id),
    monetizationService.getUserAccess(user.id)
  ]);

  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle(`👤 Profil de ${interaction.user.username}`)
    .setThumbnail(interaction.user.displayAvatarURL())
    .addFields(
      { name: "Niveau", value: String(progress.level), inline: true },
      {
        name: "Rôle de niveau",
        value: `⭐ ${levelRoleRange(progress.level).label}`,
        inline: true
      },
      { name: "XP", value: String(progress.xp), inline: true },
      { name: "Points de compétence", value: String(progress.unspentSkillPoints), inline: true },
      { name: "Crédits", value: String(user.credits), inline: true },
      { name: "Fragments", value: String(user.fragments), inline: true },
      {
        name: "Statut soutien",
        value:
          supporterAccess.tier === "FOUNDER"
            ? "🌟 Fondateur RTA"
            : supporterAccess.tier === "VIP"
              ? "💎 RTA VIP"
              : "Joueur",
        inline: true
      },
      {
        name: "Explorations",
        value: explorationEnergy.isUnlimited
          ? "⚡ Illimitées"
          : `⚡ ${explorationEnergy.charges}/${explorationEnergy.maxCharges}` +
            (explorationEnergy.nextChargeAt
              ? ` • prochaine <t:${Math.floor(explorationEnergy.nextChargeAt.getTime() / 1000)}:R>`
              : " • réserve pleine"),
        inline: true
      },
      { name: "Valeur collection", value: `${inventoryValue} crédits`, inline: true },
      {
        name: `Équipement · ${equipment.slotLimit} slots`,
        value: equipmentDescription(equipment.equipped, equipment.slotLimit)
      },
      {
        name: "Boosters",
        value: `basic ${boosters.basic}, rare ${boosters.rare}, epic ${boosters.epic}, legendary ${boosters.legendary}`
      },
      {
        name: "🏆 Achievements",
        value:
          `**${achievements.unlocked}/${achievements.total}** débloqués • ` +
          `**${achievements.points} points** • ${achievements.completionPercent} %` +
          (achievements.latestUnlocked.length > 0
            ? `\nDerniers : ${achievements.latestUnlocked
                .slice(0, 3)
                .map((achievement) => achievement.name)
                .join(", ")}`
            : "\nAucun achievement débloqué pour le moment.")
      },
      {
        name: "🏅 Badges Discord",
        value: achievements.selectedBadges.length > 0
          ? achievements.selectedBadges.map((badge) => badge.name).join(", ")
          : "Aucun badge affiché · choisis-en jusqu'à 3 dans Achievements."
      }
    )
    .setFooter({
      text:
        equipment.ownedArtifacts.length > 0
          ? "2 slots d’artefacts fixes • les consommables d’exploration utilisent leurs propres slots"
          : "Trouve ou achète un artefact pour l'équiper • 2 slots de base"
    });

  if (guild?.progress) {
    embed.addFields({
      name: "Progression du serveur",
      value:
        `${guild.progress.frontierWorld?.name ?? "Monde 1"} • ` +
        `${guild.progress.mastery}/${guild.progress.masteryTarget} maîtrise • ` +
        `${guild.progress.unlockedWorldCount}/9 mondes`
    });
  }

  await interaction.editReply({
    embeds: [embed],
    components: [
      ...equipmentComponents(interaction.user.id, equipment),
      profileNavigationComponents()
    ]
  });
}

export async function applyEquipmentSelection(
  interaction: StringSelectMenuInteraction,
  user: any
) {
  const [action, slotRaw, itemId] = interaction.values[0]?.split("|") ?? [];
  const slot = Number(slotRaw);
  if (action === "clear") {
    await equipmentService.unequipSlot(user.id, slot);
  } else if (action === "equip" && itemId) {
    await equipmentService.equipArtifact(user.id, itemId, slot);
  } else {
    throw new Error("Sélection d'équipement invalide.");
  }
}

export async function handleProfileEquipmentSelect(
  interaction: StringSelectMenuInteraction,
  user: any
) {
  await applyEquipmentSelection(interaction, user);
  await handleProfile(interaction, user);
}
