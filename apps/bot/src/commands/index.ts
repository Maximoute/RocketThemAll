import {
  type ChatInputCommandInteraction,
  type AutocompleteInteraction,
  type ButtonInteraction,
  type StringSelectMenuInteraction
} from "discord.js";
import { usersService } from "./service-instances.js";
import {
  handleSell,
  handleRecycle,
  handleFusion,
  handleValue,
  handleDaily
} from "./handlers/economy.js";
import {
  handleShop
} from "./handlers/shop.js";
import { handleInventory, handleInventoryButton } from "./handlers/inventory.js";
import { handleProfile } from "./handlers/profile.js";
import {
  handleCardinfo,
  handleCardinfoAutocomplete
} from "./handlers/cardinfo.js";
import {
  handleShowcard,
  handleShowcardAutocomplete
} from "./handlers/showcard.js";
import { handleLeaderboard } from "./handlers/leaderboard.js";
import { handleTrade } from "./handlers/trade.js";
import {
  handleExplore,
  handleRtaButton,
  handleRtaSelect
} from "./handlers/explore.js";
import {
  handleAchievements,
  handleBoss,
  handleItems,
  handleQuests,
  handleSkills
} from "./handlers/v2-views.js";

const commandHandlers: Record<string, (interaction: ChatInputCommandInteraction, user: any) => Promise<void>> = {
  explore: handleExplore,
  sell: handleSell,
  recycle: handleRecycle,
  fragment: handleRecycle,
  fusion: handleFusion,
  value: handleValue,
  daily: handleDaily,
  shop: handleShop,
  collection: handleInventory,
  profile: handleProfile,
  quests: handleQuests,
  achievements: handleAchievements,
  skills: handleSkills,
  items: handleItems,
  boss: handleBoss,
  cardinfo: handleCardinfo,
  showcard: handleShowcard,
  leaderboard: handleLeaderboard,
  trade: handleTrade
};

export async function handleCommand(interaction: ChatInputCommandInteraction) {
  const discordId = interaction.user.id;
  const user = await usersService.getOrCreateDiscordUser(
    discordId,
    interaction.user.username,
    interaction.user.displayAvatarURL()
  );

  if (["booster", "boosters", "craft"].includes(interaction.commandName)) {
    await interaction.editReply(
      "Cette ancienne commande a été retirée. Ouvre `/items`, puis utilise le bouton **Ouvrir un booster**."
    );
    return;
  }

  const handler = commandHandlers[interaction.commandName];
  if (handler) {
    await handler(interaction, user);
  }
}

export async function handleButton(interaction: ButtonInteraction) {
  if (interaction.customId.startsWith("rta|")) {
    await handleRtaButton(interaction);
    return;
  }
  if (interaction.customId.startsWith("inv_")) {
    await handleInventoryButton(interaction);
  }
}

export async function handleAutocomplete(interaction: AutocompleteInteraction) {
  if (interaction.commandName === "showcard") {
    await handleShowcardAutocomplete(interaction);
    return;
  }
  if (interaction.commandName === "cardinfo") {
    await handleCardinfoAutocomplete(interaction);
    return;
  }
  await interaction.respond([]);
}

export async function handleSelectMenu(interaction: StringSelectMenuInteraction) {
  if (interaction.customId.startsWith("rta|")) {
    await handleRtaSelect(interaction);
  }
}

export { clearGuildCommands, registerCommands } from "./register.js";
