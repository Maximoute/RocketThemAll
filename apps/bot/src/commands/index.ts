import {
  type ChatInputCommandInteraction,
  type ButtonInteraction
} from "discord.js";
import { usersService } from "./service-instances.js";
import { handleSpawn } from "./handlers/spawn.js";
import { handleCapture } from "./handlers/capture.js";
import {
  handleSell,
  handleRecycle,
  handleFusion,
  handleValue,
  handleDaily
} from "./handlers/economy.js";
import {
  handleShop,
  handleBoosters,
  handleCraft,
  handleBoosterBuy,
  handleBoosterOpen
} from "./handlers/shop.js";
import { handleInventory, handleInventoryButton } from "./handlers/inventory.js";
import { handleProfile } from "./handlers/profile.js";
import { handleCardinfo } from "./handlers/cardinfo.js";
import { handleLeaderboard } from "./handlers/leaderboard.js";
import { handleTrade } from "./handlers/trade.js";
import { handleAdmin } from "./handlers/admin.js";

const commandHandlers: Record<string, (interaction: ChatInputCommandInteraction, user: any) => Promise<void>> = {
  spawn: handleSpawn,
  capture: handleCapture,
  sell: handleSell,
  recycle: handleRecycle,
  fragment: handleRecycle,
  fusion: handleFusion,
  value: handleValue,
  daily: handleDaily,
  shop: handleShop,
  boosters: handleBoosters,
  craft: handleCraft,
  inventory: handleInventory,
  profile: handleProfile,
  cardinfo: handleCardinfo,
  leaderboard: handleLeaderboard,
  trade: handleTrade,
  admin: handleAdmin
};

export async function handleCommand(interaction: ChatInputCommandInteraction) {
  const discordId = interaction.user.id;
  const user = await usersService.getOrCreateDiscordUser(
    discordId,
    interaction.user.username,
    interaction.user.displayAvatarURL()
  );

  // Booster buy/open are subcommands of "booster" but routed separately
  if (interaction.commandName === "booster") {
    const sub = interaction.options.getSubcommand();
    if (sub === "buy") {
      await handleBoosterBuy(interaction, user);
      return;
    }
    if (sub === "open") {
      await handleBoosterOpen(interaction, user);
      return;
    }
  }

  const handler = commandHandlers[interaction.commandName];
  if (handler) {
    await handler(interaction, user);
  }
}

export async function handleButton(interaction: ButtonInteraction) {
  if (interaction.customId.startsWith("inv_")) {
    await handleInventoryButton(interaction);
  }
}

export { registerCommands, registerGuildCommands } from "./register.js";
