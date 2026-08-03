import {
  ActionRowBuilder,
  AttachmentBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  StringSelectMenuBuilder,
  type ButtonInteraction,
  type ChatInputCommandInteraction,
  type StringSelectMenuInteraction
} from "discord.js";
import {
  boosterSelectionRule,
  MAX_SELECTED_ACHIEVEMENT_BADGES,
  nextDailyBossSlot
} from "@rta/services";
import {
  achievementService,
  archiveService,
  AppError,
  boosterService,
  bossService,
  collectionContractService,
  conquerorRewardService,
  dailyQuestService,
  equipmentService,
  prisma,
  renderQuestName,
  skillService,
  usersService
} from "../service-instances.js";
import { createInteractionToken } from "../interaction-token.js";
import { attachCardImage } from "../card-media.js";
import { bossProgressBar } from "../boss-progress.js";
import { bossVictoryRewardDescription } from "../boss-victory.js";
import { equipmentComponents, equipmentDescription } from "./profile.js";

function objectRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

export async function handleQuests(
  interaction: ChatInputCommandInteraction | ButtonInteraction,
  user: any
) {
  const quests = await dailyQuestService.getDailyQuests(user.id);
  const difficultyLabels: Record<string, string> = {
    EASY: "Facile",
    NORMAL: "Normale",
    HARD: "Longue"
  };
  const description = quests.length
    ? quests.map((quest) => {
        const reward = quest.rewardSnapshot && typeof quest.rewardSnapshot === "object"
          && !Array.isArray(quest.rewardSnapshot)
          ? quest.rewardSnapshot as Record<string, unknown>
          : {};
        const difficulty = String(reward.difficulty ?? "");
        const completed = quest.status === "CLAIMED";
        return `${completed ? "✅" : "▫️"} **${difficultyLabels[difficulty] ?? difficulty} · ` +
          `${renderQuestName(quest)}**\n` +
          `${quest.progress}/${quest.targetSnapshot} · ` +
          `🎁 ${Number(reward.xp ?? 0)} XP + ${Number(reward.credits ?? 0)} crédits` +
          (completed ? " · récompense accordée" : "");
      }).join("\n\n")
    : "Aucune quête éligible n'a pu être générée pour aujourd'hui.";
  await interaction.editReply({
    embeds: [
      new EmbedBuilder()
        .setColor(0xf1c40f)
        .setTitle("📜 Quêtes quotidiennes")
        .setDescription(description)
        .setFooter({
          text: "Progression et récompenses automatiques · renouvellement à 00:00 (Paris/Belgique)"
        })
    ]
  });
}

export async function handleAchievements(
  interaction:
    | ChatInputCommandInteraction
    | ButtonInteraction
    | StringSelectMenuInteraction,
  user: any,
  requestedCategory = "ALL",
  requestedPage = 0,
  badgeNotice?: string
) {
  const summary = await achievementService.getUserSummary(user.id);
  const categoryLabels: Record<string, string> = {
    ALL: "Tous",
    EXPLORATION: "Exploration",
    COLLECTION: "Collection",
    PROGRESSION: "Progression",
    ECONOMY: "Économie",
    SOCIAL: "Social",
    CONTENT: "Contenu",
    SPECIAL: "Spécial"
  };
  const validCategory = requestedCategory === "ALL"
    || summary.categoryCounts.some((entry) => entry.category === requestedCategory);
  const category = validCategory ? requestedCategory : "ALL";
  const filtered = category === "ALL"
    ? summary.achievements
    : summary.achievements.filter((achievement) => achievement.category === category);
  const pageSize = 8;
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const page = Math.max(0, Math.min(totalPages - 1, Math.floor(requestedPage)));
  const entries = filtered.slice(page * pageSize, (page + 1) * pageSize);
  const progressBar = (progress: number, target: number) => {
    const ratio = Math.max(0, Math.min(1, progress / Math.max(1, target)));
    const filled = Math.round(ratio * 10);
    return `${"█".repeat(filled)}${"░".repeat(10 - filled)}`;
  };
  const fields = entries.map((achievement) => {
    const secret = achievement.hidden && !achievement.unlocked;
    return {
      name: secret
        ? "🔒 Achievement secret"
        : `${achievement.unlocked ? "✅" : "▫️"} ${achievement.name}`,
      value: secret
        ? "Continue à jouer pour révéler cet achievement."
        : `${progressBar(achievement.progress, achievement.target)} ` +
          `**${achievement.progress}/${achievement.target}**\n` +
          `${achievement.readableObjective ?? achievement.description ?? "Progression permanente"} ` +
          `• **${achievement.points} pts**`,
      inline: false
    };
  });
  const categoryOptions = [
    {
      label: "Tous les achievements",
      value: "ALL",
      description: `${summary.unlocked}/${summary.total} débloqués`,
      default: category === "ALL"
    },
    ...summary.categoryCounts.map((entry) => ({
      label: categoryLabels[entry.category] ?? entry.category,
      value: entry.category,
      description: `${entry.unlocked}/${entry.total} débloqués`,
      default: category === entry.category
    }))
  ];
  const components: Array<
    ActionRowBuilder<StringSelectMenuBuilder> | ActionRowBuilder<ButtonBuilder>
  > = [
    new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId(createInteractionToken("B", interaction.user.id))
        .setPlaceholder("Filtrer les achievements")
        .addOptions(categoryOptions)
    )
  ];
  const selectableBadges = summary.achievements
    .filter((achievement) => achievement.unlocked)
    .sort((left, right) =>
      Number(right.selectedAsBadge) - Number(left.selectedAsBadge)
      || (right.unlockedAt?.getTime() ?? 0) - (left.unlockedAt?.getTime() ?? 0)
      || left.name.localeCompare(right.name, "fr")
    );
  const badgeOptions = selectableBadges.slice(0, 24).map((achievement) => ({
    label: achievement.name.slice(0, 100),
    value: achievement.id,
    description: `${achievement.tierLabel ?? `Palier ${achievement.tier}`} · ${achievement.points} pts`.slice(0, 100),
    emoji: "🏅",
    default: achievement.selectedAsBadge
  }));
  components.push(
    new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId(createInteractionToken("G", interaction.user.id))
        .setPlaceholder(
          selectableBadges.length > 0
            ? `Choisir jusqu'à ${MAX_SELECTED_ACHIEVEMENT_BADGES} badges-rôles`
            : "Aucun badge débloqué"
        )
        .setMinValues(1)
        .setMaxValues(Math.min(
          MAX_SELECTED_ACHIEVEMENT_BADGES,
          Math.max(1, badgeOptions.length + 1)
        ))
        .setDisabled(selectableBadges.length === 0)
        .addOptions([
          {
            label: "Retirer tous mes badges",
            value: "none",
            description: "Supprime les rôles de badges actuellement affichés",
            emoji: "🗑️"
          },
          ...badgeOptions
        ])
    )
  );
  if (totalPages > 1) {
    components.push(
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId(createInteractionToken(
            "A",
            interaction.user.id,
            category,
            Math.max(0, page - 1)
          ))
          .setLabel("Précédent")
          .setEmoji("◀️")
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(page === 0),
        new ButtonBuilder()
          .setCustomId(createInteractionToken(
            "A",
            interaction.user.id,
            category,
            Math.min(totalPages - 1, page + 1)
          ))
          .setLabel("Suivant")
          .setEmoji("▶️")
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(page >= totalPages - 1)
      )
    );
  }
  await interaction.editReply({
    embeds: [
      new EmbedBuilder()
        .setColor(0x2ecc71)
        .setTitle("🏆 Achievements")
        .setDescription(
          `**${summary.unlocked}/${summary.total}** débloqués • ` +
          `**${summary.points} points** • ${summary.completionPercent} %\n` +
          `Catégorie : **${categoryLabels[category] ?? category}**\n` +
          `Badges affichés sur le serveur principal : **${summary.selectedBadges.length}/${MAX_SELECTED_ACHIEVEMENT_BADGES}**` +
          (summary.selectedBadges.length > 0
            ? ` — ${summary.selectedBadges.map((badge) => badge.name).join(", ")}`
            : "") +
          (badgeNotice ? `\n\n${badgeNotice}` : "")
        )
        .addFields(fields)
        .setFooter({
          text:
            `Page ${page + 1}/${totalPages} • ${summary.catalogCount} définitions en BDD ` +
            `dont ${summary.templateCount} modèles générateurs`
        })
    ],
    components
  });
}

export async function handleSkills(
  interaction:
    | ChatInputCommandInteraction
    | ButtonInteraction
    | StringSelectMenuInteraction,
  user: any,
  selectedNode?: string
) {
  const requestedNode = selectedNode?.trim().toUpperCase() || (
    interaction.isChatInputCommand()
      ? interaction.options.getString("noeud")?.trim().toUpperCase()
      : undefined
  );
  if (requestedNode) {
    await skillService.unlockSkill(user.id, requestedNode, interaction.id);
  }
  const tree = await skillService.getTree(user.id);
  const commitment = tree.state?.committedSpecialization ?? null;
  const isAccessible = (node: (typeof tree.definitions)[number]) => {
    const commitmentAllows = node.kind === "COMMON"
      || (node.kind === "SPECIALIZATION_GATE" && !commitment)
      || (
        node.kind === "SPECIALIZATION_UPGRADE"
        && (!commitment || commitment === node.specialization)
      );
    return !node.learned
      && node.prerequisitesMet
      && tree.progress.unspentSkillPoints >= node.cost
      && commitmentAllows;
  };
  const accessibleNodes = tree.definitions.filter(isAccessible);
  const fields = (["EXPLORER", "HUNTER", "COLLECTOR"] as const).map((branch) => {
    const value = tree.definitions
      .filter((node) => node.branch === branch)
      .map((node) => {
        const available = isAccessible(node);
        return `${node.learned ? "✅" : available ? "🔓" : "🔒"} \`${node.contentKey}\` ${node.name}`;
      })
      .join("\n");
    const labels = {
      EXPLORER: "🧭 Explorateur",
      HUNTER: "🎯 Chasseur",
      COLLECTOR: "💎 Collectionneur"
    };
    return { name: labels[branch], value: value || "Aucun nœud.", inline: false };
  });

  await interaction.editReply({
    embeds: [
      new EmbedBuilder()
        .setColor(0x9b59b6)
        .setTitle("🌳 Arbres de compétences")
        .setDescription(
          requestedNode
            ? `✅ **${requestedNode}** débloquée.\nChoisis la prochaine compétence accessible ci-dessous.`
            : accessibleNodes.length > 0
              ? "Choisis directement une compétence accessible dans le menu ci-dessous."
              : "Aucune compétence n'est actuellement accessible."
        )
        .addFields(
          {
            name: "Points disponibles",
            value: String(tree.progress.unspentSkillPoints),
            inline: true
          },
          {
            name: "Spécialisation engagée",
            value: commitment ?? "Aucune",
            inline: true
          },
          ...fields
        )
        .setFooter({ text: `${tree.definitions.length} nœuds Vault importés` })
    ],
    components: Array.from(
      { length: Math.ceil(accessibleNodes.length / 25) },
      (_, index) => {
        const nodes = accessibleNodes.slice(index * 25, (index + 1) * 25);
        return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
          new StringSelectMenuBuilder()
            .setCustomId(createInteractionToken("l", interaction.user.id, index))
            .setPlaceholder(
              accessibleNodes.length <= 25
                ? "Apprendre une compétence accessible"
                : `Compétences accessibles · liste ${index + 1}`
            )
            .addOptions(nodes.map((node) => ({
              label: `${node.contentKey} · ${node.name}`.slice(0, 100),
              value: node.contentKey,
              description:
                `${node.cost} point(s) · ${node.description || node.branch}`.slice(0, 100)
            })))
        );
      }
    ).slice(0, 5)
  });
}

export async function handleItems(
  interaction:
    | ChatInputCommandInteraction
    | ButtonInteraction
    | StringSelectMenuInteraction,
  user: any,
  notice?: string
) {
  await boosterService.getUserBoosters(user.id);
  const [
    items,
    legacyBoosters,
    currentBoosterCount,
    equipmentState,
    catalogCount,
    archiveState,
    archiveCandidates,
    decks,
    wishlistSkill,
    pinMissingSkill
  ] =
    await Promise.all([
    prisma.userItem.findMany({
      where: { userId: user.id, quantity: { gt: 0 } },
      include: { item: true },
      orderBy: { acquiredAt: "desc" },
      take: 25
    }),
    prisma.userBooster.findMany({
      where: { userId: user.id, quantity: { gt: 0 } },
      orderBy: { boosterType: "asc" }
    }),
    prisma.userItem.count({
      where: {
        userId: user.id,
        quantity: { gt: 0 },
        item: {
          status: "PUBLISHED",
          type: "BOOSTER",
          contentKey: { startsWith: "booster.boss_choice." }
        }
      }
    }),
    equipmentService.getEquipment(user.id),
    prisma.itemDefinition.count({ where: { status: "PUBLISHED" } }),
    archiveService.getArchive(user.id),
    prisma.inventoryItem.findMany({
      where: { userId: user.id, quantity: { gt: 0 }, archive: null },
      include: { card: { include: { deck: true, rarity: true } } },
      orderBy: { card: { name: "asc" } },
      take: 24
    }),
    prisma.deck.findMany({
      where: { status: "PUBLISHED", isActive: true },
      orderBy: { name: "asc" },
      take: 24
    }),
    prisma.userSkill.findFirst({
      where: {
        userId: user.id,
        rank: { gt: 0 },
        skill: { effectKey: "COL_DECK_WISHLIST", status: "PUBLISHED" }
      }
    }),
    prisma.userSkill.findFirst({
      where: {
        userId: user.id,
        rank: { gt: 0 },
        skill: { effectKey: "COL_ARCHIVE_PIN_MISSING_CARDS", status: "PUBLISHED" }
      }
    })
  ]);
  const ownedCardIds = new Set(
    await prisma.inventoryItem.findMany({
      where: { userId: user.id, quantity: { gt: 0 } },
      select: { cardId: true },
      distinct: ["cardId"]
    }).then((rows) => rows.map((row) => row.cardId))
  );
  const missingWishlistCards =
    pinMissingSkill && archiveState.wishlistDeckId
      ? await prisma.card.findMany({
          where: {
            deckId: archiveState.wishlistDeckId,
            id: { notIn: [...ownedCardIds] },
            source: "vault",
            status: "PUBLISHED",
            isActive: true
          },
          include: { rarity: true },
          orderBy: [{ rarity: { weight: "desc" } }, { name: "asc" }],
          take: 24
        })
      : [];
  const legacyBoosterNames = {
    basic: "Booster Basic",
    rare: "Booster Rare",
    epic: "Booster Epic",
    legendary: "Booster Legendary"
  } as const;
  const inventoryLines = [
    ...items.map((entry) =>
      `**${entry.item.name}** ×${entry.quantity} — ${entry.item.type}`
    ),
    ...legacyBoosters.map((entry) =>
      `**${legacyBoosterNames[entry.boosterType]}** ×${entry.quantity} — BOOSTER`
    )
  ];
  const inventory = inventoryLines.length
    ? inventoryLines.join("\n")
    : "Aucun objet possédé.";
  const embed = new EmbedBuilder()
    .setColor(0x3498db)
    .setTitle("🎒 Objets")
    .setDescription(`${notice ? `${notice}\n\n` : ""}${inventory}`)
    .addFields(
      {
        name: `Artefacts équipés · ${equipmentState.slotLimit} slots`,
        value: equipmentDescription(equipmentState.equipped, equipmentState.slotLimit)
      },
      {
        name: `Archives · ${archiveState.entries.length}/${archiveState.limit}`,
        value:
          (archiveState.entries.map((entry) =>
            `**${entry.slot}.** ${entry.inventoryItem.card.name} [${entry.inventoryItem.variant}]`
          ).join("\n") || "Archives vides.") +
          `\nExposition : ${archiveState.weeklyUniqueCards}/9 cette semaine` +
          (archiveState.weeklyClaimed ? " · récompense réclamée" : "") +
          (archiveState.pinnedMissingCards.length > 0
            ? `\nÉpinglées : ${archiveState.pinnedMissingCards
                .map((card) => card.name)
                .join(", ")}`
            : "")
      },
      { name: "Catalogue Vault", value: `${catalogCount} objets importés`, inline: true }
    )
    .setFooter({ text: "Utilise le menu ci-dessous pour équiper ou retirer un artefact." });
  const files: AttachmentBuilder[] = [];
  const firstItem = items[0]?.item;
  const metadata = firstItem?.metadata;
  if (metadata && typeof metadata === "object" && !Array.isArray(metadata)) {
    const imageKey = (metadata as Record<string, unknown>).imageKey;
    const endpoint = process.env.S3_ENDPOINT?.replace(/\/+$/, "");
    const bucket = process.env.S3_BUCKET;
    if (typeof imageKey === "string" && endpoint && bucket) {
      try {
        const response = await fetch(`${endpoint}/${bucket}/${imageKey}`);
        if (response.ok) {
          const filename = `${firstItem.contentKey}.png`;
          files.push(new AttachmentBuilder(
            Buffer.from(await response.arrayBuffer()),
            { name: filename }
          ));
          embed.setThumbnail(`attachment://${filename}`);
        }
      } catch (error) {
        console.warn(`Unable to attach MinIO item image for ${firstItem.contentKey}`, error);
      }
    }
  }
  const components: Array<
    ActionRowBuilder<StringSelectMenuBuilder> | ActionRowBuilder<ButtonBuilder>
  > = equipmentComponents(interaction.user.id, equipmentState, "items");
  if ((currentBoosterCount > 0 || legacyBoosters.length > 0) && components.length < 5) {
    components.push(
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId(createInteractionToken("U", interaction.user.id))
          .setLabel("Ouvrir un booster")
          .setEmoji("🎁")
          .setStyle(ButtonStyle.Primary)
      )
    );
  }
  const conquerorChests = items.filter((entry) =>
    entry.item.effectKey === "BOSS_REWARD_CHEST" ||
    entry.item.contentKey.startsWith("chest.boss_reward.")
  );
  if (conquerorChests.length > 0 && components.length < 5) {
    components.push(
      new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId(createInteractionToken("E", interaction.user.id))
          .setPlaceholder("Ouvrir un coffre du Conquérant")
          .addOptions(conquerorChests.map((entry) => ({
            label: entry.item.name.slice(0, 100),
            value: entry.item.contentKey,
            description:
              `Consommable + XP + crédits · ${entry.quantity} disponible(s)`.slice(0, 100)
          })))
      )
    );
  }
  const archiveVaultEquipped = equipmentState.equipped.some(
    (entry) => entry.item.effectKey === "EXP_ARCHIVE_RESONANCE"
  );
  if (archiveVaultEquipped && archiveCandidates.length > 0 && components.length < 5) {
    components.push(
      new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId(createInteractionToken("C", interaction.user.id))
          .setPlaceholder("Archiver une carte dans le prochain slot libre")
          .addOptions(archiveCandidates.map((entry) => ({
            label: entry.card.name.slice(0, 100),
            value: entry.id,
            description:
              `${entry.variant} · ${entry.card.deck.name} · ${entry.card.rarity.name}`.slice(0, 100)
          })))
      )
    );
  }
  if (archiveVaultEquipped && components.length < 5) {
    const options = [
      ...(!archiveState.weeklyClaimed
        ? [
            {
              label: "Exposition : 750 crédits",
              value: "claim|credits",
              description: `${archiveState.weeklyUniqueCards}/9 cartes uniques archivées`
            },
            {
              label: "Exposition : 3 fragments",
              value: "claim|fragments",
              description: `${archiveState.weeklyUniqueCards}/9 cartes uniques archivées`
            },
            {
              label: "Exposition : 1 Booster Basic",
              value: "claim|booster",
              description: `${archiveState.weeklyUniqueCards}/9 cartes uniques archivées`
            }
          ]
        : [
            {
              label: "Exposition déjà réclamée",
              value: "noop",
              description: "Nouvelle sélection disponible la semaine prochaine"
            }
          ]),
      ...archiveState.entries.map((entry) => ({
        label: `Libérer le slot ${entry.slot}`,
        value: `remove|${entry.slot}`,
        description: entry.inventoryItem.card.name.slice(0, 100)
      }))
    ];
    components.push(
      new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId(createInteractionToken("D", interaction.user.id))
          .setPlaceholder("Gérer les Archives")
          .addOptions(options)
      )
    );
  }
  if (wishlistSkill && components.length < 5) {
    const pinnedIds = new Set(
      archiveState.pinnedMissingCards.map((card) => card.id)
    );
    const wishlistOptions = archiveState.wishlistDeckId && pinMissingSkill
      ? [
          {
            label: "Changer ou désactiver le deck",
            value: "clear",
            description: "Retire le deck et ses cartes épinglées"
          },
          ...missingWishlistCards.map((card) => ({
            label: `${pinnedIds.has(card.id) ? "✓ " : ""}${card.name}`.slice(0, 100),
            value: `pin|${card.id}`,
            description: `${card.rarity.name} · ${
              pinnedIds.has(card.id) ? "retirer l'épingle" : "épingler la carte"
            }`.slice(0, 100)
          }))
        ]
      : [
          {
            label: "Désactiver la liste de souhaits",
            value: "clear",
            description: "Retirer le deck ciblé"
          },
          ...decks.map((deck) => ({
            label: deck.name.slice(0, 100),
            value: deck.id,
            description: deck.id === archiveState.wishlistDeckId
              ? "Deck actuellement ciblé"
              : "Signaler ce deck dans les routes"
          }))
        ];
    components.push(
      new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId(createInteractionToken("W", interaction.user.id))
          .setPlaceholder(
            archiveState.wishlistDeckId && pinMissingSkill
              ? "Épingler jusqu'à 3 cartes manquantes"
              : "Choisir le deck de la liste de recherche"
          )
          .addOptions(wishlistOptions)
      )
    );
  }
  await interaction.editReply({
    embeds: [embed],
    files,
    components
  });
}

function conquerorTierLabel(tier: string) {
  const labels: Record<string, string> = {
    common: "Common",
    uncommon: "Uncommon",
    rare: "Rare",
    very_rare: "Very Rare",
    import: "Import",
    exotic: "Exotic"
  };
  return labels[tier] ?? tier;
}

const shopBoosterNames = {
  basic: "Booster Basic",
  rare: "Booster Rare",
  epic: "Booster Epic",
  legendary: "Booster Legendary"
} as const;

function boosterKeyFromToken(value: string) {
  return value.startsWith("booster.")
    ? value
    : `booster.boss_choice.${value}`;
}

export async function handleBoosterInventory(
  interaction: ButtonInteraction,
  user: any
) {
  const [current, legacy] = await Promise.all([
    prisma.userItem.findMany({
      where: {
        userId: user.id,
        quantity: { gt: 0 },
        item: {
          status: "PUBLISHED",
          type: "BOOSTER",
          contentKey: { startsWith: "booster.boss_choice." }
        }
      },
      include: { item: true },
      orderBy: { item: { contentKey: "asc" } }
    }),
    prisma.userBooster.findMany({
      where: { userId: user.id, quantity: { gt: 0 } },
      orderBy: { boosterType: "asc" }
    })
  ]);
  const options = [
    ...legacy.map((entry) => {
      const itemKey = `booster.${entry.boosterType}`;
      const rule = boosterSelectionRule(itemKey);
      return {
        label: shopBoosterNames[entry.boosterType],
        value: itemKey,
        description:
          `${rule.offered} proposées · ${rule.kept} gardée(s) · ×${entry.quantity}`.slice(0, 100)
      };
    }),
    ...current.map((entry) => {
      const rule = boosterSelectionRule(entry.item.contentKey);
      return {
        label: entry.item.name.slice(0, 100),
        value: entry.item.contentKey,
        description:
          `${rule.offered} proposées · ${rule.kept} gardée(s) · ×${entry.quantity}`.slice(0, 100)
      };
    })
  ];
  if (options.length === 0) {
    await handleItems(interaction, user, "Tu ne possèdes actuellement aucun booster à ouvrir.");
    return;
  }
  await interaction.editReply({
    embeds: [
      new EmbedBuilder()
        .setColor(0xe67e22)
        .setTitle("🎁 Ouvrir un booster")
        .setDescription(
          "Choisis le booster à ouvrir. Son tier détermine le nombre de cartes proposées. " +
          "Tu conserves toutes les cartes sélectionnées et **exactement deux cartes sont rejetées**.\n\n" +
          "Le booster n’est consommé qu’après ta confirmation finale."
        )
    ],
    components: [
      new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId(createInteractionToken("E", interaction.user.id))
          .setPlaceholder("Choisir un booster possédé")
          .addOptions(options)
      ),
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId(createInteractionToken("g", "items"))
          .setLabel("Retour à l’inventaire")
          .setStyle(ButtonStyle.Secondary)
      )
    ]
  });
}

async function showConquerorBoosterChoices(
  interaction: StringSelectMenuInteraction | ButtonInteraction,
  user: any,
  requestedItemKey: string,
  openingNumber?: number
) {
  const itemKey = boosterKeyFromToken(requestedItemKey);
  const prepared = await conquerorRewardService.prepareBoosterChoices(
    user.id,
    itemKey,
    openingNumber
  );
  if (prepared.claimed) {
    throw new AppError("Ce booster a déjà été ouvert.", 409);
  }
  const choiceLetters = prepared.choices.map((_, index) =>
    String.fromCharCode("A".charCodeAt(0) + index)
  );
  const embeds: EmbedBuilder[] = [];
  const files: AttachmentBuilder[] = [];
  for (const [index, choice] of prepared.choices.entries()) {
    const embed = new EmbedBuilder()
      .setColor(0xe67e22)
      .setTitle(`${choiceLetters[index]} · ${choice.card.name}`)
      .setDescription(
        `**${choice.card.rarity.name}** · ${choice.card.deck.name}\n` +
        `Variante visible : **${choice.variant.toUpperCase()}**`
      );
    files.push(...await attachCardImage(embed, choice.card, choice.variant));
    embeds.push(embed);
  }
  await interaction.editReply({
    content:
      `🎁 **${prepared.itemName}** — sélectionne exactement **${prepared.keepCount} carte(s)** ` +
      `parmi les **${prepared.choices.length}** propositions. Deux cartes seront rejetées. ` +
      "Le booster ne sera consommé qu'après ta confirmation.",
    embeds,
    files,
    components: [
      new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId(createInteractionToken(
            "Y",
            interaction.user.id,
            prepared.itemKey,
            prepared.openingNumber
          ))
          .setPlaceholder(`Garder ${prepared.keepCount} carte(s) · 2 seront rejetées`)
          .setMinValues(prepared.keepCount)
          .setMaxValues(prepared.keepCount)
          .addOptions(prepared.choices.map((choice, index) => ({
            label: `${choiceLetters[index]} · ${choice.card.name}`.slice(0, 100),
            value: String(index),
            description:
              `${choice.card.rarity.name} · ${choice.card.deck.name} · ${choice.variant}`.slice(0, 100)
          })))
      ),
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId(createInteractionToken("g", "items"))
          .setLabel("Annuler et revenir à l’inventaire")
          .setStyle(ButtonStyle.Secondary)
      )
    ]
  });
}

export async function handleConquerorRewardSelect(
  interaction: StringSelectMenuInteraction,
  user: any,
  itemKey: string
) {
  if (itemKey.startsWith("booster.")) {
    await showConquerorBoosterChoices(interaction, user, itemKey);
    return;
  }
  if (itemKey.startsWith("chest.boss_reward.")) {
    const reward = await conquerorRewardService.openChest(
      user.id,
      itemKey,
      `discord:${interaction.id}`
    );
    await handleItems(
      interaction,
      user,
      `✅ **${reward.itemName} ouvert !**\n` +
      `🎒 1× **${reward.consumableName}**\n` +
      `⭐ **${reward.xp} XP**\n` +
      `💳 **${reward.credits} crédits**` +
      (reward.levelsGained > 0
        ? `\n🌟 Niveau ${reward.resultingLevel} · +${reward.levelsGained} point(s) de compétence`
        : "")
    );
    return;
  }
  throw new AppError("Cette récompense ne peut pas être ouverte.", 400);
}

export async function handleConquerorBoosterPreview(
  interaction: ButtonInteraction | StringSelectMenuInteraction,
  user: any,
  requestedItemKey: string,
  openingNumber: number,
  selectedIndexes: number[]
) {
  const itemKey = boosterKeyFromToken(requestedItemKey);
  const prepared = await conquerorRewardService.prepareBoosterChoices(
    user.id,
    itemKey,
    openingNumber
  );
  const normalizedIndexes = [...new Set(selectedIndexes)].sort((left, right) => left - right);
  if (
    normalizedIndexes.length !== prepared.keepCount ||
    normalizedIndexes.some((index) => !prepared.choices[index])
  ) {
    throw new AppError(
      `Sélectionne exactement ${prepared.keepCount} carte(s).`,
      400
    );
  }
  const selectedChoices = normalizedIndexes.map((index) => prepared.choices[index]!);
  const embeds: EmbedBuilder[] = [];
  const files: AttachmentBuilder[] = [];
  for (const [index, choice] of selectedChoices.entries()) {
    const embed = new EmbedBuilder()
      .setColor(0xe67e22)
      .setTitle(`Carte conservée ${index + 1}/${selectedChoices.length} · ${choice.card.name}`)
      .setDescription(
        `**${choice.card.rarity.name}** · ${choice.card.deck.name}\n` +
        `Variante : **${choice.variant.toUpperCase()}**`
      );
    files.push(...await attachCardImage(embed, choice.card, choice.variant));
    embeds.push(embed);
  }
  await interaction.editReply({
    content:
      `Confirme pour recevoir ces **${selectedChoices.length} carte(s)**. ` +
      "Les deux cartes non sélectionnées seront rejetées et le booster sera consommé.",
    embeds,
    files,
    components: [
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId(createInteractionToken(
            "Q",
            interaction.user.id,
            itemKey,
            openingNumber,
            ...normalizedIndexes
          ))
          .setLabel(`Confirmer les ${selectedChoices.length} cartes`)
          .setEmoji("✅")
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId(createInteractionToken(
            "R",
            interaction.user.id,
            itemKey,
            openingNumber
          ))
          .setLabel("Modifier ma sélection")
          .setStyle(ButtonStyle.Secondary)
      )
    ]
  });
}

export async function handleConquerorBoosterConfirm(
  interaction: ButtonInteraction,
  user: any,
  requestedItemKey: string,
  openingNumber: number,
  selectedIndexes: number[]
) {
  const itemKey = boosterKeyFromToken(requestedItemKey);
  const reward = await conquerorRewardService.claimBoosterChoice(
    user.id,
    itemKey,
    openingNumber,
    selectedIndexes
  );
  const embeds: EmbedBuilder[] = [];
  const files: AttachmentBuilder[] = [];
  for (const [index, entry] of reward.cards.entries()) {
    const embed = new EmbedBuilder()
      .setColor(0x2ecc71)
      .setTitle(`✅ Carte obtenue ${index + 1}/${reward.cards.length} · ${entry.card.name}`)
      .setDescription(
        `**${entry.card.rarity.name}** · ${entry.card.deck.name} · ` +
        `**${entry.variant.toUpperCase()}**`
      );
    if (index === reward.cards.length - 1) {
      embed.setFooter({ text: `${reward.itemName} consommé · 2 cartes rejetées` });
    }
    files.push(...await attachCardImage(embed, entry.card, entry.variant));
    embeds.push(embed);
  }
  await interaction.editReply({
    content: `🎉 **${reward.cards.length} carte(s)** rejoignent ta collection.`,
    embeds,
    files,
    components: [
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId(createInteractionToken("g", "collection"))
          .setLabel("Voir ma collection")
          .setEmoji("🗃️")
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId(createInteractionToken("g", "items"))
          .setLabel("Retour aux objets")
          .setStyle(ButtonStyle.Secondary)
      )
    ]
  });
}

export async function handleConquerorBoosterBack(
  interaction: ButtonInteraction,
  user: any,
  itemKey: string,
  openingNumber: number
) {
  await showConquerorBoosterChoices(interaction, user, itemKey, openingNumber);
}

type ContractInteraction =
  | ChatInputCommandInteraction
  | ButtonInteraction
  | StringSelectMenuInteraction;

function contractTypeLabel(type: string) {
  return type === "DONATION" ? "Don de guilde" : "Recherche";
}

export async function handleContracts(
  interaction: ContractInteraction,
  user: any,
  notice?: string
) {
  if (!interaction.guildId) {
    await interaction.editReply("Le tableau des contrats est disponible dans un serveur.");
    return;
  }
  const [board, decks] = await Promise.all([
    collectionContractService.getBoard(interaction.guildId, user.id),
    collectionContractService.listDecks()
  ]);
  const contractLines = board.contracts.map((contract) =>
    `${contract.type === "DONATION" ? "🤝" : "🔎"} ` +
    `**${contract.card.name}** · ${contract.card.rarity.name} · ` +
    `${contract.requester.username}` +
    (contract.rewardCredits > 0 ? ` · **${contract.rewardCredits} cr**` : " · don") +
    ` · <t:${Math.floor(contract.expiresAt.getTime() / 1_000)}:R>`
  );
  const ownLines = board.ownContracts.map((contract) =>
    `• **${contract.card.name}** · ${contractTypeLabel(contract.type)} · ` +
    `<t:${Math.floor(contract.expiresAt.getTime() / 1_000)}:R>`
  );
  const embed = new EmbedBuilder()
    .setColor(0x16a085)
    .setTitle("📋 Tableau des contrats")
    .setDescription(
      `${notice ? `${notice}\n\n` : ""}` +
      (
        board.enabled
          ? `Table des contrats active : **${board.ownContracts.length}/${board.slotLimit}** slot(s).`
          : "Tu peux consulter et remplir les contrats. Débloque la spécialisation **Courtier** pour en publier."
      ) +
      `\nMise en relation privée : **${board.smartMatchOptIn ? "activée" : "désactivée"}**.` +
      (board.donationEnabled
        ? `\nRéseau de guilde : **${board.donationsRemaining}/3 dons** encore possibles aujourd'hui.`
        : "")
    )
    .addFields(
      {
        name: "Contrats ouverts sur ce serveur",
        value: contractLines.join("\n") || "Aucun contrat ouvert."
      },
      {
        name: "Tes contrats",
        value: ownLines.join("\n") || "Aucun contrat actif."
      }
    )
    .setFooter({
      text:
        "Un contrat dure 24 h • une recherche séquestre sa prime • remplir demande un doublon"
    });
  const components: Array<
    ActionRowBuilder<StringSelectMenuBuilder> | ActionRowBuilder<ButtonBuilder>
  > = [];
  if (board.enabled && board.ownContracts.length < board.slotLimit) {
    for (const [index, chunk] of Array.from(
      { length: Math.ceil(decks.length / 25) },
      (_, chunkIndex) => decks.slice(chunkIndex * 25, (chunkIndex + 1) * 25)
    ).entries()) {
      components.push(
        new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
          new StringSelectMenuBuilder()
            .setCustomId(createInteractionToken("S", interaction.user.id, index))
            .setPlaceholder(
              decks.length > 25
                ? `Chercher une carte · decks ${index * 25 + 1}–${index * 25 + chunk.length}`
                : "Choisir le deck de la carte recherchée"
            )
            .addOptions(chunk.map((deck) => ({
              label: deck.name.slice(0, 100),
              value: deck.id
            })))
        )
      );
    }
  }
  components.push(
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(createInteractionToken("M", interaction.user.id))
        .setLabel(
          board.smartMatchOptIn
            ? "Désactiver les alertes"
            : "Activer les alertes de doublons"
        )
        .setEmoji("🔔")
        .setStyle(board.smartMatchOptIn ? ButtonStyle.Secondary : ButtonStyle.Success)
    )
  );
  if (board.ownContracts.length > 0 && components.length < 5) {
    components.push(
      new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId(createInteractionToken("L", interaction.user.id))
          .setPlaceholder("Annuler un de mes contrats")
          .addOptions(board.ownContracts.map((contract) => ({
            label: contract.card.name.slice(0, 100),
            value: contract.id,
            description:
              `${contractTypeLabel(contract.type)} · remboursement ${
                contract.rewardCredits
              } crédits`.slice(0, 100)
          })))
      )
    );
  }
  await interaction.editReply({ embeds: [embed], components });
}

export async function handleContractDeckSelect(
  interaction: StringSelectMenuInteraction,
  user: any,
  deckId: string
) {
  const cards = await collectionContractService.listMissingCards(user.id, deckId);
  if (cards.length === 0) {
    await handleContracts(
      interaction,
      user,
      "✅ Tu possèdes déjà toutes les cartes publiées de ce deck."
    );
    return;
  }
  await interaction.editReply({
    embeds: [
      new EmbedBuilder()
        .setColor(0x16a085)
        .setTitle(`🔎 Carte manquante · ${cards[0]!.deck.name}`)
        .setDescription(
          "Choisis une carte. Tu décideras ensuite entre une prime séquestrée et, si débloqué, une demande de don."
        )
    ],
    components: [
      new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId(createInteractionToken("N", interaction.user.id, deckId))
          .setPlaceholder("Choisir une carte manquante")
          .addOptions(cards.map((card) => ({
            label: card.name.slice(0, 100),
            value: card.id,
            description: `${card.rarity.name} · ${card.deck.name}`.slice(0, 100)
          })))
      )
    ]
  });
}

export async function handleContractCardSelect(
  interaction: StringSelectMenuInteraction,
  user: any,
  cardId: string
) {
  if (!interaction.guildId) throw new AppError("Serveur requis.", 400);
  const [card, board] = await Promise.all([
    prisma.card.findFirst({
      where: { id: cardId, status: "PUBLISHED", isActive: true },
      include: { deck: true, rarity: true }
    }),
    collectionContractService.getBoard(interaction.guildId, user.id)
  ]);
  if (!card) throw new AppError("Carte introuvable.", 404);
  const embed = new EmbedBuilder()
    .setColor(0x16a085)
    .setTitle(`📋 Publier un contrat · ${card.name}`)
    .setDescription(
      `**${card.rarity.name}** · ${card.deck.name}\n\n` +
      "Pour une recherche, la prime choisie est retirée maintenant puis versée au joueur qui donne son doublon. " +
      "Elle est intégralement remboursée si le contrat est annulé ou expire."
    );
  const files = await attachCardImage(embed, card);
  const buttons = [
    new ButtonBuilder()
      .setCustomId(createInteractionToken("O", interaction.user.id, "s100", card.id))
      .setLabel("Prime 100")
      .setEmoji("💳")
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(createInteractionToken("O", interaction.user.id, "s500", card.id))
      .setLabel("Prime 500")
      .setEmoji("💳")
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(createInteractionToken("O", interaction.user.id, "s1000", card.id))
      .setLabel("Prime 1 000")
      .setEmoji("💳")
      .setStyle(ButtonStyle.Primary)
  ];
  if (board.donationEnabled) {
    buttons.push(
      new ButtonBuilder()
        .setCustomId(createInteractionToken("O", interaction.user.id, "d", card.id))
        .setLabel("Demander un don")
        .setEmoji("🤝")
        .setStyle(ButtonStyle.Success)
    );
  }
  await interaction.editReply({
    embeds: [embed],
    files,
    components: [new ActionRowBuilder<ButtonBuilder>().addComponents(...buttons)]
  });
}

export async function handleContractCreate(
  interaction: ButtonInteraction,
  user: any,
  mode: string,
  cardId: string
) {
  if (!interaction.guildId) throw new AppError("Serveur requis.", 400);
  const type = mode === "d" ? "DONATION" as const : "SEARCH" as const;
  const rewardCredits = type === "SEARCH"
    ? Number(mode.startsWith("s") ? mode.slice(1) : 0)
    : 0;
  const contract = await collectionContractService.createContract({
    discordGuildId: interaction.guildId,
    userId: user.id,
    cardId,
    type,
    rewardCredits,
    operationKey: `discord:${interaction.id}`
  });
  const channelId = contract.guild.config?.gameChannelId ?? interaction.channelId;
  try {
    const channel = await interaction.client.channels.fetch(channelId);
    if (!channel || !channel.isTextBased() || !("send" in channel)) {
      throw new Error("Salon texte inaccessible");
    }
    const embed = new EmbedBuilder()
      .setColor(type === "DONATION" ? 0x2ecc71 : 0x16a085)
      .setTitle(
        `${type === "DONATION" ? "🤝 Demande de don" : "🔎 Contrat de recherche"} · ` +
        contract.card.name
      )
      .setDescription(
        `<@${contract.requester.discordId}> recherche cette carte.\n` +
        `**${contract.card.rarity.name}** · ${contract.card.deck.name}\n` +
        (
          rewardCredits > 0
            ? `Prime séquestrée : **${rewardCredits} crédits**`
            : "Don de guilde : **+1 réputation sociale et +1 maîtrise serveur**"
        ) +
        `\nExpiration : <t:${Math.floor(contract.expiresAt.getTime() / 1_000)}:R>\n\n` +
        "Il faut posséder au moins deux copies ; la dernière copie et les Archives restent protégées."
      );
    const files = await attachCardImage(embed, contract.card);
    const message = await channel.send({
      allowedMentions: { users: [contract.requester.discordId] },
      embeds: [embed],
      files,
      components: [
        new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder()
            .setCustomId(createInteractionToken("K", contract.id))
            .setLabel(type === "DONATION" ? "Donner mon doublon" : "Remplir le contrat")
            .setEmoji(type === "DONATION" ? "🤝" : "✅")
            .setStyle(type === "DONATION" ? ButtonStyle.Success : ButtonStyle.Primary)
        )
      ]
    });
    await collectionContractService.attachMessage(contract.id, channelId, message.id);
  } catch (error) {
    await collectionContractService.cancelContract(contract.id, user.id);
    console.error("Unable to publish collection contract", error);
    throw new AppError(
      "Le salon de jeu n'est pas accessible : le contrat a été annulé et la prime remboursée.",
      409
    );
  }

  const matches = await collectionContractService.getSmartMatches(contract.id);
  await Promise.allSettled(matches.map(async (match) => {
    const discordUser = await interaction.client.users.fetch(match.discordId);
    await discordUser.send(
      `🔔 Un contrat privé correspond à l'un de tes doublons sur **${contract.guild.name}** : ` +
      `**${contract.card.name}** (${contract.card.rarity.name}). ` +
      "Ouvre le salon de jeu du serveur pour choisir librement si tu veux le remplir."
    );
  }));
  await handleContracts(
    interaction,
    user,
    `✅ Contrat publié pour **${contract.card.name}**` +
      (matches.length > 0 ? ` · ${matches.length} alerte(s) privée(s) envoyée(s).` : ".")
  );
}

export async function handleContractFulfill(
  interaction: ButtonInteraction,
  user: any,
  contractId: string
) {
  const result = await collectionContractService.fulfillContract(
    contractId,
    user.id,
    `discord:${interaction.id}`
  );
  if (!result.replayed) {
    await interaction.message.edit({
      content:
        `✅ Contrat rempli par <@${interaction.user.id}> : ` +
        `**${result.contract.card.name}** a été remise à ` +
        `<@${result.contract.requester.discordId}>.`,
      allowedMentions: {
        users: [interaction.user.id, result.contract.requester.discordId]
      },
      components: []
    }).catch(() => undefined);
    const requester = await interaction.client.users.fetch(
      result.contract.requester.discordId
    ).catch(() => null);
    await requester?.send(
      `✅ Ton contrat pour **${result.contract.card.name}** a été rempli sur ` +
      `**${result.contract.guild.name}**.`
    ).catch(() => undefined);
  }
  await interaction.editReply(
    `✅ Tu as donné **${result.contract.card.name}**` +
    (result.contract.rewardCredits > 0
      ? ` et reçu **${result.contract.rewardCredits} crédits**.`
      : " · +1 réputation sociale et progression de guilde.")
  );
}

export async function handleContractCancel(
  interaction: StringSelectMenuInteraction,
  user: any,
  contractId: string
) {
  const contract = await collectionContractService.cancelContract(contractId, user.id);
  if (contract.channelId && contract.messageId) {
    const channel = await interaction.client.channels.fetch(contract.channelId).catch(() => null);
    if (channel?.isTextBased() && "messages" in channel) {
      const message = await channel.messages.fetch(contract.messageId).catch(() => null);
      await message?.edit({
        content: `🚫 Contrat annulé : **${contract.card.name}**.`,
        components: []
      }).catch(() => undefined);
    }
  }
  await handleContracts(
    interaction,
    user,
    `🚫 Contrat **${contract.card.name}** annulé` +
      (contract.rewardCredits > 0
        ? ` · ${contract.rewardCredits} crédits remboursés.`
        : ".")
  );
}

export async function handleContractOptIn(
  interaction: ButtonInteraction,
  user: any
) {
  const enabled = await collectionContractService.toggleSmartMatchOptIn(user.id);
  await handleContracts(
    interaction,
    user,
    enabled
      ? "🔔 Alertes privées de mise en relation activées."
      : "🔕 Alertes privées de mise en relation désactivées."
  );
}

function bossMechanicDescription(mechanic: string) {
  const descriptions: Record<string, string> = {
    OFFERING: "Offrez des crédits. Les offrandes sont définitivement consommées.",
    HARMONIZATION: "Présentez vos cartes uniques du monde. Les cartes restent dans votre collection.",
    COLLECTIVE_COLLECTION: "Réunissez collectivement des cartes uniques du monde, sans les consommer.",
    HUNT: "Chaque capture réussie dans ce monde inflige automatiquement 1 point.",
    EXPEDITION_MINION: "Chaque créature capturée en exploration dans ce monde compte automatiquement."
  };
  return descriptions[mechanic] ?? "Contribuez collectivement pour vaincre ce boss.";
}

function bossCategoryLabel(category: string) {
  return {
    WORLD_GUARDIAN: "Gardien de monde",
    TREASURE_GUARDIAN: "Gardien de trésor",
    CARD_PREDATOR: "Prédateur de cartes",
    WORLD_INVADER: "Envahisseur de monde"
  }[category] ?? category;
}

export async function attachBossImage(embed: EmbedBuilder, definition: {
  contentKey: string;
  name: string;
  metadata: unknown;
}) {
  const metadata = definition.metadata;
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return [];
  const imageKey = (metadata as Record<string, unknown>).imageKey;
  const imageUrl = (metadata as Record<string, unknown>).imageUrl;
  const endpoint = process.env.S3_ENDPOINT?.replace(/\/+$/, "");
  const bucket = process.env.S3_BUCKET;
  if (typeof imageKey === "string" && endpoint && bucket) {
    try {
      const response = await fetch(`${endpoint}/${bucket}/${imageKey}`);
      if (response.ok) {
        const filename = `${definition.contentKey.replace(/[^a-zA-Z0-9._-]/g, "_")}.png`;
        embed.setImage(`attachment://${filename}`);
        return [
          new AttachmentBuilder(Buffer.from(await response.arrayBuffer()), { name: filename })
        ];
      }
    } catch (error) {
      console.warn(`Unable to attach boss image for ${definition.contentKey}`, error);
    }
  }
  if (typeof imageUrl === "string" && /^https?:\/\//i.test(imageUrl)) {
    embed.setImage(imageUrl);
  }
  return [];
}

export async function handleBoss(
  interaction: ChatInputCommandInteraction | ButtonInteraction | StringSelectMenuInteraction,
  user?: any,
  notice?: string,
  completedBossRunId?: string
) {
  if (!interaction.guildId) {
    await interaction.editReply("Cette commande doit être utilisée dans un serveur.");
    return;
  }
  const { guild, run } = await bossService.getGuildBoss(interaction.guildId);
  const completedRun = completedBossRunId && user
    ? await prisma.bossRun.findFirst({
        where: {
          id: completedBossRunId,
          guildId: guild.id,
          status: "DEFEATED"
        },
        include: {
          definition: { include: { world: true } },
          contributions: { where: { userId: user.id } },
          rewardGrants: { where: { userId: user.id } },
          _count: { select: { rewardGrants: true } }
        }
      })
    : null;
  const embed = new EmbedBuilder().setColor(0xc0392b).setTitle("🐲 Boss communautaire");

  if (completedRun) {
    const contribution = completedRun.contributions.reduce(
      (total, entry) => total + entry.amount,
      0
    );
    const grant = completedRun.rewardGrants[0];
    const defeatedTimestamp = completedRun.defeatedAt
      ? Math.floor(completedRun.defeatedAt.getTime() / 1_000)
      : null;
    const collectionVictory = ["HARMONIZATION", "COLLECTIVE_COLLECTION"]
      .includes(completedRun.mechanic);
    const nextWorld = completedRun.definition.kind === "GUARDIAN" &&
      guild.progress?.frontierWorldId !== completedRun.definition.worldId
      ? guild.progress?.frontierWorld?.name
      : null;

    embed
      .setColor(0x2ecc71)
      .setTitle(`🏆 ${completedRun.definition.name} vaincu !`)
      .setDescription(
        `${notice ? `**${notice}**\n\n` : ""}` +
        `✅ **Le boss a bien été détruit.**\n` +
        `${bossProgressBar(completedRun.progress, completedRun.targetSnapshot)}\n` +
        `**${completedRun.targetSnapshot}/${completedRun.targetSnapshot}** points communautaires` +
        (collectionVictory
          ? "\n\n🃏 Ta collection a seulement été présentée : **aucune carte n’a été consommée**."
          : "")
      )
      .addFields(
        {
          name: "Ta contribution finale",
          value:
            `**${contribution}** point(s) · ` +
            `**${completedRun.contributions.length}** action(s)`,
          inline: true
        },
        {
          name: "Participants récompensés",
          value: `**${completedRun._count.rewardGrants}**`,
          inline: true
        },
        {
          name: "Victoire enregistrée",
          value: defeatedTimestamp
            ? `<t:${defeatedTimestamp}:R>\n<t:${defeatedTimestamp}:F>`
            : "À l’instant",
          inline: true
        },
        {
          name: "Tes récompenses",
          value: grant
            ? bossVictoryRewardDescription(grant.reward)
            : "Aucune récompense individuelle : le seuil minimal de participation n’a pas été atteint."
        }
      )
      .setFooter({
        text: "Les récompenses ont été versées automatiquement · utilise le bouton pour voir la suite"
      });

    if (nextWorld) {
      embed.addFields({
        name: "🌍 Monde suivant débloqué",
        value: `**${nextWorld}** est maintenant le monde en cours de progression.`
      });
    }

    const files = await attachBossImage(embed, completedRun.definition);
    await interaction.editReply({
      embeds: [embed],
      files,
      components: [
        new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder()
            .setCustomId(createInteractionToken(
              "j", "next", completedRun.id, interaction.user.id
            ))
            .setLabel("Voir la suite")
            .setEmoji("🌍")
            .setStyle(ButtonStyle.Primary)
        )
      ]
    });
    return;
  }

  const guardian = !run && guild.progress?.frontierWorldId
    ? await prisma.bossDefinition.findFirst({
        where: {
          status: "PUBLISHED",
          kind: "GUARDIAN",
          worldId: guild.progress.frontierWorldId
        },
        orderBy: { contentKey: "asc" }
      })
    : null;
  if (!run) {
    const mastery = Math.max(0, guild.progress?.mastery ?? 0);
    const masteryTarget = Math.max(0, guild.progress?.masteryTarget ?? 0);
    const masteryRemaining = Math.max(0, masteryTarget - mastery);
    const currentWorld = guild.progress?.frontierWorld?.name ?? "Monde actuel";
    const unlockedWorldCount = Math.max(0, guild.progress?.unlockedWorldCount ?? 0);
    const progressionEnabled = guild.config?.progressionBossEnabled !== false;
    const guardianReady =
      guardian &&
      progressionEnabled &&
      guild.progress?.state === "BOSS_READY";
    const automaticEnabled =
      guardianReady ||
      guild.config?.regularBossEnabled !== false;
    const nextSlot = automaticEnabled
      ? nextDailyBossSlot(
          new Date(),
          guild.config?.timezone ?? "Europe/Paris"
        )
      : null;
    const nextSlotTimestamp = nextSlot
      ? Math.floor(nextSlot.getTime() / 1_000)
      : null;
    const countdown = nextSlotTimestamp
      ? `\n\n⏳ **Prochain créneau : <t:${nextSlotTimestamp}:R>**\n` +
        `📅 <t:${nextSlotTimestamp}:F>`
      : "\n\n⏸️ Les boss automatiques sont désactivés sur ce serveur.";
    embed
      .setDescription(
        `Aucun boss actif.\n\n` +
        (guardianReady
          ? `✅ Le seuil est atteint : le prochain boss sera le gardien **${guardian.name}**.`
          : guardian
            ? `Le gardien **${guardian.name}** apparaîtra lorsque ce monde aura atteint 100 %. ` +
              "En attendant, le prochain cycle choisira un boss standard."
            : "Le prochain cycle choisira un boss standard.") +
        `\n\nChaque boss apparaît à minuit et reste actif pendant 24 heures.${countdown}`
      )
      .addFields({
        name: `🌍 Progression du monde · ${currentWorld}`,
        value: masteryTarget > 0
          ? `${bossProgressBar(mastery, masteryTarget)}\n` +
            `**${mastery}/${masteryTarget}** points de maîtrise` +
            (masteryRemaining > 0
              ? ` · encore **${masteryRemaining}** avant le gardien`
              : " · **gardien prêt**") +
            `\nMondes débloqués : **${unlockedWorldCount}/9**` +
            (progressionEnabled
              ? ""
              : "\n⏸️ Les gardiens de progression sont désactivés sur ce serveur.")
          : "La progression de ce monde n’est pas encore initialisée."
      });
    await interaction.editReply({ embeds: [embed], components: [] });
    return;
  }

  const reward = run.rewardSnapshot && typeof run.rewardSnapshot === "object"
    && !Array.isArray(run.rewardSnapshot)
    ? run.rewardSnapshot as Record<string, unknown>
    : {};
  const conquerorRates =
    reward.conquerorDropRates &&
    typeof reward.conquerorDropRates === "object" &&
    !Array.isArray(reward.conquerorDropRates)
      ? reward.conquerorDropRates as Record<string, unknown>
      : {};
  const objectiveSnapshot = objectRecord(run.objectiveSnapshot);
  const offeringObjectives = objectRecord(objectiveSnapshot.offeringObjectives);
  const creditObjective = objectRecord(offeringObjectives.credits);
  const fragmentObjective = objectRecord(offeringObjectives.fragments);
  const cardObjective = objectRecord(offeringObjectives.duplicateCards);
  const specialOfferings = objectRecord(objectiveSnapshot.specialOfferings);
  const minimumContribution = Math.max(1, Math.ceil(run.targetSnapshot * 0.01));
  const participantCount = new Set(run.contributions.map((entry) => entry.userId)).size;
  const collectionBoss = ["HARMONIZATION", "COLLECTIVE_COLLECTION"].includes(run.mechanic);
  const [userContribution, collectionRequirement] = user
    ? await Promise.all([
        bossService.getUserContribution(run.id, user.id),
        collectionBoss
          ? bossService.getCollectionRequirement({
              bossRunId: run.id,
              userId: user.id
            })
          : Promise.resolve(null)
      ])
    : [null, null];
  embed
    .setTitle(`🐲 ${run.definition.name}`)
    .setDescription(
      `${notice ? `**${notice}**\n\n` : ""}` +
      `${bossMechanicDescription(run.mechanic)}\n\n` +
      `${bossProgressBar(run.progress, run.targetSnapshot)}\n` +
      `**${run.progress}/${run.targetSnapshot}** points`
    )
    .addFields(
      { name: "État", value: run.status === "ACTIVE" ? "Actif" : "Planifié", inline: true },
      { name: "Monde", value: run.definition.world?.name ?? "Inconnu", inline: true },
      { name: "Catégorie", value: bossCategoryLabel(run.category), inline: true },
      {
        name: "Tier de l’apparition",
        value: conquerorTierLabel(String(reward.conquerorTier ?? "common")),
        inline: true
      },
      { name: "Participants", value: String(participantCount), inline: true },
      {
        name: "Récompense par participant actif",
        value:
          `${Number(reward.credits ?? 0)} crédits · ${Number(reward.xp ?? 0)} XP · ` +
          `${Number(reward.fragments ?? 0)} fragment(s)\n` +
          `Conquérant ${conquerorTierLabel(String(reward.conquerorTier ?? "common"))} : ` +
          `${Math.round(Number(conquerorRates.booster ?? 0) * 100)} % booster · ` +
          `${Math.round(Number(conquerorRates.chest ?? 0) * 100)} % coffre\n` +
          `Éligibilité : ${minimumContribution} point(s) ou une offrande majeure`
      },
      {
        name: run.status === "ACTIVE" ? "Fin du boss" : "Apparition du boss",
        value: (() => {
          const timestamp = Math.floor(
            (run.status === "ACTIVE" ? run.endsAt : run.startsAt).getTime() / 1_000
          );
          return `<t:${timestamp}:R>\n<t:${timestamp}:F>`;
        })(),
        inline: true
      },
      {
        name: "Ta contribution",
        value: userContribution
          ? `${userContribution.amount} point(s) · ${userContribution.actions} action(s) · ` +
            (
              userContribution.amount >= minimumContribution ||
              userContribution.majorAction
                ? "✅ récompense"
                : `▫️ encore ${minimumContribution - userContribution.amount} point(s)`
            )
          : "Ouvre ce boss depuis ton profil de joueur.",
        inline: true
      }
    )
    .setFooter({
      text: run.definition.kind === "GUARDIAN"
        ? "Gardien de progression · la victoire débloque le monde suivant"
        : "Boss standard · seuls les participants actifs reçoivent la récompense"
    });

  if (collectionRequirement) {
    embed.addFields({
      name: "🎯 Demande exacte",
      value:
        `**${collectionRequirement.requirementLabel}**\n` +
        `Le boss accepte n’importe quelle carte publiée de ce périmètre : ` +
        `il ne demande pas une liste fixe de noms.\n` +
        `Normal, shiny et holo d’une même carte ne comptent qu’une seule fois. ` +
        `Les cartes ne sont pas consommées.\n\n` +
        `**Communauté :** ${collectionRequirement.progress}/${collectionRequirement.target} · ` +
        `${collectionRequirement.remaining} encore requise(s)\n` +
        `**Toi :** ${collectionRequirement.ownedCount}/${collectionRequirement.eligibleCount} compatibles · ` +
        `${collectionRequirement.presentableCount} présentable(s) maintenant`
    });
  }

  if (run.mechanic === "OFFERING" && Number(creditObjective.target ?? 0) > 0) {
    const specialLines = [
      ["funeralCandle", "Cierges funéraires"],
      ["silverTear", "Larmes d’argent"],
      ["brokenMask", "Masques brisés"]
    ].flatMap(([key, label]) => {
      const state = objectRecord(specialOfferings[key]);
      const required = Number(state.required ?? 0);
      return required > 0
        ? [`${label} : **${Number(state.deposited ?? 0)}/${required}**`]
        : [];
    });
    const mask = objectRecord(specialOfferings.brokenMask);
    embed.addFields({
      name: "🎯 Besoins exacts — tout doit être rempli",
      value:
        `Crédits : **${Number(creditObjective.contributed ?? 0)}/${Number(creditObjective.target ?? 0)}**\n` +
        `Fragments : **${Number(fragmentObjective.contributed ?? 0)}/${Number(fragmentObjective.target ?? 0)}** ` +
        `(${Number(fragmentObjective.pointValue ?? 0)} points chacun)\n` +
        `Doublons de ${String(cardObjective.worldLabel ?? "ce monde")} : ` +
        `**${Number(cardObjective.contributed ?? 0)}/${Number(cardObjective.target ?? 0)}**\n` +
        (specialLines.length ? `${specialLines.join("\n")}\n` : "") +
        (Number(mask.required ?? 0) > 0
          ? `Source du Masque : **${String(mask.sourceLabel ?? "non définie")}** ` +
            `(taux de base ${(Number(mask.baseDropRate ?? 0) * 100).toLocaleString("fr-FR")} %)\n`
          : "") +
        "Les crédits, fragments, cartes et offrandes déposés sont définitivement consommés."
    });
  }
  const worldEffect = objectRecord(objectiveSnapshot.worldEffect);
  if (run.category === "WORLD_INVADER" && worldEffect.effectKey) {
    embed.addFields({
      name: "🌑 Effet d’invasion actif",
      value:
        `Les entrées premium de ${String(worldEffect.worldLabel ?? "ce monde")} ` +
        `coûtent ×${Number(worldEffect.multiplier ?? 1)} crédits. ` +
        "L’effet disparaît automatiquement à la victoire ou à l’expiration du boss."
    });
  }

  const files = await attachBossImage(embed, run.definition);
  const components: ActionRowBuilder<ButtonBuilder>[] = [];
  if (run.status === "ACTIVE" && user) {
    const row = new ActionRowBuilder<ButtonBuilder>();
    if (run.mechanic === "OFFERING") {
      row.addComponents(
        new ButtonBuilder()
          .setCustomId(createInteractionToken(
            "j", "offerings", run.id, interaction.user.id
          ))
          .setLabel("Contribuer")
          .setEmoji("💰")
          .setStyle(ButtonStyle.Danger)
      );
    } else if (["HARMONIZATION", "COLLECTIVE_COLLECTION"].includes(run.mechanic)) {
      row.addComponents(
        new ButtonBuilder()
          .setCustomId(createInteractionToken(
            "j", "cards", run.id, interaction.user.id, 0
          ))
          .setLabel("Choisir mes cartes")
          .setEmoji("🔎")
          .setStyle(ButtonStyle.Primary)
      );
    }
    row.addComponents(
      new ButtonBuilder()
        .setCustomId(createInteractionToken(
          "j", "items", run.id, interaction.user.id
        ))
        .setLabel("Objets de boss")
        .setEmoji("🎒")
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId(createInteractionToken(
          "j", "mine", run.id, interaction.user.id
        ))
        .setLabel("Actualiser ma contribution")
        .setStyle(ButtonStyle.Secondary)
    );
    components.push(row);
  }
  await interaction.editReply({ embeds: [embed], components, files });
}

async function handleBossOfferingMenu(
  interaction: ButtonInteraction,
  bossRunId: string,
  user: any,
  notice?: string
) {
  const preview = await bossService.getOfferingContributionPreview({
    bossRunId,
    userId: user.id
  });
  const creditsRemaining = Math.max(
    0,
    preview.objectives.credits.target - preview.objectives.credits.contributed
  );
  const fragmentsRemaining = Math.max(
    0,
    preview.objectives.fragments.target - preview.objectives.fragments.contributed
  );
  const cardsRemaining = Math.max(
    0,
    preview.objectives.duplicateCards.target -
      preview.objectives.duplicateCards.contributed
  );
  const candidate = preview.duplicateCard;
  await interaction.editReply({
    embeds: [
      new EmbedBuilder()
        .setColor(0xc0392b)
        .setTitle("🔥 Autel des contributions")
        .setDescription(
          `${notice ? `**${notice}**\n\n` : ""}` +
          "Choisis une ressource à préparer. Une confirmation séparée affichera exactement " +
          "ce qui sera détruit avant toute consommation."
        )
        .addFields(
          {
            name: "Besoins restants",
            value:
              `Crédits : **${creditsRemaining}**\n` +
              `Fragments : **${fragmentsRemaining}**\n` +
              `Doublons de ${preview.objectives.duplicateCards.worldLabel} : **${cardsRemaining}**`
          },
          {
            name: "Tes ressources",
            value:
              `${preview.user.credits} crédits · ${preview.user.fragments} fragments\n` +
              (candidate
                ? `Doublon proposé : **${candidate.name}** (${candidate.deckName}, ` +
                  `${candidate.rarity}, ${candidate.variant})`
                : "Aucun doublon non archivé compatible. La dernière copie n’est jamais proposée.")
          }
        )
    ],
    components: [
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId(createInteractionToken(
            "j", "pc100", bossRunId, interaction.user.id
          ))
          .setLabel("Préparer 100 crédits")
          .setStyle(ButtonStyle.Danger)
          .setDisabled(creditsRemaining < 1 || preview.user.credits < 1),
        new ButtonBuilder()
          .setCustomId(createInteractionToken(
            "j", "pc500", bossRunId, interaction.user.id
          ))
          .setLabel("Préparer 500 crédits")
          .setStyle(ButtonStyle.Danger)
          .setDisabled(creditsRemaining < 1 || preview.user.credits < 1),
        new ButtonBuilder()
          .setCustomId(createInteractionToken(
            "j", "pf1", bossRunId, interaction.user.id
          ))
          .setLabel("Préparer 1 fragment")
          .setStyle(ButtonStyle.Danger)
          .setDisabled(fragmentsRemaining < 1 || preview.user.fragments < 1),
        new ButtonBuilder()
          .setCustomId(createInteractionToken(
            "j", "pf5", bossRunId, interaction.user.id
          ))
          .setLabel("Préparer 5 fragments")
          .setStyle(ButtonStyle.Danger)
          .setDisabled(fragmentsRemaining < 1 || preview.user.fragments < 1),
        new ButtonBuilder()
          .setCustomId(createInteractionToken(
            "j", "pd", bossRunId, interaction.user.id
          ))
          .setLabel("Préparer 1 doublon")
          .setStyle(ButtonStyle.Danger)
          .setDisabled(cardsRemaining < 1 || !candidate)
      ),
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId(createInteractionToken(
            "j", "back", bossRunId, interaction.user.id
          ))
          .setLabel("Retour au boss")
          .setStyle(ButtonStyle.Secondary)
      )
    ]
  });
}

async function handleBossContributionConfirmation(
  interaction: ButtonInteraction,
  bossRunId: string,
  user: any,
  action: string
) {
  const preview = await bossService.getOfferingContributionPreview({
    bossRunId,
    userId: user.id
  });
  let summary: string;
  if (action.startsWith("pc")) {
    const requested = Number(action.slice(2));
    const quantity = Math.min(
      requested,
      preview.user.credits,
      Math.max(
        0,
        preview.objectives.credits.target -
          preview.objectives.credits.contributed
      )
    );
    if (quantity < 1) throw new AppError("Aucun crédit ne peut être offert.", 409);
    summary = `**${quantity} crédits**`;
  } else if (action.startsWith("pf")) {
    const requested = Number(action.slice(2));
    const quantity = Math.min(
      requested,
      preview.user.fragments,
      Math.max(
        0,
        preview.objectives.fragments.target -
          preview.objectives.fragments.contributed
      )
    );
    if (quantity < 1) throw new AppError("Aucun fragment ne peut être offert.", 409);
    summary =
      `**${quantity} fragment(s)** — ` +
      `${quantity * preview.objectives.fragments.pointValue} points de boss`;
  } else {
    const card = preview.duplicateCard;
    if (!card) {
      throw new AppError("Aucun doublon non archivé compatible.", 409);
    }
    summary =
      `**${card.name}** · ${card.deckName} · ${card.rarity} · ${card.variant}\n` +
      "Il restera au moins un exemplaire de cette carte dans ta collection.";
  }
  const confirmAction = `x${action.slice(1)}`;
  await interaction.editReply({
    embeds: [
      new EmbedBuilder()
        .setColor(0xe67e22)
        .setTitle("⚠️ Confirmer l’offrande")
        .setDescription(
          `Tu vas sacrifier définitivement :\n\n${summary}\n\n` +
          "Cette ressource ne sera pas remboursée si le boss expire ou échoue."
        )
    ],
    components: [
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId(createInteractionToken(
            "j", confirmAction, bossRunId, interaction.user.id
          ))
          .setLabel("Confirmer le sacrifice")
          .setStyle(ButtonStyle.Danger),
        new ButtonBuilder()
          .setCustomId(createInteractionToken(
            "j", "offerings", bossRunId, interaction.user.id
          ))
          .setLabel("Annuler")
          .setStyle(ButtonStyle.Secondary)
      )
    ]
  });
}

async function handleBossItems(
  interaction: ButtonInteraction,
  bossRunId: string,
  user: any
) {
  const itemDefinitions = [
    ["banner", "consumable.rally_banner", "Bannière", "🏳️"],
    ["candle", "offering.funeral_candle", "Cierge", "🕯️"],
    ["tear", "offering.silver_tear", "Larme", "💧"],
    ["mask", "offering.broken_mask", "Masque", "🎭"],
    ["flower", "offering.void_flower", "Fleur", "🌑"]
  ] as const;
  const [owned, run] = await Promise.all([
    prisma.userItem.findMany({
      where: {
        userId: user.id,
        item: { contentKey: { in: itemDefinitions.map((entry) => entry[1]) } }
      },
      include: { item: true }
    }),
    prisma.bossRun.findUniqueOrThrow({
      where: { id: bossRunId },
      select: { objectiveSnapshot: true }
    })
  ]);
  const quantities = new Map(owned.map((entry) => [entry.item.contentKey, entry.quantity]));
  const specialOfferings = objectRecord(
    objectRecord(run.objectiveSnapshot).specialOfferings
  );
  const requirementState = (action: string) => {
    const key = {
      candle: "funeralCandle",
      tear: "silverTear",
      mask: "brokenMask",
      flower: "voidFlower"
    }[action];
    return key ? objectRecord(specialOfferings[key]) : {};
  };
  const offeringUseful = (action: string) => {
    if (action === "banner") return true;
    const state = requirementState(action);
    const maximum = Number(state.required ?? state.maximum ?? 0);
    return maximum > 0 && Number(state.deposited ?? 0) < maximum;
  };
  const candle = requirementState("candle");
  const tear = requirementState("tear");
  const mask = requirementState("mask");
  const flower = requirementState("flower");
  await interaction.editReply({
    embeds: [
      new EmbedBuilder()
        .setColor(0xc0392b)
        .setTitle("🎒 Objets et offrandes de boss")
        .setDescription(
          "**Bannière :** +20 % de progression serveur pendant 15 min (recharge serveur 60 min).\n" +
          `**Cierge :** ${Number(candle.deposited ?? 0)}/${Number(candle.required ?? 0)} — ` +
          "désactive la protection lorsque le seuil affiché est atteint.\n" +
          `**Larme :** ${Number(tear.deposited ?? 0)}/${Number(tear.required ?? 0)} — ` +
          "révèle la phase et dissipe les illusions.\n" +
          `**Masque :** ${Number(mask.deposited ?? 0)}/${Number(mask.required ?? 0)} — ` +
          `source exigée : ${String(mask.sourceLabel ?? "aucune")}.\n` +
          `**Fleur :** ${Number(flower.deposited ?? 0)}/${Number(flower.maximum ?? 3)} — ` +
          "+5 % de durée initiale, minimum 5 min.\n\n" +
          "Les boutons inutiles sont désactivés. Chaque offrande passe par une confirmation."
        )
    ],
    components: [
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        ...itemDefinitions.map(([action, itemKey, label, emoji]) =>
          new ButtonBuilder()
            .setCustomId(createInteractionToken(
              "j", action === "banner" ? "item-banner" : `pi-${action}`,
              bossRunId, interaction.user.id
            ))
            .setLabel(`${label} (${quantities.get(itemKey) ?? 0})`)
            .setEmoji(emoji)
            .setStyle(action === "banner" ? ButtonStyle.Success : ButtonStyle.Danger)
            .setDisabled(
              (quantities.get(itemKey) ?? 0) < 1 || !offeringUseful(action)
            )
        )
      ),
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId(createInteractionToken(
            "j", "back", bossRunId, interaction.user.id
          ))
          .setLabel("Retour au boss")
          .setStyle(ButtonStyle.Secondary)
      )
    ]
  });
}

async function handleBossItemConfirmation(
  interaction: ButtonInteraction,
  bossRunId: string,
  action: string
) {
  const shortKey = action.slice(3);
  const labels: Record<string, string> = {
    candle: "Cierge funéraire",
    tear: "Larme d’argent",
    mask: "Masque brisé",
    flower: "Fleur du Néant"
  };
  const label = labels[shortKey];
  if (!label) throw new AppError("Offrande de boss inconnue.", 400);
  const run = await prisma.bossRun.findUniqueOrThrow({
    where: { id: bossRunId },
    select: { objectiveSnapshot: true, endsAt: true }
  });
  const specials = objectRecord(
    objectRecord(run.objectiveSnapshot).specialOfferings
  );
  const stateKey = {
    candle: "funeralCandle",
    tear: "silverTear",
    mask: "brokenMask",
    flower: "voidFlower"
  }[shortKey]!;
  const state = objectRecord(specials[stateKey]);
  const maximum = Number(state.required ?? state.maximum ?? 0);
  const deposited = Number(state.deposited ?? 0);
  if (maximum < 1 || deposited >= maximum) {
    throw new AppError("Cette offrande n'est plus utile à ce boss.", 409);
  }
  const sourceLine = shortKey === "mask"
    ? `\nSource exigée : **${String(state.sourceLabel ?? "non définie")}**.`
    : "";
  await interaction.editReply({
    embeds: [
      new EmbedBuilder()
        .setColor(0xe67e22)
        .setTitle("⚠️ Confirmer l’offrande de boss")
        .setDescription(
          `Tu vas déposer définitivement **1 ${label}**.\n` +
          `Progression de cette offrande : **${deposited}/${maximum}**.${sourceLine}\n\n` +
          "Elle sera liée à cette instance, ne pourra pas être retirée et sera perdue en cas d’échec."
        )
    ],
    components: [
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId(createInteractionToken(
            "j", `xi-${shortKey}`, bossRunId, interaction.user.id
          ))
          .setLabel("Confirmer le dépôt")
          .setStyle(ButtonStyle.Danger),
        new ButtonBuilder()
          .setCustomId(createInteractionToken(
            "j", "items", bossRunId, interaction.user.id
          ))
          .setLabel("Annuler")
          .setStyle(ButtonStyle.Secondary)
      )
    ]
  });
}

async function handleBossCollectionRequirement(
  interaction: ButtonInteraction,
  bossRunId: string,
  user: any,
  requestedPage: number
) {
  const requirement = await bossService.getCollectionRequirement({
    bossRunId,
    userId: user.id,
    page: requestedPage,
    pageSize: 8
  });
  const lines = requirement.cards.map((card) => {
    const state = card.presented
      ? "✅"
      : card.owned
        ? "🟢"
        : "⚫";
    return `${state} **${card.name}** · ${card.deck.name} · ${card.rarity.name}`;
  });
  const embed = new EmbedBuilder()
    .setColor(0xc0392b)
    .setTitle(`🃏 Cartes acceptées · ${requirement.bossName}`)
    .setDescription(
      `**Demande exacte : ${requirement.requirementLabel}.**\n\n` +
      `Il n’exige pas des cartes nommées à l’avance : toute carte ci-dessous est valide. ` +
      `Une carte ne compte qu’une fois pour la communauté, quelle que soit sa variante.`
    )
    .addFields(
      {
        name: "Progression communautaire",
        value:
          `${bossProgressBar(requirement.progress, requirement.target)}\n` +
          `**${requirement.progress}/${requirement.target}** · ` +
          `${requirement.remaining} encore requise(s)`
      },
      {
        name: "Ta collection compatible",
        value:
          `**${requirement.ownedCount}/${requirement.eligibleCount}** carte(s) possédée(s) · ` +
          `**${requirement.presentableCount}** présentable(s) maintenant`
      },
      {
        name: `Catalogue accepté · page ${requirement.page + 1}/${requirement.totalPages}`,
        value: lines.join("\n\n") || "Aucune carte compatible."
      }
    )
    .setFooter({
      text: "🟢 possédée et disponible · ✅ déjà comptée · ⚫ non possédée"
    });

  const components: Array<
    ActionRowBuilder<StringSelectMenuBuilder> | ActionRowBuilder<ButtonBuilder>
  > = [];
  const presentableCards = requirement.cards.filter((card) => card.owned && !card.presented);
  if (
    requirement.status === "ACTIVE" &&
    requirement.remaining > 0 &&
    presentableCards.length > 0
  ) {
    components.push(
      new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId(createInteractionToken(
            "K", interaction.user.id, bossRunId, requirement.page
          ))
          .setPlaceholder("Choisir précisément les cartes à présenter")
          .setMinValues(1)
          .setMaxValues(Math.min(5, requirement.remaining, presentableCards.length))
          .addOptions(presentableCards.map((card) => ({
            label: card.name.slice(0, 100),
            value: card.id,
            description: `${card.deck.name} · ${card.rarity.name}`.slice(0, 100),
            emoji: "🃏"
          })))
      )
    );
  }
  if (requirement.totalPages > 1) {
    components.push(
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId(createInteractionToken(
            "j", "cards", bossRunId, interaction.user.id, requirement.page - 1
          ))
          .setLabel("Précédent")
          .setEmoji("⬅️")
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(requirement.page === 0),
        new ButtonBuilder()
          .setCustomId(createInteractionToken(
            "j", "cards", bossRunId, interaction.user.id, requirement.page + 1
          ))
          .setLabel("Suivant")
          .setEmoji("➡️")
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(requirement.page >= requirement.totalPages - 1)
      )
    );
  }
  components.push(
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(createInteractionToken(
          "j", "back", bossRunId, interaction.user.id
        ))
        .setLabel("Retour au boss")
        .setStyle(ButtonStyle.Secondary)
    )
  );
  await interaction.editReply({ embeds: [embed], components });
}

export async function handleBossCardSelect(
  interaction: StringSelectMenuInteraction,
  parts: string[]
) {
  const [boundUserId, bossRunId] = parts;
  if (!boundUserId || !bossRunId || boundUserId !== interaction.user.id) {
    throw new AppError("Cette sélection de boss appartient à un autre joueur.", 403);
  }
  await interaction.deferUpdate();
  const user = await usersService.getOrCreateDiscordUser(
    interaction.user.id,
    interaction.user.username,
    interaction.user.displayAvatarURL()
  );
  const result = await bossService.presentCollection({
    bossRunId,
    userId: user.id,
    operationKey: `discord:${interaction.id}:boss-collection`,
    cardIds: interaction.values
  });
  const cardNames = result.cards.join(", ");
  const notice =
    `${result.amount} carte(s) choisie(s) présentée(s) : ${cardNames}. ` +
    `Aucune carte n'a été consommée.`;
  await handleBoss(interaction, user, notice, bossRunId);
}

export async function handleBossButton(
  interaction: ButtonInteraction,
  parts: string[]
) {
  const [action, bossRunId, boundUserId, amountRaw] = parts;
  if (!action || !bossRunId || !boundUserId) {
    throw new AppError("Action de boss invalide.", 400);
  }
  if (boundUserId !== interaction.user.id) {
    throw new AppError("Ce panneau de boss appartient à un autre joueur.", 403);
  }
  await interaction.deferUpdate();
  const user = await usersService.getOrCreateDiscordUser(
    interaction.user.id,
    interaction.user.username,
    interaction.user.displayAvatarURL()
  );
  if (action === "cards") {
    await handleBossCollectionRequirement(
      interaction,
      bossRunId,
      user,
      Number(amountRaw ?? 0)
    );
    return;
  }
  if (action === "offerings") {
    await handleBossOfferingMenu(interaction, bossRunId, user);
    return;
  }
  if (/^p(?:c\d+|f\d+|d)$/.test(action)) {
    await handleBossContributionConfirmation(interaction, bossRunId, user, action);
    return;
  }
  if (/^x(?:c\d+|f\d+|d)$/.test(action)) {
    let notice: string;
    if (action.startsWith("xc")) {
      const amount = Number(action.slice(2));
      const result = await bossService.contributeCredits({
        bossRunId,
        userId: user.id,
        amount,
        operationKey: `discord:${interaction.id}:boss-credits`
      });
      notice = `${result.amount} crédits offerts au boss.`;
    } else if (action.startsWith("xf")) {
      const quantity = Number(action.slice(2));
      const result = await bossService.contributeFragments({
        bossRunId,
        userId: user.id,
        quantity,
        operationKey: `discord:${interaction.id}:boss-fragments`
      });
      notice = `${result.quantity} fragment(s) offert(s) · +${result.progressAdded} points.`;
    } else {
      const result = await bossService.contributeDuplicateCard({
        bossRunId,
        userId: user.id,
        operationKey: `discord:${interaction.id}:boss-card`
      });
      notice = `${result.cardName} (${result.variant}) sacrifiée · +${result.progressAdded} points.`;
    }
    await handleBoss(interaction, user, notice, bossRunId);
    return;
  }
  if (/^pi-(?:candle|tear|mask|flower)$/.test(action)) {
    await handleBossItemConfirmation(interaction, bossRunId, action);
    return;
  }
  if (action === "items") {
    await handleBossItems(interaction, bossRunId, user);
    return;
  }
  if (action === "back") {
    await handleBoss(interaction, user, undefined, bossRunId);
    return;
  }
  if (action === "next") {
    await handleBoss(interaction, user);
    return;
  }
  let notice = "Progression actualisée.";
  if (action === "item-banner") {
    const result = await bossService.activateRallyBanner({
      bossRunId,
      userId: user.id,
      operationKey: `discord:${interaction.id}:boss-banner`
    });
    notice = result.expiresAt
      ? `Bannière active jusqu'à <t:${Math.floor(result.expiresAt.getTime() / 1000)}:R>.`
      : "Bannière déjà activée.";
  } else if (action.startsWith("xi-")) {
    const itemKeys = {
      "xi-candle": "offering.funeral_candle",
      "xi-tear": "offering.silver_tear",
      "xi-mask": "offering.broken_mask",
      "xi-flower": "offering.void_flower"
    } as const;
    const itemKey = itemKeys[action as keyof typeof itemKeys];
    if (!itemKey) throw new AppError("Offrande de boss inconnue.", 400);
    const result = await bossService.useBossOffering({
      bossRunId,
      userId: user.id,
      itemKey,
      operationKey: `discord:${interaction.id}:boss-offering`
    });
    notice =
      `Offrande appliquée : ${result.effect}` +
      (result.required > 0
        ? ` · ${result.deposited}/${result.required}.`
        : ".");
  } else if (action === "credits") {
    const amount = Number(amountRaw);
    if (!Number.isSafeInteger(amount) || amount <= 0) {
      throw new AppError("Montant d’offrande invalide.", 400);
    }
    const result = await bossService.contributeCredits({
      bossRunId,
      userId: user.id,
      amount,
      operationKey: `discord:${interaction.id}:boss-credits`
    });
    notice = `${result.amount} crédits offerts au boss.`;
  } else if (action === "collection") {
    await handleBossCollectionRequirement(interaction, bossRunId, user, 0);
    return;
  } else if (action !== "mine") {
    throw new AppError("Action de boss inconnue.", 400);
  }
  await handleBoss(interaction, user, notice, bossRunId);
}
