import { EmbedBuilder, type ChatInputCommandInteraction } from "discord.js";
import {
  tradeService,
  usersService,
  prisma,
  AppError
} from "../service-instances.js";
import {
  findCardByName,
  resolveActiveTradeForUser,
  resolveIncomingTradeForUser,
  isTradeAccepted
} from "../helpers.js";

export async function handleTrade(interaction: ChatInputCommandInteraction, user: any) {
  const group = interaction.options.getSubcommandGroup(false);
  const sub = interaction.options.getSubcommand();

  if (sub === "user") {
    const target = interaction.options.getUser("user", true);
    if (target.id === interaction.user.id) {
      const embed = new EmbedBuilder().setColor(0xf44336).setDescription("Tu ne peux pas trader avec toi-même.");
      await interaction.editReply({ embeds: [embed] });
      return;
    }

    const targetUser = await usersService.getOrCreateDiscordUser(target.id, target.username, target.displayAvatarURL());
    const existing = await prisma.trade.findFirst({
      where: {
        status: "pending",
        expiresAt: { gt: new Date() },
        OR: [
          { user1Id: user.id, user2Id: targetUser.id },
          { user1Id: targetUser.id, user2Id: user.id }
        ]
      },
      orderBy: { createdAt: "desc" }
    });

    const trade = existing ?? await tradeService.startTrade(user.id, targetUser.id);
    const embed = new EmbedBuilder()
      .setColor(0x4caf50)
      .setDescription(`🤝 Demande de trade envoyée à <@${target.id}>.\nIl doit faire **/trade accept** pour ouvrir la phase de trade.`);
    await interaction.editReply({ embeds: [embed] });
    return;
  }

  if (sub === "accept") {
    const trade = await resolveIncomingTradeForUser(user.id);
    if (!trade) {
      const embed = new EmbedBuilder().setColor(0xf44336).setDescription("Aucune demande de trade en attente.");
      await interaction.editReply({ embeds: [embed] });
      return;
    }

    const alreadyAccepted = await isTradeAccepted(trade.id);
    if (!alreadyAccepted) {
      await prisma.adminLog.create({
        data: {
          action: "TRADE_ACCEPTED",
          target: trade.id,
          metadata: { acceptedBy: user.id }
        }
      });
    }

    const embed = new EmbedBuilder()
      .setColor(0x4caf50)
      .setDescription("✅ Trade accepté. Vous pouvez maintenant faire /trade add card|booster, puis /trade confirm des deux côtés.");
    await interaction.editReply({ embeds: [embed] });
    return;
  }

  if (group === "add" && sub === "card") {
    const trade = await resolveActiveTradeForUser(user.id);
    if (!trade) {
      const embed = new EmbedBuilder().setColor(0xf44336).setDescription("Aucun trade actif. Lance d'abord /trade user @joueur.");
      await interaction.editReply({ embeds: [embed] });
      return;
    }
    if (!(await isTradeAccepted(trade.id))) {
      const embed = new EmbedBuilder().setColor(0xf44336).setDescription("Le trade n'est pas encore accepté. Le joueur invité doit faire /trade accept.");
      await interaction.editReply({ embeds: [embed] });
      return;
    }

    const cardName = interaction.options.getString("carte", true);
    const qty = interaction.options.getInteger("quantity") ?? 1;
    const variant = (interaction.options.getString("variant") ?? "normal") as "normal" | "shiny" | "holo";
    const card = await findCardByName(cardName);
    if (!card) {
      const embed = new EmbedBuilder().setColor(0xf44336).setDescription("Carte introuvable");
      await interaction.editReply({ embeds: [embed] });
      return;
    }
    await tradeService.addItem(trade.id, user.id, card.id, qty, variant);
    const embed = new EmbedBuilder().setColor(0x4caf50).setDescription("Carte ajoutee au trade");
    await interaction.editReply({ embeds: [embed] });
    return;
  }

  if (group === "add" && sub === "booster") {
    const trade = await resolveActiveTradeForUser(user.id);
    if (!trade) {
      const embed = new EmbedBuilder().setColor(0xf44336).setDescription("Aucun trade actif. Lance d'abord /trade user @joueur.");
      await interaction.editReply({ embeds: [embed] });
      return;
    }
    if (!(await isTradeAccepted(trade.id))) {
      const embed = new EmbedBuilder().setColor(0xf44336).setDescription("Le trade n'est pas encore accepté. Le joueur invité doit faire /trade accept.");
      await interaction.editReply({ embeds: [embed] });
      return;
    }

    const qty = interaction.options.getInteger("quantity") ?? 1;
    const type = interaction.options.getString("type", true) as "basic" | "rare" | "epic" | "legendary";
    await tradeService.addBooster(trade.id, user.id, type, qty);
    const embed = new EmbedBuilder().setColor(0x4caf50).setDescription("Booster ajouté au trade");
    await interaction.editReply({ embeds: [embed] });
    return;
  }

  if (group === "remove" && sub === "card") {
    const trade = await resolveActiveTradeForUser(user.id);
    if (!trade) {
      const embed = new EmbedBuilder().setColor(0xf44336).setDescription("Aucun trade actif.");
      await interaction.editReply({ embeds: [embed] });
      return;
    }
    if (!(await isTradeAccepted(trade.id))) {
      const embed = new EmbedBuilder().setColor(0xf44336).setDescription("Le trade n'est pas encore accepté. Le joueur invité doit faire /trade accept.");
      await interaction.editReply({ embeds: [embed] });
      return;
    }

    const cardName = interaction.options.getString("carte", true);
    const qty = interaction.options.getInteger("quantity") ?? 1;
    const variant = (interaction.options.getString("variant") ?? "normal") as "normal" | "shiny" | "holo";
    const card = await findCardByName(cardName);
    if (!card) {
      const embed = new EmbedBuilder().setColor(0xf44336).setDescription("Carte introuvable");
      await interaction.editReply({ embeds: [embed] });
      return;
    }
    await tradeService.removeItem(trade.id, user.id, card.id, qty, variant);
    const embed = new EmbedBuilder().setColor(0xff9800).setDescription("Carte retiree du trade");
    await interaction.editReply({ embeds: [embed] });
    return;
  }

  if (group === "remove" && sub === "booster") {
    const trade = await resolveActiveTradeForUser(user.id);
    if (!trade) {
      const embed = new EmbedBuilder().setColor(0xf44336).setDescription("Aucun trade actif.");
      await interaction.editReply({ embeds: [embed] });
      return;
    }
    if (!(await isTradeAccepted(trade.id))) {
      const embed = new EmbedBuilder().setColor(0xf44336).setDescription("Le trade n'est pas encore accepté. Le joueur invité doit faire /trade accept.");
      await interaction.editReply({ embeds: [embed] });
      return;
    }

    const qty = interaction.options.getInteger("quantity") ?? 1;
    const type = interaction.options.getString("type", true) as "basic" | "rare" | "epic" | "legendary";
    await tradeService.removeBooster(trade.id, user.id, type, qty);
    const embed = new EmbedBuilder().setColor(0xff9800).setDescription("Booster retiré du trade");
    await interaction.editReply({ embeds: [embed] });
    return;
  }

  if (sub === "confirm") {
    const activeTrade = await resolveActiveTradeForUser(user.id);
    if (!activeTrade) {
      const embed = new EmbedBuilder().setColor(0xf44336).setDescription("Aucun trade actif à confirmer.");
      await interaction.editReply({ embeds: [embed] });
      return;
    }
    if (!(await isTradeAccepted(activeTrade.id))) {
      const embed = new EmbedBuilder().setColor(0xf44336).setDescription("Le trade n'est pas encore accepté. Le joueur invité doit faire /trade accept.");
      await interaction.editReply({ embeds: [embed] });
      return;
    }

    const trade = await tradeService.confirmTrade(activeTrade.id, user.id);
    if (!trade) {
      const embed = new EmbedBuilder().setColor(0xf44336).setDescription("Trade introuvable");
      await interaction.editReply({ embeds: [embed] });
      return;
    }
    if (trade.status === "completed") {
      const embed = new EmbedBuilder().setColor(0x4caf50).setDescription("✅ Trade complété avec succès.");
      await interaction.editReply({ embeds: [embed] });
      return;
    }
    const embed = new EmbedBuilder().setColor(0xff9800).setDescription("✅ Confirmation prise en compte. En attente de l'autre joueur.");
    await interaction.editReply({ embeds: [embed] });
    return;
  }

  if (sub === "cancel") {
    const activeTrade = await resolveActiveTradeForUser(user.id);
    if (!activeTrade) {
      const embed = new EmbedBuilder().setColor(0xf44336).setDescription("Aucun trade actif à annuler.");
      await interaction.editReply({ embeds: [embed] });
      return;
    }
    await tradeService.cancelTrade(activeTrade.id, user.id);
    const embed = new EmbedBuilder().setColor(0xf44336).setDescription("Trade annule");
    await interaction.editReply({ embeds: [embed] });
    return;
  }
}
