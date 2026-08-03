import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  StringSelectMenuBuilder,
  type ButtonInteraction,
  type ChatInputCommandInteraction,
  type Client,
  type InteractionReplyOptions,
  type Message,
  type StringSelectMenuInteraction
} from "discord.js";
import { PREMIUM_ROUTE_RARITY_UPGRADE_PERCENT } from "@rta/services";
import {
  AppError,
  achievementService,
  archiveService,
  discordAchievementRoleService,
  explorationEnergyService,
  exploreService,
  fusionService,
  prisma,
  usersService
} from "../service-instances.js";
import {
  createInteractionToken,
  parseInteractionToken
} from "../interaction-token.js";
import {
  canFallbackToInteractionPublication,
  encounterPublicationNonce
} from "../encounter-publication.js";
import { attachCardImage } from "../card-media.js";
import { announceHallOfFameCapture } from "../hall-of-fame.js";
import { captureResultColor } from "../capture-result.js";
import {
  handleInventory,
  handleRecycleCardCancel,
  handleRecycleCardConfirm,
  handleRecycleCardSelect
} from "./inventory.js";
import { handleShop } from "./shop.js";
import { fusionReceipt } from "./economy.js";
import {
  applyEquipmentSelection,
  handleProfile,
  handleProfileEquipmentSelect
} from "./profile.js";
import {
  handleAchievements,
  handleBoss,
  handleBossButton,
  handleBossCardSelect,
  handleBoosterInventory,
  handleConquerorBoosterBack,
  handleConquerorBoosterConfirm,
  handleConquerorBoosterPreview,
  handleConquerorRewardSelect,
  handleContractCancel,
  handleContractCardSelect,
  handleContractCreate,
  handleContractDeckSelect,
  handleContractFulfill,
  handleContractOptIn,
  handleContracts,
  handleItems,
  handleQuests,
  handleSkills
} from "./v2-views.js";

const HUB_COLOR = 0x6c5ce7;
const ENCOUNTER_COLOR = 0x00b894;
const PUBLICATION_DELAY_MS = 60_000;
const publicationTimers = new Map<string, NodeJS.Timeout>();

type EncounterInteractionPublisher = (
  options: InteractionReplyOptions
) => Promise<Message>;

type ExplorationEnergy = Awaited<
  ReturnType<typeof explorationEnergyService.getSnapshot>
>;

function explorationEnergyText(energy: ExplorationEnergy) {
  if (energy.isUnlimited) {
    return "⚡ **Explorations illimitées**";
  }
  const recharge = energy.nextChargeAt
    ? `<t:${Math.floor(energy.nextChargeAt.getTime() / 1000)}:R>`
    : "réserve pleine";
  return (
    `⚡ **${energy.charges}/${energy.maxCharges} explorations**\n` +
    `Régénération : +1 toutes les ${energy.regenIntervalMinutes} min • ${recharge}`
  );
}

const tierIncenseByCode = {
  c: {
    contentKey: "consumable.common_incense",
    label: "Commun"
  },
  u: {
    contentKey: "consumable.uncommon_incense",
    label: "Peu commun"
  },
  r: {
    contentKey: "consumable.rare_incense",
    label: "Rare"
  },
  v: {
    contentKey: "consumable.very_rare_incense",
    label: "Très rare"
  }
} as const;

const ZONE_ITEM_KEYS = [
  "consumable.bifurcation_prism",
  "consumable.expedition_pass",
  "consumable.affinity_incense",
  "artifact.spectral_scanner",
  "consumable.common_incense",
  "consumable.uncommon_incense",
  "consumable.rare_incense",
  "consumable.very_rare_incense"
] as const;

const CAPTURE_ITEM_KEYS = [
  "consumable.lucidity_elixir",
  "consumable.precision_catalyst",
  "consumable.anchor_net",
  "consumable.fortune_talisman"
] as const;

function wait(milliseconds: number) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function captureCountdownEmbed(seconds: number) {
  const filled = "●".repeat(4 - seconds);
  const pending = "○".repeat(seconds);
  return new EmbedBuilder()
    .setColor(0xf39c12)
    .setTitle("🎯 Capture en cours…")
    .setDescription(
      `Le signal se stabilise… **${seconds}**\n\n` +
      `\`${filled}${pending}\`\n\n` +
      "Ne quitte pas la rencontre."
    )
    .setFooter({ text: "Résultat dans quelques secondes" });
}

function premiumZoneCreditCost(metadata: unknown) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return 1;
  const value = Number((metadata as Record<string, unknown>).creditCost);
  return Number.isSafeInteger(value) && value > 0 ? value : 1;
}

function requireGuildId(guildId: string | null) {
  if (!guildId) {
    throw new AppError("Cette action est uniquement disponible dans un serveur Discord.", 400);
  }
  return guildId;
}

function requireBoundUser(expectedUserId: string, actualUserId: string) {
  if (expectedUserId !== actualUserId) {
    throw new AppError("Ce menu d'exploration appartient à un autre joueur.", 403);
  }
}

function hubComponents(discordGuildId: string) {
  return [
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(createInteractionToken("e", discordGuildId))
        .setLabel("Explorer")
        .setEmoji("🌍")
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId(createInteractionToken("g", "profile"))
        .setLabel("Profil")
        .setEmoji("👤")
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId(createInteractionToken("g", "collection"))
        .setLabel("Collection")
        .setEmoji("🗃️")
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId(createInteractionToken("g", "quests"))
        .setLabel("Quêtes")
        .setEmoji("📜")
        .setStyle(ButtonStyle.Secondary)
    ),
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(createInteractionToken("g", "boss"))
        .setLabel("Boss")
        .setEmoji("🐲")
        .setStyle(ButtonStyle.Danger),
      new ButtonBuilder()
        .setCustomId(createInteractionToken("g", "shop"))
        .setLabel("Boutique")
        .setEmoji("🛒")
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId(createInteractionToken("g", "items"))
        .setLabel("Inventaire")
        .setEmoji("🎒")
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId(createInteractionToken("g", "skills"))
        .setLabel("Compétences")
        .setEmoji("🌳")
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId(createInteractionToken("g", "contracts"))
        .setLabel("Contrats")
        .setEmoji("📋")
        .setStyle(ButtonStyle.Secondary)
    )
  ];
}

function privateHubEmbed(guildName: string) {
  return new EmbedBuilder()
    .setColor(HUB_COLOR)
    .setTitle("🚀 Rocket Them All — Centre d'exploration")
    .setDescription(
      `Bienvenue dans le centre de **${guildName}**.\n\n` +
      "Ce panneau est entièrement privé. Choisis une section ci-dessous pour continuer."
    )
    .addFields(
      { name: "Exploration", value: "9 mondes • 81 zones • 27 decks", inline: true },
      { name: "Collection", value: "810 cartes Vault à découvrir", inline: true },
      {
        name: "Publication",
        value: "Capture privée puis ouverture aux autres après 1 minute",
        inline: true
      }
    )
    .setFooter({ text: "Seul toi peux voir et utiliser ce panneau." });
}

function encounterEmbed(input: {
  bossName: string | null;
  worldName: string;
  zoneName: string;
  deckName: string;
  rarityName: string;
  closesAt: Date;
  phase: "PRIVATE" | "PUBLIC";
}) {
  return new EmbedBuilder()
    .setColor(input.bossName ? 0xc0392b : ENCOUNTER_COLOR)
    .setTitle(
      input.bossName
        ? "🐲 Une trace du boss apparaît en expédition !"
        : "✨ Une présence mystérieuse apparaît !"
    )
    .setDescription(
      (input.bossName
        ? `**Influence : ${input.bossName}**\n` +
          "Une capture réussie comptera comme un sbire vaincu.\n\n"
        : "") +
      `**Monde :** ${input.worldName}\n` +
      `**Zone :** ${input.zoneName}\n` +
      `**Deck :** ${input.deckName}\n` +
      `**Rareté :** ${input.rarityName}\n` +
      `**Fin de la rencontre :** <t:${Math.floor(input.closesAt.getTime() / 1000)}:R>\n\n` +
      "Quand tu cliques sur **Tenter la capture**, tu as **30 secondes** pour répondre." +
      (input.phase === "PRIVATE"
        ? "\n\n🔒 **Cette phase est privée.** Après ton résultat, la rencontre sera publiée pour les autres joueurs."
        : "\n\n🌐 **Rencontre publique :** chaque joueur peut maintenant effectuer sa propre tentative.")
    )
    .setFooter({
      text: input.phase === "PRIVATE"
        ? "Ta tentative personnelle • Aucun autre joueur ne voit encore cette rencontre"
        : "Une tentative par joueur • Le chrono est personnel"
    });
}

function encounterComponents(encounterId: string) {
  return [
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(createInteractionToken("a", encounterId))
        .setLabel("Tenter la capture")
        .setEmoji("🎯")
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId(createInteractionToken("o", encounterId))
        .setLabel("Objets")
        .setEmoji("🎒")
        .setStyle(ButtonStyle.Secondary)
    )
  ];
}

function targetChoiceComponents(encounterId: string, cardIds: [string, string]) {
  return [
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(createInteractionToken("T", encounterId, cardIds[0]))
        .setLabel("Poursuivre la cible A")
        .setEmoji("🎯")
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId(createInteractionToken("T", encounterId, cardIds[1]))
        .setLabel("Poursuivre la cible B")
        .setEmoji("🎯")
        .setStyle(ButtonStyle.Primary)
    )
  ];
}

async function publishEncounterAfterPrivateCapture(
  client: Client,
  encounterId: string,
  interactionPublisher?: EncounterInteractionPublisher
) {
  const claimed = await exploreService.claimEncounterPublication(encounterId);
  if (claimed.count !== 1) return false;

  try {
    const encounter = await prisma.encounter.findUnique({
      where: { id: encounterId },
      include: {
        zone: { include: { world: true } },
        card: { include: { deck: true, rarity: true } },
        bossRun: { include: { definition: true } }
      }
    });
    if (!encounter) {
      await exploreService.releaseEncounterPublication(encounterId);
      return false;
    }

    const channel = await client.channels.fetch(encounter.channelId);
    if (!channel || !channel.isTextBased() || !("send" in channel)) {
      throw new AppError("Le salon de jeu configuré n'est pas accessible au bot.", 409);
    }
    const embed = encounterEmbed({
      bossName: encounter.bossMinion ? encounter.bossRun?.definition.name ?? null : null,
      worldName: encounter.zone.world.name,
      zoneName: encounter.zone.name,
      deckName: encounter.card.deck?.name ?? "Inconnu",
      rarityName: encounter.card.rarity.name,
      closesAt: encounter.closesAt,
      phase: "PUBLIC"
    });
    const files = await attachCardImage(embed, encounter.card);
    const publicPayload = {
      content: "🌐 La rencontre est maintenant ouverte aux autres joueurs !",
      allowedMentions: { parse: [] },
      embeds: [embed],
      files,
      components: encounterComponents(encounter.id)
    } satisfies InteractionReplyOptions;
    let message: Message;
    try {
      message = await channel.send({
        ...publicPayload,
        nonce: encounterPublicationNonce(encounter.id),
        enforceNonce: true
      });
    } catch (error) {
      if (!interactionPublisher || !canFallbackToInteractionPublication(error)) {
        throw error;
      }
      console.warn("Direct encounter publication denied; using interaction relay", {
        encounterId,
        guildId: encounter.guildId,
        channelId: encounter.channelId
      });
      message = await interactionPublisher(publicPayload);
    }
    const attached = await exploreService.attachEncounterMessage(encounter.id, message.id);
    if (!attached) {
      await message.delete().catch((error) => {
        console.warn("Unable to remove a duplicate encounter publication", {
          encounterId,
          messageId: message.id,
          error
        });
      });
      await exploreService.releaseEncounterPublication(encounterId);
      return false;
    }
    return true;
  } catch (error) {
    await exploreService.releaseEncounterPublication(encounterId);
    throw error;
  }
}

function queueEncounterPublication(
  client: Client,
  encounterId: string,
  publishAfter: Date,
  interactionPublisher?: EncounterInteractionPublisher
) {
  const existing = publicationTimers.get(encounterId);
  if (existing) clearTimeout(existing);
  const delay = Math.max(0, publishAfter.getTime() - Date.now());
  const timer = setTimeout(async () => {
    publicationTimers.delete(encounterId);
    try {
      await publishEncounterAfterPrivateCapture(
        client,
        encounterId,
        interactionPublisher
      );
    } catch (error) {
      console.error("Unable to publish delayed encounter", { encounterId, error });
      queueEncounterPublication(
        client,
        encounterId,
        new Date(Date.now() + 5_000),
        interactionPublisher
      );
    }
  }, delay);
  timer.unref();
  publicationTimers.set(encounterId, timer);
}

export async function resumePendingEncounterPublications(client: Client) {
  await prisma.encounter.updateMany({
    where: {
      publicationClaimedAt: { not: null },
      publishedAt: null,
      messageId: null,
      status: "ACTIVE"
    },
    data: { publicationClaimedAt: null, version: { increment: 1 } }
  });
  const pending = await prisma.encounter.findMany({
    where: {
      initiatorResolvedAt: { not: null },
      publishAfter: { not: null },
      publishedAt: null,
      messageId: null,
      status: "ACTIVE",
      closesAt: { gt: new Date() }
    },
    select: { id: true, publishAfter: true }
  });
  for (const encounter of pending) {
    if (encounter.publishAfter) {
      queueEncounterPublication(client, encounter.id, encounter.publishAfter);
    }
  }
}

async function resolveGameChannel(
  interaction: ChatInputCommandInteraction | StringSelectMenuInteraction | ButtonInteraction,
  discordGuildId: string
) {
  const guild = await exploreService.getGuild(discordGuildId);
  const channelId = guild.config?.gameChannelId;
  if (!channelId) {
    throw new AppError(
      "Aucun salon de jeu n’est configuré. Un administrateur doit le sélectionner dans le panel RTA.",
      409
    );
  }

  const channel = await interaction.client.channels.fetch(channelId);
  if (!channel || !channel.isTextBased() || !("send" in channel)) {
    throw new AppError("Le salon de jeu configuré n'est pas accessible au bot.", 409);
  }
  return { guild, channel, channelId };
}

async function worldSelectionPayload(
  discordGuildId: string,
  discordUserId: string,
  userId: string
) {
  const [worlds, energy] = await Promise.all([
    exploreService.listWorlds(discordGuildId),
    explorationEnergyService.getSnapshot(userId)
  ]);
  if (worlds.length === 0) {
    throw new AppError("Aucun monde n'est encore publié.", 409);
  }

  const menu = new StringSelectMenuBuilder()
    .setCustomId(createInteractionToken("w", discordGuildId, discordUserId))
    .setPlaceholder("Choisis un monde")
    .addOptions(worlds.map((world) => ({
      label: `${world.unlocked ? "🌍" : "🔒"} ${world.name}`.slice(0, 100),
      description: world.unlocked
        ? `Monde ${world.position} — niveau conseillé ${world.minLevel}`
        : `Monde ${world.position} — verrouillé`,
      value: String(world.position)
    })));

  return {
    embeds: [
      new EmbedBuilder()
        .setColor(HUB_COLOR)
        .setTitle("🌍 Choix du monde")
        .setDescription(
          "Toute la préparation et ta première capture sont privées. " +
          "Après ton résultat, la rencontre attendra une minute avant d'être proposée aux autres joueurs.\n\n" +
          explorationEnergyText(energy)
        )
    ],
    components: [new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu)]
  };
}

async function retirePublicHubs(
  client: Client,
  hubs: Array<{
    id: string;
    guildId: string;
    channelId: string;
    messageId: string;
  }>
) {
  for (const hub of hubs) {
    try {
      const channel = await client.channels.fetch(hub.channelId);
      if (channel?.isTextBased() && "messages" in channel) {
        const message = await channel.messages.fetch(hub.messageId);
        await message.delete();
      }
    } catch (error) {
      console.warn("Unable to remove legacy public exploration hub", {
        guildId: hub.guildId,
        hubId: hub.id,
        error
      });
    }
    await prisma.guildHub.update({
      where: { id: hub.id },
      data: {
        status: "DELETED",
        activeKey: null,
        revision: { increment: 1 }
      }
    });
  }
}

async function removeLegacyPublicHub(
  interaction: ChatInputCommandInteraction,
  discordGuildId: string
) {
  const guild = await exploreService.getGuild(discordGuildId);
  const hubs = await prisma.guildHub.findMany({
    where: { guildId: guild.id, status: "ACTIVE" }
  });
  await retirePublicHubs(interaction.client, hubs);
}

export async function retireLegacyPublicExplorationHubs(client: Client) {
  const hubs = await prisma.guildHub.findMany({
    where: { status: "ACTIVE" }
  });
  await retirePublicHubs(client, hubs);
}

export async function handleExplore(interaction: ChatInputCommandInteraction) {
  const discordGuildId = requireGuildId(interaction.guildId);
  await removeLegacyPublicHub(interaction, discordGuildId);
  await interaction.editReply({
    embeds: [privateHubEmbed(interaction.guild?.name ?? "ce serveur")],
    components: hubComponents(discordGuildId)
  });
}

async function handleExploreButton(interaction: ButtonInteraction, discordGuildId: string) {
  requireGuildId(interaction.guildId);
  if (interaction.guildId !== discordGuildId) {
    throw new AppError("Ce centre d'exploration appartient à un autre serveur.", 403);
  }
  await interaction.deferReply({ ephemeral: true });
  const user = await usersService.getOrCreateDiscordUser(
    interaction.user.id,
    interaction.user.username,
    interaction.user.displayAvatarURL()
  );
  await interaction.editReply(
    await worldSelectionPayload(discordGuildId, interaction.user.id, user.id)
  );
}

async function handleWorldSelect(
  interaction: StringSelectMenuInteraction,
  discordGuildId: string,
  boundUserId: string
) {
  requireBoundUser(boundUserId, interaction.user.id);
  const worldPosition = Number(interaction.values[0]);
  const proposal = await exploreService.proposeZones(
    discordGuildId,
    worldPosition,
    `${interaction.id}:${boundUserId}`,
    boundUserId
  );
  await interaction.update(zoneProposalPayload(
    discordGuildId,
    boundUserId,
    worldPosition,
    proposal
  ));
}

type ZoneProposal = Awaited<ReturnType<typeof exploreService.proposeZones>>;

function zoneProposalPayload(
  discordGuildId: string,
  boundUserId: string,
  worldPosition: number,
  proposal: ZoneProposal,
  notice?: string
) {
  const positions = proposal.proposals.map((entry) => entry.zone.position);
  const embed = new EmbedBuilder()
    .setColor(HUB_COLOR)
    .setTitle(`🧭 ${proposal.world.name}`)
    .setDescription(
      `Voici les routes tirées : **${proposal.proposals.filter((entry) =>
        entry.zone.access === "FREE"
      ).length} gratuites et 1 premium**.\n` +
      "La zone choisie détermine directement son deck." +
      (notice ? `\n\n${notice}` : "")
    )
    .addFields(proposal.proposals.map((entry, index) => ({
      name: `${index + 1}. ${entry.zone.access === "PREMIUM" ? "💎 Premium" : "🆓 Gratuite"}`,
      value:
        `**${entry.zone.name}** (${entry.deck.name})\nDanger : ${entry.zone.danger}` +
        (entry.intel.bands
          ? `\nStandard ${entry.intel.bands.standard} % · Rare ${entry.intel.bands.rare} % · ` +
            `Exceptionnel ${entry.intel.bands.exceptional} %`
          : "") +
        (entry.intel.novelty ? `\n🗃️ ${entry.intel.novelty}` : "") +
        (entry.intel.wishlist ? "\n⭐ Deck de ta liste de recherche" : "") +
        (entry.intel.pinnedMissing > 0
          ? `\n📌 ${entry.intel.pinnedMissing} carte(s) manquante(s) épinglée(s)`
          : "") +
        (entry.intel.archiveResonance === "DECK"
          ? "\n🏛️ Résonance d'archives : deck ×1,50"
          : entry.intel.archiveResonance?.startsWith("TIER:")
            ? `\n🏛️ Résonance d'archives : ${entry.intel.archiveResonance.slice(5)}`
            : "") +
        (entry.zone.access === "PREMIUM"
          ? `\n🎲 Bonus rareté : ${PREMIUM_ROUTE_RARITY_UPGRADE_PERCENT} % des tirages gagnent un palier` +
            `\nEntrée : ${premiumZoneCreditCost(entry.zone.metadata)} crédit(s) ou 1 Pass`
          : ""),
      inline: false
    })));

  const row = new ActionRowBuilder<ButtonBuilder>();
  for (const entry of proposal.proposals) {
    row.addComponents(
      new ButtonBuilder()
        .setCustomId(
          createInteractionToken(
            "n",
            discordGuildId,
            boundUserId,
            worldPosition,
            entry.zone.position,
            ...positions
          )
        )
        .setLabel(`${entry.zone.name} (${entry.deck.name})`.slice(0, 80))
        .setEmoji(entry.zone.access === "PREMIUM" ? "💎" : "🆓")
        .setStyle(entry.zone.access === "PREMIUM" ? ButtonStyle.Success : ButtonStyle.Primary)
    );
  }
  row.addComponents(
    new ButtonBuilder()
      .setCustomId(
        createInteractionToken(
          "i",
          discordGuildId,
          boundUserId,
          worldPosition,
          ...positions
        )
      )
      .setLabel("Objets")
      .setEmoji("🎒")
      .setStyle(ButtonStyle.Secondary)
  );
  return { embeds: [embed], components: [row] };
}

async function handleZoneButton(
  interaction: ButtonInteraction,
  discordGuildId: string,
  boundUserId: string,
  worldPosition: number,
  zonePosition: number,
  zonePositions: number[],
  premiumPayment?: "PASS" | "CREDITS"
) {
  requireBoundUser(boundUserId, interaction.user.id);
  const user = await usersService.getOrCreateDiscordUser(
    interaction.user.id,
    interaction.user.username,
    interaction.user.displayAvatarURL()
  );
  const selection = await exploreService.listZoneDecks(
    discordGuildId,
    worldPosition,
    zonePosition,
    user.id
  );
  const deck = selection.decks[0];
  if (!deck) {
    throw new AppError("Cette zone n'a aucun deck disponible.", 409);
  }
  if (selection.requiresPremiumAccess && !premiumPayment) {
    const paymentRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(
          createInteractionToken(
            "p",
            discordGuildId,
            boundUserId,
            worldPosition,
            zonePosition,
            "PASS"
          )
        )
        .setLabel(`Utiliser un Pass (${selection.expeditionPassCount})`)
        .setEmoji("🎟️")
        .setStyle(ButtonStyle.Primary)
        .setDisabled(selection.expeditionPassCount < 1),
      new ButtonBuilder()
        .setCustomId(
          createInteractionToken(
            "p",
            discordGuildId,
            boundUserId,
            worldPosition,
            zonePosition,
            "CREDITS"
          )
        )
        .setLabel(`Payer ${selection.premiumCreditCost} crédit(s)`)
        .setEmoji("💳")
        .setStyle(ButtonStyle.Success)
        .setDisabled(selection.userCredits < selection.premiumCreditCost),
      new ButtonBuilder()
        .setCustomId(
          createInteractionToken(
            "b",
            discordGuildId,
            boundUserId,
            worldPosition,
            ...zonePositions
          )
        )
        .setLabel("Retour")
        .setStyle(ButtonStyle.Secondary)
    );
    await interaction.update({
      embeds: [
        new EmbedBuilder()
          .setColor(0xf1c40f)
          .setTitle(`💎 Entrée premium — ${selection.zone.name}`)
          .setDescription(
            `Cette zone liée au deck **${deck.name}** coûte ` +
            `**${selection.premiumCreditCost} crédit(s)** ou **1 Pass d'expédition**.\n\n` +
            `🎲 **Bonus premium :** ${PREMIUM_ROUTE_RARITY_UPGRADE_PERCENT} % des tirages ` +
            `passent au palier de rareté supérieur.\n\n` +
            (selection.activeInvaderMultiplier > 1
              ? `🌑 Envahisseur actif : coût normal ${selection.premiumBaseCreditCost}, ` +
                `modificateur ×${selection.activeInvaderMultiplier} jusqu’à la fin du boss.\n\n`
              : "") +
            `Ton solde : **${selection.userCredits} crédits**\n` +
            `Tes Pass : **${selection.expeditionPassCount}**`
          )
      ],
      components: [paymentRow]
    });
    return;
  }

  const { channelId } = await resolveGameChannel(interaction, discordGuildId);
  await interaction.deferUpdate();
  const result = await exploreService.createEncounter({
    discordGuildId,
    userId: user.id,
    channelId,
    worldPosition,
    zonePosition,
    deckId: deck.id,
    premiumPayment,
    operationKey: `discord:${interaction.id}`
  });

  const embed = encounterEmbed({
    bossName: result.bossInfluence?.bossName ?? null,
    worldName: result.world.name,
    zoneName: result.zone.name,
    deckName: result.card.deck?.name ?? "Inconnu",
    rarityName: result.card.rarity.name,
    closesAt: result.encounter.closesAt,
    phase: "PRIVATE"
  });
  const preparationNotices = [
    result.zone.access === "PREMIUM"
      ? `🎲 Route premium : ${PREMIUM_ROUTE_RARITY_UPGRADE_PERCENT} % des tirages gagnent un palier de rareté.`
      : null,
    result.premiumPayment === "PASS"
      ? "🎟️ Un Pass d'expédition a été utilisé."
      : result.premiumPayment === "CREDITS"
        ? `💳 ${selection.premiumCreditCost} crédit(s) ont été payés.`
        : null,
    result.tierIncense
      ? `🕯️ Encens ${result.tierIncense.targetRarity} actif : ` +
        `${result.tierIncense.remainingUses} exploration(s) restante(s) · ` +
        "tier ciblé à 50 % · Shiny 5 % · Holo 1 %."
      : null,
    result.archiveResonance
      ? `🏛️ Résonance d'archives ${result.archiveResonance.type === "DECK" ? "de deck" : "de tier"} : ` +
        `**${result.archiveResonance.target} ×${result.archiveResonance.multiplier.toFixed(2)}**.`
      : null,
    result.pioneer?.chained
      ? `🧭 Exploration enchaînée par la Balise` +
        (result.pioneer.chargeRefunded ? " · charge remboursée !" : ".")
      : null,
    result.pioneer?.secretRoute
      ? "🗝️ Passage secret consommé : cible Rare minimum."
      : null
  ].filter((notice): notice is string => Boolean(notice));
  if (preparationNotices.length > 0) {
    embed.addFields({
      name: "Préparation appliquée",
      value: preparationNotices.join("\n")
    });
  }
  if (result.event) {
    embed.addFields({
      name: result.event.isSpecial ? "🌠 Événement spécial" : "✨ Événement d'exploration",
      value:
        `**${result.event.label}** — récompenses de cette capture : ` +
        `XP ×${result.event.xpMultiplier} · crédits ×${result.event.creditMultiplier}.`
    });
  }
  if (result.darkHunt) {
    embed.addFields({
      name: "🌑 Chasse obscure",
      value:
        `Les 9 Traces ont ouvert ${
          result.darkHunt.profiles
            ? "**deux profils flous** : choisis avec le deck, le danger et la rareté potentielle."
            : `un profil **${result.darkHunt.profile}**.`
        }` +
        (result.darkHunt.pityActive
          ? " Le Signal noir garantit ici un tier Exotic minimum."
          : "")
    });
  }
  embed.addFields({
    name: "Charges d'exploration",
    value: explorationEnergyText(result.energy)
  });
  const embeds = [embed];
  const darkProfiles = result.darkHunt?.profiles ?? null;
  const files = darkProfiles ? [] : await attachCardImage(embed, result.card);
  if (result.alternativeCard) {
    embed.setTitle(
      darkProfiles ? "🌑 Profil A — Deux ombres" : "🎯 Cible A — Choix de proie"
    );
    if (darkProfiles?.[0]) {
      embed.addFields({
        name: "Profil révélé",
        value:
          `Deck **${darkProfiles[0].deckName}** · ` +
          `danger **${darkProfiles[0].danger}** · ` +
          `rareté potentielle **${darkProfiles[0].potentialRarity}**`
      });
    }
    const alternativeEmbed = encounterEmbed({
      bossName: result.bossInfluence?.bossName ?? null,
      worldName: result.world.name,
      zoneName: result.zone.name,
      deckName: darkProfiles?.[1]?.deckName
        ?? result.alternativeCard.deck?.name
        ?? "Inconnu",
      rarityName: darkProfiles?.[1]?.potentialRarity
        ?? result.alternativeCard.rarity.name,
      closesAt: result.encounter.closesAt,
      phase: "PRIVATE"
    }).setTitle(
      darkProfiles ? "🌑 Profil B — Deux ombres" : "🎯 Cible B — Choix de proie"
    );
    if (darkProfiles?.[1]) {
      alternativeEmbed.addFields({
        name: "Profil révélé",
        value:
          `Deck **${darkProfiles[1].deckName}** · ` +
          `danger **${darkProfiles[1].danger}** · ` +
          `rareté potentielle **${darkProfiles[1].potentialRarity}**`
      });
    } else {
      files.push(...await attachCardImage(alternativeEmbed, result.alternativeCard));
    }
    embeds.push(alternativeEmbed);
  }

  try {
    await interaction.editReply({
      embeds,
      files,
      components: result.alternativeCard
        ? targetChoiceComponents(
            result.encounter.id,
            [result.card.id, result.alternativeCard.id]
          )
        : encounterComponents(result.encounter.id)
    });
  } catch (error) {
    await exploreService.cancelEncounter(result.encounter.id);
    throw error;
  }
}

async function handleItemsButton(
  interaction: ButtonInteraction,
  discordGuildId: string,
  boundUserId: string,
  worldPosition: number,
  zonePositions: number[]
) {
  requireBoundUser(boundUserId, interaction.user.id);
  const user = await usersService.getOrCreateDiscordUser(
    interaction.user.id,
    interaction.user.username,
    interaction.user.displayAvatarURL()
  );
  const [
    relevantItems,
    activeTierEffect,
    activeAffinityEffect,
    equippedScanner,
    equippedHourglass,
    gameplayState,
    learnedSkills,
    proposal
  ] = await Promise.all([
    prisma.userItem.findMany({
      where: {
        userId: user.id,
        item: {
          contentKey: { in: [...ZONE_ITEM_KEYS] }
        }
      },
      include: { item: true }
    }),
    prisma.userItemEffect.findUnique({
      where: {
        userId_effectKey: {
          userId: user.id,
          effectKey: "EXP_TIER_WEIGHT_BOOST"
        }
      }
    }),
    prisma.userItemEffect.findUnique({
      where: {
        userId_effectKey: {
          userId: user.id,
          effectKey: "EXP_DECK_WEIGHT_BOOST"
        }
      }
    }),
    prisma.equippedArtifact.findFirst({
      where: {
        userId: user.id,
        item: {
          contentKey: "artifact.spectral_scanner",
          status: "PUBLISHED"
        }
      }
    }),
    prisma.equippedArtifact.findFirst({
      where: {
        userId: user.id,
        item: { effectKey: "CONSUMABLE_EXTEND_WHITELISTED", status: "PUBLISHED" }
      }
    }),
    prisma.userGameplayState.findUnique({ where: { userId: user.id } }),
    prisma.userSkill.findMany({
      where: { userId: user.id, rank: { gt: 0 } },
      select: { skill: { select: { effectKey: true } } }
    }),
    exploreService.resolveZoneProposals(discordGuildId, worldPosition, zonePositions)
  ]);
  const quantities = new Map(relevantItems.map((entry) => [entry.item.contentKey, entry.quantity]));
  const prismCount = quantities.get("consumable.bifurcation_prism") ?? 0;
  let compassReady =
    learnedSkills.some((entry) => entry.skill.effectKey === "EXP_NAVIGATOR_GRANT_COMPASS") &&
    (gameplayState?.explorations ?? 0) > 0 &&
    (gameplayState?.explorations ?? 0) % 3 === 0;
  if (compassReady) {
    const checkpoint = Math.floor((gameplayState?.explorations ?? 0) / 3);
    const used = await prisma.actionCooldown.findUnique({
      where: { scopeKey: `explore:compass:${user.id}:${checkpoint}` }
    });
    compassReady = !used;
  }
  const ownedScannerCount = quantities.get("artifact.spectral_scanner") ?? 0;
  const scannerCount = equippedScanner ? ownedScannerCount : 0;
  const activeIncense =
    activeTierEffect &&
    activeTierEffect.remainingUses > 0 &&
    (!activeTierEffect.expiresAt || activeTierEffect.expiresAt > new Date())
      ? activeTierEffect
      : null;
  const activeAffinity =
    activeAffinityEffect &&
    activeAffinityEffect.remainingUses > 0 &&
    (!activeAffinityEffect.expiresAt || activeAffinityEffect.expiresAt > new Date())
      ? activeAffinityEffect
      : null;
  const rerollRow = new ActionRowBuilder<ButtonBuilder>();
  for (let index = 0; index < zonePositions.length; index += 1) {
    rerollRow.addComponents(
      new ButtonBuilder()
        .setCustomId(
          createInteractionToken(
            "r",
            discordGuildId,
            boundUserId,
            worldPosition,
            ...zonePositions,
            index
          )
        )
        .setLabel(`Reroll route ${index + 1}`)
        .setEmoji("♻️")
        .setStyle(ButtonStyle.Primary)
        .setDisabled(prismCount < 1 && !compassReady)
    );
  }

  const scannerRow = new ActionRowBuilder<ButtonBuilder>();
  for (let index = 0; index < zonePositions.length; index += 1) {
    scannerRow.addComponents(
      new ButtonBuilder()
        .setCustomId(
          createInteractionToken(
            "s",
            discordGuildId,
            boundUserId,
            worldPosition,
            ...zonePositions,
            index
          )
        )
        .setLabel(`Scanner route ${index + 1}`)
        .setEmoji("🔎")
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(scannerCount < 1)
    );
  }

  const incenseRow = new ActionRowBuilder<ButtonBuilder>();
  for (const code of ["c", "u", "r", "v"] as const) {
    const incense = tierIncenseByCode[code];
    incenseRow.addComponents(
      new ButtonBuilder()
        .setCustomId(
          createInteractionToken(
            "u",
            discordGuildId,
            boundUserId,
            worldPosition,
            ...zonePositions,
            code
          )
        )
        .setLabel(incense.label)
        .setEmoji("🕯️")
        .setStyle(ButtonStyle.Primary)
        .setDisabled(Boolean(activeIncense) || (quantities.get(incense.contentKey) ?? 0) < 1)
    );
  }

  const backRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(
        createInteractionToken(
          "b",
          discordGuildId,
          boundUserId,
          worldPosition,
          ...zonePositions
        )
      )
      .setLabel("Retour aux routes")
      .setStyle(ButtonStyle.Secondary)
  );
  const affinityCount = quantities.get("consumable.affinity_incense") ?? 0;
  const affinityRow = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(
        createInteractionToken(
          "F",
          discordGuildId,
          boundUserId,
          worldPosition,
          ...zonePositions
        )
      )
      .setPlaceholder(
        activeAffinity
          ? `Encens d'affinité actif (${activeAffinity.remainingUses} restantes)`
          : `Activer un Encens d'affinité (${affinityCount})`
      )
      .setDisabled(Boolean(activeAffinity) || affinityCount < 1)
      .addOptions(proposal.proposals.flatMap((entry) => {
        const base = [{
          label: entry.deck.name.slice(0, 100),
          value: entry.deck.id,
          description: "Poids de ce deck ×2 pendant 3 explorations"
        }];
        if (!equippedHourglass) return base;
        return [
          ...base,
          {
            label: `${entry.deck.name} + Sablier`.slice(0, 100),
            value: `${entry.deck.id}|hourglass`,
            description: "Poids ×2 pendant 4 explorations (usage quotidien)"
          }
        ];
      }))
  );
  await interaction.update({
    embeds: [
      new EmbedBuilder()
        .setColor(0x3498db)
        .setTitle("🎒 Objets d'exploration")
        .setDescription(
          `**Prisme de bifurcation :** ${prismCount} — remplace une route proposée\n` +
          `**Boussole du Navigateur :** ${compassReady ? "reroll gratuit prêt" : "pas encore chargée"}\n` +
          `**Scanner spectral :** ${ownedScannerCount} — ` +
          `${equippedScanner ? "équipé et prêt" : "à équiper depuis ton profil"}\n` +
          `**Pass d'expédition :** ${quantities.get("consumable.expedition_pass") ?? 0} — remplace le paiement premium\n` +
          `**Encens d'affinité :** ${affinityCount} — attire ×2 le deck choisi pendant 3 explorations\n` +
          "\n" +
          `**Encens :** Commun ${quantities.get("consumable.common_incense") ?? 0} • ` +
          `Peu commun ${quantities.get("consumable.uncommon_incense") ?? 0} • ` +
          `Rare ${quantities.get("consumable.rare_incense") ?? 0} • ` +
          `Très rare ${quantities.get("consumable.very_rare_incense") ?? 0}` +
          (activeIncense
            ? `\n\n🕯️ **Encens ${activeIncense.targetKey} actif** — ` +
              `${activeIncense.remainingUses} exploration(s) restante(s).\n` +
              "**Effet :** tier ciblé à 50 % · Shiny 5 % · Holo 1 %."
            : "\n\nActive un Encens pour mettre son tier à 50 % pendant 3 explorations " +
              "et passer les variantes à 5 % Shiny / 1 % Holo.")
        )
        .setFooter({
          text: "Phase zone uniquement • les objets de capture apparaissent pendant la rencontre."
        })
    ],
    components: [rerollRow, scannerRow, incenseRow, affinityRow, backRow]
  });
}

async function handleRerollButton(
  interaction: ButtonInteraction,
  discordGuildId: string,
  boundUserId: string,
  worldPosition: number,
  zonePositions: number[],
  replaceIndex: number
) {
  requireBoundUser(boundUserId, interaction.user.id);
  await interaction.deferUpdate();
  const user = await usersService.getOrCreateDiscordUser(
    interaction.user.id,
    interaction.user.username,
    interaction.user.displayAvatarURL()
  );
  const proposal = await exploreService.rerollZone({
    discordGuildId,
    userId: user.id,
    worldPosition,
    zonePositions,
    replaceIndex,
    seed: interaction.id,
    operationKey: `discord:${interaction.id}:route-reroll`
  });
  await interaction.editReply(zoneProposalPayload(
    discordGuildId,
    boundUserId,
    worldPosition,
    proposal,
    "♻️ Un Prisme de bifurcation a remplacé la route choisie."
  ));
}

async function handleScannerButton(
  interaction: ButtonInteraction,
  discordGuildId: string,
  boundUserId: string,
  worldPosition: number,
  zonePositions: number[],
  analyzeIndex: number
) {
  requireBoundUser(boundUserId, interaction.user.id);
  await interaction.deferUpdate();
  const user = await usersService.getOrCreateDiscordUser(
    interaction.user.id,
    interaction.user.username,
    interaction.user.displayAvatarURL()
  );
  const result = await exploreService.analyzeProposedZone({
    discordGuildId,
    userId: user.id,
    worldPosition,
    zonePositions,
    analyzeIndex
  });
  const exact = result.exactPercentages
    ? "\n\n**Distribution exacte**\n" +
      Object.entries(result.exactPercentages)
        .map(([rarity, chance]) => `${rarity} : **${chance} %**`)
        .join("\n")
    : "";
  await interaction.editReply({
    embeds: [
      new EmbedBuilder()
        .setColor(0x3498db)
        .setTitle(`🔎 Analyse — ${result.zone.name}`)
        .setDescription(
          `Deck lié : **${result.deck.name}**\n` +
          `Danger : **${result.zone.danger}**\n\n` +
          (result.zone.access === "PREMIUM"
            ? `🎲 Bonus premium appliqué : **${PREMIUM_ROUTE_RARITY_UPGRADE_PERCENT} %** des tirages gagnent un palier.\n\n`
            : "") +
          `Cartes standards : **${result.bands.standard} %**\n` +
          `Cartes rares : **${result.bands.rare} %**\n` +
          `Cartes exceptionnelles : **${result.bands.exceptional} %**` +
          exact +
          `\n\nAnalyses restantes sur ce tirage : **${result.scansRemaining}**`
        )
        .setFooter({ text: "Le Scanner spectral n'est pas consommé • 1 route analysée par tirage" })
    ],
    components: [
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId(
            createInteractionToken(
              "b",
              discordGuildId,
              boundUserId,
              worldPosition,
              ...zonePositions
            )
          )
          .setLabel("Retour aux routes")
          .setStyle(ButtonStyle.Secondary)
      )
    ]
  });
}

async function handleTierIncenseButton(
  interaction: ButtonInteraction,
  discordGuildId: string,
  boundUserId: string,
  worldPosition: number,
  zonePositions: number[],
  code: string
) {
  requireBoundUser(boundUserId, interaction.user.id);
  const incense = tierIncenseByCode[code as keyof typeof tierIncenseByCode];
  if (!incense) {
    throw new AppError("Encens invalide.", 400);
  }
  await interaction.deferUpdate();
  const user = await usersService.getOrCreateDiscordUser(
    interaction.user.id,
    interaction.user.username,
    interaction.user.displayAvatarURL()
  );
  const activation = await exploreService.activateTierIncense({
    userId: user.id,
    contentKey: incense.contentKey,
    operationKey: `discord:${interaction.id}`
  });
  const proposal = await exploreService.resolveZoneProposals(
    discordGuildId,
    worldPosition,
    zonePositions
  );
  await interaction.editReply(zoneProposalPayload(
    discordGuildId,
    boundUserId,
    worldPosition,
    proposal,
    `🕯️ Encens **${activation.targetRarity}** activé pour ` +
      `${activation.remainingUses} explorations.`
  ));
}

async function handleBackToZones(
  interaction: ButtonInteraction,
  discordGuildId: string,
  boundUserId: string,
  worldPosition: number,
  zonePositions: number[]
) {
  requireBoundUser(boundUserId, interaction.user.id);
  const proposal = await exploreService.resolveZoneProposals(
    discordGuildId,
    worldPosition,
    zonePositions
  );
  await interaction.update(zoneProposalPayload(
    discordGuildId,
    boundUserId,
    worldPosition,
    proposal
  ));
}

async function handleAttemptButton(interaction: ButtonInteraction, encounterId: string) {
  await interaction.deferReply({ ephemeral: true });
  const user = await usersService.getOrCreateDiscordUser(
    interaction.user.id,
    interaction.user.username,
    interaction.user.displayAvatarURL()
  );
  const {
    choices,
    captureClosesAt,
    captureIntel,
    preparation
  } = await exploreService.getAttemptChoices(encounterId, user.id);
  const menu = new StringSelectMenuBuilder()
    .setCustomId(createInteractionToken("q", encounterId, interaction.user.id))
    .setPlaceholder("Qui est cette carte mystérieuse ?")
    .addOptions(choices.map((choice) => ({
      label: choice.name.slice(0, 100),
      value: choice.id
    })));
  await interaction.editReply({
    embeds: [
      new EmbedBuilder()
        .setColor(ENCOUNTER_COLOR)
        .setTitle("🎯 Tentative de capture")
        .setDescription(
          `Choisis la bonne carte. Une bonne réponse donne **95 %** de chance de capture, ` +
          `une mauvaise réponse **25 %**, avant modificateurs.\n\n` +
          (captureIntel
            ? `🎯 Diagnostic : **${captureIntel.minimum}–${captureIntel.maximum} %** · ` +
              `risque **${captureIntel.risk.toLowerCase()}**.` +
              (captureIntel.recommendedApproach
                ? `\n🔭 Viseur : ${captureIntel.recommendedApproach}.`
                : "") +
              "\n\n"
            : "") +
          `⏱️ **Tu as 30 secondes.** Fin : ` +
          `<t:${Math.floor(captureClosesAt.getTime() / 1000)}:R>` +
          (preparation === "consumable.precision_catalyst"
            ? "\n⚗️ Catalyseur de précision prêt : **+15 points**, plafond 90 %."
            : "")
        )
    ],
    components: [new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu)]
  });
}

async function handleTargetChoiceButton(
  interaction: ButtonInteraction,
  encounterId: string,
  cardId: string
) {
  await interaction.deferUpdate();
  const user = await usersService.getOrCreateDiscordUser(
    interaction.user.id,
    interaction.user.username,
    interaction.user.displayAvatarURL()
  );
  const result = await exploreService.chooseEncounterTarget(encounterId, user.id, cardId);
  const embed = encounterEmbed({
    bossName: null,
    worldName: result.encounter.zone.world.name,
    zoneName: result.encounter.zone.name,
    deckName: result.card.deck.name,
    rarityName: result.card.rarity.name,
    closesAt: result.encounter.closesAt,
    phase: "PRIVATE"
  }).setTitle("🎯 Cible verrouillée");
  embed.addFields({
    name: result.darkProfileChoice ? "Deux ombres" : "Choix de proie",
    value: result.alreadySelected
      ? "Cette cible était déjà sélectionnée."
      : result.darkProfileChoice
        ? "Le profil choisi révèle maintenant sa carte. L'autre ombre disparaît."
        : "L'autre cible a disparu. Une seule capture sera possible."
  });
  const files = await attachCardImage(embed, result.card);
  await interaction.editReply({
    embeds: [embed],
    files,
    components: encounterComponents(encounterId)
  });
}

async function handleEncounterItemsButton(
  interaction: ButtonInteraction,
  encounterId: string
) {
  await interaction.deferReply({ ephemeral: true });
  const user = await usersService.getOrCreateDiscordUser(
    interaction.user.id,
    interaction.user.username,
    interaction.user.displayAvatarURL()
  );
  const [captureItems, collectorIdol] = await Promise.all([
    prisma.userItem.findMany({
      where: {
        userId: user.id,
        item: {
          contentKey: { in: [...CAPTURE_ITEM_KEYS] },
          status: "PUBLISHED"
        }
      },
      include: { item: true }
    }),
    prisma.equippedArtifact.findFirst({
      where: {
        userId: user.id,
        item: { effectKey: "EXP_DUPLICATE_REROLL", status: "PUBLISHED" }
      }
    })
  ]);
  const quantities = new Map(
    captureItems.map((entry) => [entry.item.contentKey, entry.quantity])
  );
  const elixirCount = quantities.get("consumable.lucidity_elixir") ?? 0;
  const catalystCount = quantities.get("consumable.precision_catalyst") ?? 0;
  const anchorCount = quantities.get("consumable.anchor_net") ?? 0;
  const talismanCount = quantities.get("consumable.fortune_talisman") ?? 0;
  await interaction.editReply({
    embeds: [
      new EmbedBuilder()
        .setColor(0x3498db)
        .setTitle("🎒 Objets de capture")
        .setDescription(
          `**Élixir de lucidité :** ${elixirCount} — révèle l'indice uniquement pour toi\n` +
          `**Catalyseur de précision :** ${catalystCount} — +15 points, plafond 90 %\n` +
          `**Filet d'ancrage :** ${anchorCount} — rejoue automatiquement le jet après un échec\n` +
          `**Talisman de fortune :** ${talismanCount} — le prochain drop d'objet garde le meilleur de 2 jets`
        )
    ],
    components: [
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId(
            createInteractionToken("h", encounterId, interaction.user.id)
          )
          .setLabel("Révéler l'indice")
          .setEmoji("💡")
          .setStyle(ButtonStyle.Primary)
          .setDisabled(elixirCount < 1),
        new ButtonBuilder()
          .setCustomId(
            createInteractionToken("c", encounterId, interaction.user.id)
          )
          .setLabel("Préparer le Catalyseur")
          .setEmoji("⚗️")
          .setStyle(ButtonStyle.Success)
          .setDisabled(catalystCount < 1),
        new ButtonBuilder()
          .setCustomId(createInteractionToken("t", encounterId, interaction.user.id))
          .setLabel("Préparer le Filet")
          .setEmoji("🪢")
          .setStyle(ButtonStyle.Primary)
          .setDisabled(anchorCount < 1),
        new ButtonBuilder()
          .setCustomId(createInteractionToken("f", encounterId, interaction.user.id))
          .setLabel("Activer Talisman")
          .setEmoji("🍀")
          .setStyle(ButtonStyle.Success)
          .setDisabled(talismanCount < 1),
        new ButtonBuilder()
          .setCustomId(createInteractionToken("a", encounterId))
          .setLabel("Tenter la capture")
          .setEmoji("🎯")
          .setStyle(ButtonStyle.Secondary)
      ),
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId(createInteractionToken("I", encounterId, interaction.user.id))
          .setLabel("Idole : reroll doublon")
          .setEmoji("🗿")
          .setStyle(ButtonStyle.Primary)
          .setDisabled(!collectorIdol)
      )
    ]
  });
}

async function handleHintButton(
  interaction: ButtonInteraction,
  encounterId: string,
  boundUserId: string
) {
  requireBoundUser(boundUserId, interaction.user.id);
  await interaction.deferUpdate();
  const user = await usersService.getOrCreateDiscordUser(
    interaction.user.id,
    interaction.user.username,
    interaction.user.displayAvatarURL()
  );
  const result = await exploreService.revealEncounterHint(encounterId, user.id);
  await interaction.editReply({
    embeds: [
      new EmbedBuilder()
        .setColor(0xf1c40f)
        .setTitle("💡 Indice révélé")
        .setDescription(result.hint)
        .setFooter({ text: "Un Élixir de lucidité a été consommé." })
    ],
    components: []
  });
}

async function handleCatalystButton(
  interaction: ButtonInteraction,
  encounterId: string,
  boundUserId: string
) {
  requireBoundUser(boundUserId, interaction.user.id);
  await interaction.deferUpdate();
  const user = await usersService.getOrCreateDiscordUser(
    interaction.user.id,
    interaction.user.username,
    interaction.user.displayAvatarURL()
  );
  const result = await exploreService.prepareCaptureWithCatalyst(encounterId, user.id);
  await interaction.editReply({
    embeds: [
      new EmbedBuilder()
        .setColor(0x2ecc71)
        .setTitle("⚗️ Catalyseur prêt")
        .setDescription(
          `Ta prochaine tentative sur cette rencontre reçoit **+${result.bonus} points** ` +
          `de chance, avec un plafond de **${result.cap} %**.\n\n` +
          "Il sera consommé au moment de ta réponse. Le chrono de 30 secondes ne démarre " +
          "qu'en cliquant sur le bouton ci-dessous."
        )
    ],
    components: [
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId(createInteractionToken("a", encounterId))
          .setLabel("Démarrer les 30 secondes")
          .setEmoji("🎯")
          .setStyle(ButtonStyle.Success)
      )
    ]
  });
}

async function handleAnchorButton(
  interaction: ButtonInteraction,
  encounterId: string,
  boundUserId: string
) {
  requireBoundUser(boundUserId, interaction.user.id);
  await interaction.deferUpdate();
  const user = await usersService.getOrCreateDiscordUser(
    interaction.user.id,
    interaction.user.username,
    interaction.user.displayAvatarURL()
  );
  await exploreService.prepareCaptureWithAnchor(encounterId, user.id);
  await interaction.editReply({
    embeds: [
      new EmbedBuilder()
        .setColor(0x3498db)
        .setTitle("🪢 Filet d'ancrage prêt")
        .setDescription(
          "Il ne sera consommé que si ton premier jet échoue. Le second jet utilise " +
          "la chance normale, sans bonus du Catalyseur."
        )
    ],
    components: [
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId(createInteractionToken("a", encounterId))
          .setLabel("Démarrer la capture")
          .setStyle(ButtonStyle.Success)
      )
    ]
  });
}

async function handleFortuneTalismanButton(
  interaction: ButtonInteraction,
  encounterId: string,
  boundUserId: string
) {
  requireBoundUser(boundUserId, interaction.user.id);
  await interaction.deferUpdate();
  const user = await usersService.getOrCreateDiscordUser(
    interaction.user.id,
    interaction.user.username,
    interaction.user.displayAvatarURL()
  );
  await exploreService.activateFortuneTalisman(
    user.id,
    `discord:${interaction.id}:${encounterId}`
  );
  await interaction.editReply({
    embeds: [
      new EmbedBuilder()
        .setColor(0x2ecc71)
        .setTitle("🍀 Talisman de fortune actif")
        .setDescription(
          "Au prochain drop d'objet éligible, deux jets seront effectués et le tier " +
          "le plus rare sera conservé. L'effet reste actif si cette capture ne donne aucun objet."
        )
    ],
    components: [
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId(createInteractionToken("a", encounterId))
          .setLabel("Démarrer la capture")
          .setStyle(ButtonStyle.Success)
      )
    ]
  });
}

async function handleCollectorIdolButton(
  interaction: ButtonInteraction,
  encounterId: string,
  boundUserId: string
) {
  requireBoundUser(boundUserId, interaction.user.id);
  await interaction.deferUpdate();
  const user = await usersService.getOrCreateDiscordUser(
    interaction.user.id,
    interaction.user.username,
    interaction.user.displayAvatarURL()
  );
  const result = await exploreService.rerollDuplicateWithIdol(encounterId, user.id);
  const embed = new EmbedBuilder()
    .setColor(0x9b59b6)
    .setTitle("🗿 Idole du collectionneur")
    .setDescription(
      `**${result.previousCard.name}** était déjà dans ta collection.\n` +
      `L'Idole propose maintenant **${result.card.name}** ` +
      `(${result.card.rarity.name}, ${result.card.deck.name}).\n\n` +
      "Le remplacement peut lui aussi être un doublon. L'usage quotidien est consommé."
    );
  const files = await attachCardImage(embed, result.card);
  await interaction.editReply({
    embeds: [embed],
    files,
    components: [
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId(createInteractionToken("a", encounterId))
          .setLabel("Tenter la capture")
          .setStyle(ButtonStyle.Success)
      )
    ]
  });
}

async function handleAnswerSelect(
  interaction: StringSelectMenuInteraction,
  encounterId: string,
  boundUserId: string
) {
  requireBoundUser(boundUserId, interaction.user.id);
  await interaction.update({
    embeds: [captureCountdownEmbed(3)],
    components: []
  });
  const user = await usersService.getOrCreateDiscordUser(
    interaction.user.id,
    interaction.user.username,
    interaction.user.displayAvatarURL()
  );
  const result = await exploreService.submitAttempt({
    encounterId,
    userId: user.id,
    selectedCardId: interaction.values[0]!,
    operationKey: `discord:${interaction.id}`
  });
  await wait(1_000);
  await interaction.editReply({ embeds: [captureCountdownEmbed(2)], components: [] });
  await wait(1_000);
  await interaction.editReply({ embeds: [captureCountdownEmbed(1)], components: [] });
  await wait(1_000);
  const succeeded = result.attempt.status === "SUCCEEDED";
  let publicAt = result.publication.publishAfter;
  if (result.publication.phase === "PRIVATE" && result.publication.shouldSchedule) {
    const requestedPublicAt = new Date(Date.now() + PUBLICATION_DELAY_MS);
    try {
      const publication = await exploreService.scheduleEncounterPublication(
        encounterId,
        user.id,
        requestedPublicAt
      );
      if (publication) {
        publicAt = publication.publishAfter;
        queueEncounterPublication(
          interaction.client,
          encounterId,
          publication.publishAfter,
          (options) => interaction.followUp(options)
        );
      }
    } catch (error) {
      console.error("Unable to schedule encounter after the initiator capture", {
        encounterId,
        userId: user.id,
        error
      });
    }
  }
  const publicationNotice = result.publication.phase === "PUBLIC"
    ? "\n\n🌐 Cette rencontre est déjà publique et ne sera pas republiée."
    : publicAt
      ? `\n\n🌐 La rencontre sera proposée aux autres joueurs ` +
        `<t:${Math.floor(publicAt.getTime() / 1000)}:R>.`
      : "";
  const embed = new EmbedBuilder()
    .setColor(captureResultColor(succeeded, result.attempt.variant))
    .setTitle(succeeded ? "🎉 Capture réussie !" : "💨 La carte s'est échappée")
    .setDescription(
      `La carte était **${result.card.name}**.\n` +
      `Réponse : **${result.attempt.answerCorrect ? "correcte" : "incorrecte"}**\n` +
      `Chance finale : **${result.chancePercent.toFixed(1)} %**` +
      (result.attempt.preparation.includes("precision_catalyst")
        ? "\n⚗️ Catalyseur de précision appliqué"
        : "") +
      (result.gameplay?.anchorUsed ? "\n🪢 Filet d'ancrage : seconde tentative jouée" : "") +
      (result.gameplay?.scopeLockUsed ? "\n🎯 Verrouillage : la cible n'a pas fui" : "") +
      (result.gameplay?.momentumUsed
        ? `\n⚡ Lucky Pulse déclenché · Momentum restant : ${result.gameplay.momentum}`
        : "") +
      (result.gameplay?.traceGained
        ? `\n🌑 Trace du Néant obtenue : ${result.gameplay.voidTraces}/9`
        : "") +
      (result.gameplay?.chainReady
        ? "\n🧭 Balise de passage prête : tu peux enchaîner une exploration."
        : "") +
      (result.gameplay?.secretRouteUnlocked
        ? "\n🗝️ Passage secret ouvert : ta prochaine exploration sera Rare minimum."
        : "") +
      (succeeded && result.attempt.variant
        ? `\nVariante obtenue : **${result.attempt.variant.toLowerCase()}**`
        : "") +
      (succeeded
        ? `\n\n🎁 **Récompenses : +${result.rewards.xp} XP • ` +
          `+${result.rewards.credits} crédits**` +
          (result.rewards.item
            ? `\n🎒 Objet trouvé : **${result.rewards.item.name}** ` +
              `(${result.rewards.item.tierLabel})`
            : "") +
          (result.rewards.bossOffering
            ? `\n🔥 Offrande de boss trouvée : **${result.rewards.bossOffering.name}** ` +
              `(source : ${result.rewards.bossOffering.sourceLabel})`
            : "")
        : "\n\nAucune récompense : retente ta chance lors d'une prochaine rencontre.") +
      publicationNotice
    );
  const files = await attachCardImage(
    embed,
    result.card,
    succeeded ? result.attempt.variant : "normal"
  );
  await interaction.editReply({
    embeds: [embed],
    components: interaction.guildId ? hubComponents(interaction.guildId) : [],
    files
  });
  if (succeeded && result.attempt.variant) {
    await announceHallOfFameCapture({
      client: interaction.client,
      sourceGuildId: interaction.guildId,
      playerDiscordId: interaction.user.id,
      captureAttemptId: result.attempt.id,
      cardId: result.card.id,
      variant: result.attempt.variant
    });
  }
}

export async function handleRtaButton(interaction: ButtonInteraction) {
  const token = parseInteractionToken(interaction.customId);
  if (token.action === "K") {
    await interaction.deferReply({ ephemeral: true });
    const user = await usersService.getOrCreateDiscordUser(
      interaction.user.id,
      interaction.user.username,
      interaction.user.displayAvatarURL()
    );
    await handleContractFulfill(interaction, user, token.parts[0]!);
    return;
  }
  if (token.action === "M" || token.action === "O") {
    requireBoundUser(token.parts[0]!, interaction.user.id);
    await interaction.deferUpdate();
    const user = await usersService.getOrCreateDiscordUser(
      interaction.user.id,
      interaction.user.username,
      interaction.user.displayAvatarURL()
    );
    if (token.action === "M") {
      await handleContractOptIn(interaction, user);
    } else {
      await handleContractCreate(
        interaction,
        user,
        token.parts[1]!,
        token.parts[2]!
      );
    }
    return;
  }
  if (token.action === "U") {
    requireBoundUser(token.parts[0]!, interaction.user.id);
    await interaction.deferUpdate();
    const user = await usersService.getOrCreateDiscordUser(
      interaction.user.id,
      interaction.user.username,
      interaction.user.displayAvatarURL()
    );
    await handleBoosterInventory(interaction, user);
    return;
  }
  if (token.action === "P" || token.action === "Q" || token.action === "R") {
    requireBoundUser(token.parts[0]!, interaction.user.id);
    await interaction.deferUpdate();
    const user = await usersService.getOrCreateDiscordUser(
      interaction.user.id,
      interaction.user.username,
      interaction.user.displayAvatarURL()
    );
    if (token.action === "P") {
      await handleConquerorBoosterPreview(
        interaction,
        user,
        token.parts[1]!,
        Number(token.parts[2]),
        [Number(token.parts[3])]
      );
    } else if (token.action === "Q") {
      await handleConquerorBoosterConfirm(
        interaction,
        user,
        token.parts[1]!,
        Number(token.parts[2]),
        token.parts.slice(3).map(Number)
      );
    } else {
      await handleConquerorBoosterBack(
        interaction,
        user,
        token.parts[1]!,
        Number(token.parts[2])
      );
    }
    return;
  }
  if (token.action === "m" || token.action === "v") {
    requireBoundUser(token.parts[0]!, interaction.user.id);
    await interaction.deferUpdate();
    const user = await usersService.getOrCreateDiscordUser(
      interaction.user.id,
      interaction.user.username,
      interaction.user.displayAvatarURL()
    );
    if (token.action === "m") {
      await handleRecycleCardConfirm(interaction, user, token.parts[1]!);
    } else {
      await handleRecycleCardCancel(interaction, user);
    }
    return;
  }
  if (token.action === "e") {
    await handleExploreButton(interaction, token.parts[0]!);
    return;
  }
  if (token.action === "a") {
    await handleAttemptButton(interaction, token.parts[0]!);
    return;
  }
  if (token.action === "T") {
    await handleTargetChoiceButton(interaction, token.parts[0]!, token.parts[1]!);
    return;
  }
  if (token.action === "o") {
    await handleEncounterItemsButton(interaction, token.parts[0]!);
    return;
  }
  if (token.action === "h") {
    await handleHintButton(interaction, token.parts[0]!, token.parts[1]!);
    return;
  }
  if (token.action === "c") {
    await handleCatalystButton(interaction, token.parts[0]!, token.parts[1]!);
    return;
  }
  if (token.action === "t") {
    await handleAnchorButton(interaction, token.parts[0]!, token.parts[1]!);
    return;
  }
  if (token.action === "f") {
    await handleFortuneTalismanButton(interaction, token.parts[0]!, token.parts[1]!);
    return;
  }
  if (token.action === "I") {
    await handleCollectorIdolButton(interaction, token.parts[0]!, token.parts[1]!);
    return;
  }
  if (token.action === "n") {
    await handleZoneButton(
      interaction,
      token.parts[0]!,
      token.parts[1]!,
      Number(token.parts[2]),
      Number(token.parts[3]),
      token.parts.slice(4).map(Number)
    );
    return;
  }
  if (token.action === "p") {
    const payment = token.parts[4];
    if (payment !== "PASS" && payment !== "CREDITS") {
      throw new AppError("Mode de paiement premium invalide.", 400);
    }
    await handleZoneButton(
      interaction,
      token.parts[0]!,
      token.parts[1]!,
      Number(token.parts[2]),
      Number(token.parts[3]),
      [Number(token.parts[3])],
      payment
    );
    return;
  }
  if (token.action === "i") {
    await handleItemsButton(
      interaction,
      token.parts[0]!,
      token.parts[1]!,
      Number(token.parts[2]),
      token.parts.slice(3).map(Number)
    );
    return;
  }
  if (token.action === "r") {
    await handleRerollButton(
      interaction,
      token.parts[0]!,
      token.parts[1]!,
      Number(token.parts[2]),
      token.parts.slice(3, -1).map(Number),
      Number(token.parts.at(-1))
    );
    return;
  }
  if (token.action === "s") {
    await handleScannerButton(
      interaction,
      token.parts[0]!,
      token.parts[1]!,
      Number(token.parts[2]),
      token.parts.slice(3, -1).map(Number),
      Number(token.parts.at(-1))
    );
    return;
  }
  if (token.action === "u") {
    await handleTierIncenseButton(
      interaction,
      token.parts[0]!,
      token.parts[1]!,
      Number(token.parts[2]),
      token.parts.slice(3, -1).map(Number),
      token.parts.at(-1)!
    );
    return;
  }
  if (token.action === "b") {
    await handleBackToZones(
      interaction,
      token.parts[0]!,
      token.parts[1]!,
      Number(token.parts[2]),
      token.parts.slice(3).map(Number)
    );
    return;
  }
  if (token.action === "g") {
    await interaction.deferReply({ ephemeral: true });
    const user = await usersService.getOrCreateDiscordUser(
      interaction.user.id,
      interaction.user.username,
      interaction.user.displayAvatarURL()
    );
    const section = token.parts[0];
    if (section === "profile") {
      await handleProfile(interaction, user);
      return;
    }
    if (section === "collection") {
      await handleInventory(interaction, user);
      return;
    }
    if (section === "quests") {
      await handleQuests(interaction, user);
      return;
    }
    if (section === "boss") {
      await handleBoss(interaction, user);
      return;
    }
    if (section === "shop") {
      await handleShop(interaction, user);
      return;
    }
    if (section === "items") {
      await handleItems(interaction, user);
      return;
    }
    if (section === "skills") {
      await handleSkills(interaction, user);
      return;
    }
    if (section === "achievements") {
      await handleAchievements(interaction, user);
      return;
    }
    if (section === "contracts") {
      await handleContracts(interaction, user);
      return;
    }
    await interaction.editReply(`Utilise la commande \`/${section}\` pour ouvrir cette section.`);
    return;
  }
  if (token.action === "j") {
    await handleBossButton(interaction, token.parts);
    return;
  }
  if (token.action === "A") {
    requireBoundUser(token.parts[0]!, interaction.user.id);
    await interaction.deferUpdate();
    const user = await usersService.getOrCreateDiscordUser(
      interaction.user.id,
      interaction.user.username,
      interaction.user.displayAvatarURL()
    );
    await handleAchievements(
      interaction,
      user,
      token.parts[1] ?? "ALL",
      Number(token.parts[2] ?? 0)
    );
    return;
  }
  throw new AppError("Action RTA inconnue.", 400);
}

export async function handleRtaSelect(interaction: StringSelectMenuInteraction) {
  const token = parseInteractionToken(interaction.customId);
  if (token.action === "K") {
    await handleBossCardSelect(interaction, token.parts);
    return;
  }
  if (token.action === "S" || token.action === "N" || token.action === "L") {
    requireBoundUser(token.parts[0]!, interaction.user.id);
    await interaction.deferUpdate();
    const user = await usersService.getOrCreateDiscordUser(
      interaction.user.id,
      interaction.user.username,
      interaction.user.displayAvatarURL()
    );
    if (token.action === "S") {
      await handleContractDeckSelect(interaction, user, interaction.values[0]!);
    } else if (token.action === "N") {
      await handleContractCardSelect(interaction, user, interaction.values[0]!);
    } else {
      await handleContractCancel(interaction, user, interaction.values[0]!);
    }
    return;
  }
  if (token.action === "E") {
    requireBoundUser(token.parts[0]!, interaction.user.id);
    await interaction.deferUpdate();
    const user = await usersService.getOrCreateDiscordUser(
      interaction.user.id,
      interaction.user.username,
      interaction.user.displayAvatarURL()
    );
    await handleConquerorRewardSelect(interaction, user, interaction.values[0]!);
    return;
  }
  if (token.action === "Y") {
    requireBoundUser(token.parts[0]!, interaction.user.id);
    await interaction.deferUpdate();
    const user = await usersService.getOrCreateDiscordUser(
      interaction.user.id,
      interaction.user.username,
      interaction.user.displayAvatarURL()
    );
    await handleConquerorBoosterPreview(
      interaction,
      user,
      token.parts[1]!,
      Number(token.parts[2]),
      interaction.values.map(Number)
    );
    return;
  }
  if (token.action === "d") {
    requireBoundUser(token.parts[0]!, interaction.user.id);
    await interaction.deferUpdate();
    const user = await usersService.getOrCreateDiscordUser(
      interaction.user.id,
      interaction.user.username,
      interaction.user.displayAvatarURL()
    );
    await handleRecycleCardSelect(interaction, user, interaction.values[0]!);
    return;
  }
  if (token.action === "l") {
    requireBoundUser(token.parts[0]!, interaction.user.id);
    await interaction.deferUpdate();
    const user = await usersService.getOrCreateDiscordUser(
      interaction.user.id,
      interaction.user.username,
      interaction.user.displayAvatarURL()
    );
    await handleSkills(interaction, user, interaction.values[0]);
    return;
  }
  if (token.action === "k") {
    requireBoundUser(token.parts[0]!, interaction.user.id);
    await interaction.deferUpdate();
    const user = await usersService.getOrCreateDiscordUser(
      interaction.user.id,
      interaction.user.username,
      interaction.user.displayAvatarURL()
    );
    await handleShop(interaction, user, interaction.values[0]);
    return;
  }
  if (token.action === "w") {
    await handleWorldSelect(interaction, token.parts[0]!, token.parts[1]!);
    return;
  }
  if (token.action === "q") {
    await handleAnswerSelect(interaction, token.parts[0]!, token.parts[1]!);
    return;
  }
  if (token.action === "F") {
    requireBoundUser(token.parts[1]!, interaction.user.id);
    await interaction.deferUpdate();
    const user = await usersService.getOrCreateDiscordUser(
      interaction.user.id,
      interaction.user.username,
      interaction.user.displayAvatarURL()
    );
    const [deckId, modifier] = interaction.values[0]!.split("|");
    const activation = await exploreService.activateAffinityIncense({
      userId: user.id,
      deckId: deckId!,
      useHourglass: modifier === "hourglass",
      operationKey: `discord:${interaction.id}`
    });
    const worldPosition = Number(token.parts[2]);
    const zonePositions = token.parts.slice(3).map(Number);
    const updatedProposal = await exploreService.resolveZoneProposals(
      token.parts[0]!,
      worldPosition,
      zonePositions
    );
    await interaction.editReply(zoneProposalPayload(
      token.parts[0]!,
      token.parts[1]!,
      worldPosition,
      updatedProposal,
      `🕯️ Encens d'affinité **${activation.deckName ?? "deck choisi"}** actif pour ` +
      `${activation.remainingUses} explorations.`
    ));
    return;
  }
  if (token.action === "x") {
    requireBoundUser(token.parts[0]!, interaction.user.id);
    await interaction.deferUpdate();
    const user = await usersService.getOrCreateDiscordUser(
      interaction.user.id,
      interaction.user.username,
      interaction.user.displayAvatarURL()
    );
    await handleProfileEquipmentSelect(interaction, user);
    return;
  }
  if (token.action === "y") {
    requireBoundUser(token.parts[0]!, interaction.user.id);
    await interaction.deferUpdate();
    const user = await usersService.getOrCreateDiscordUser(
      interaction.user.id,
      interaction.user.username,
      interaction.user.displayAvatarURL()
    );
    await applyEquipmentSelection(interaction, user);
    await handleItems(interaction, user);
    return;
  }
  if (token.action === "C") {
    requireBoundUser(token.parts[0]!, interaction.user.id);
    await interaction.deferUpdate();
    const user = await usersService.getOrCreateDiscordUser(
      interaction.user.id,
      interaction.user.username,
      interaction.user.displayAvatarURL()
    );
    await archiveService.archiveNextAvailable(user.id, interaction.values[0]!);
    await handleItems(interaction, user);
    return;
  }
  if (token.action === "D") {
    requireBoundUser(token.parts[0]!, interaction.user.id);
    await interaction.deferUpdate();
    const user = await usersService.getOrCreateDiscordUser(
      interaction.user.id,
      interaction.user.username,
      interaction.user.displayAvatarURL()
    );
    const value = interaction.values[0]!;
    if (value.startsWith("claim|")) {
      const choice = value.slice(6);
      if (choice !== "credits" && choice !== "fragments" && choice !== "booster") {
        throw new AppError("Récompense d'exposition invalide.", 400);
      }
      await archiveService.claimWeeklyExhibition(user.id, choice);
    } else if (value === "noop") {
      await handleItems(interaction, user);
      return;
    } else {
      const slot = Number(value.split("|")[1]);
      await archiveService.removeFromArchive(user.id, slot);
    }
    await handleItems(interaction, user);
    return;
  }
  if (token.action === "W") {
    requireBoundUser(token.parts[0]!, interaction.user.id);
    await interaction.deferUpdate();
    const user = await usersService.getOrCreateDiscordUser(
      interaction.user.id,
      interaction.user.username,
      interaction.user.displayAvatarURL()
    );
    const value = interaction.values[0]!;
    if (value.startsWith("pin|")) {
      await archiveService.togglePinnedMissingCard(user.id, value.slice(4));
    } else {
      await archiveService.setWishlistDeck(user.id, value === "clear" ? null : value);
    }
    await handleItems(interaction, user);
    return;
  }
  if (token.action === "Z") {
    requireBoundUser(token.parts[0]!, interaction.user.id);
    await interaction.deferUpdate();
    const user = await usersService.getOrCreateDiscordUser(
      interaction.user.id,
      interaction.user.username,
      interaction.user.displayAvatarURL()
    );
    const draftKey = token.parts[1]!;
    const reward = await fusionService.fusePreparedDraft(
      user.id,
      draftKey,
      interaction.values[0]!
    );
    await interaction.editReply({
      embeds: [
        new EmbedBuilder()
          .setColor(0xffd700)
          .setTitle("✨ Fusion réussie")
          .setDescription(fusionReceipt(reward))
      ],
      components: []
    });
    return;
  }
  if (token.action === "B") {
    requireBoundUser(token.parts[0]!, interaction.user.id);
    await interaction.deferUpdate();
    const user = await usersService.getOrCreateDiscordUser(
      interaction.user.id,
      interaction.user.username,
      interaction.user.displayAvatarURL()
    );
    await handleAchievements(interaction, user, interaction.values[0] ?? "ALL", 0);
    return;
  }
  if (token.action === "G") {
    requireBoundUser(token.parts[0]!, interaction.user.id);
    await interaction.deferUpdate();
    const user = await usersService.getOrCreateDiscordUser(
      interaction.user.id,
      interaction.user.username,
      interaction.user.displayAvatarURL()
    );
    const selectedAchievementIds = interaction.values.filter((value) => value !== "none");
    await achievementService.setSelectedBadges(user.id, selectedAchievementIds);
    const synced = await discordAchievementRoleService.syncUserBadges(
      user.id,
      process.env.DISCORD_TOKEN ?? ""
    );
    await handleAchievements(
      interaction,
      user,
      "ALL",
      0,
      `✅ Rôles synchronisés sur **${synced.guildName}** : ` +
        (synced.selectedNames.length > 0 ? synced.selectedNames.join(", ") : "aucun badge affiché")
    );
    return;
  }
  throw new AppError("Menu RTA inconnu.", 400);
}
