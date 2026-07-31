import { prisma } from "@rta/database";
import { handleShop } from "../apps/bot/dist/commands/handlers/shop.js";
import { handleCardinfo } from "../apps/bot/dist/commands/handlers/cardinfo.js";
import { commandIsPrivate } from "../apps/bot/dist/core/register-client-events.js";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function fakeInteraction(id, options = {}) {
  const replies = [];
  return {
    id,
    options: {
      getString(name) {
        return options[name] ?? null;
      }
    },
    async editReply(payload) {
      replies.push(payload);
    },
    replies
  };
}

try {
  const user = await prisma.user.findFirst({
    orderBy: { createdAt: "asc" },
    select: { id: true, credits: true }
  });
  assert(user, "Aucun utilisateur disponible pour le smoke test.");

  const card = await prisma.card.findFirst({
    where: {
      source: "vault",
      status: "PUBLISHED",
      isActive: true,
      contentKey: { not: null }
    },
    orderBy: { contentKey: "asc" },
    select: { contentKey: true }
  });
  assert(card?.contentKey, "Aucune carte Vault publiée disponible.");

  const shopInteraction = fakeInteraction("smoke-shop-balance");
  await handleShop(shopInteraction, user);
  const shopPayload = shopInteraction.replies.at(-1);
  const shopEmbed = shopPayload?.embeds?.[0]?.toJSON();
  assert(shopEmbed?.description?.includes("Ton solde"), "Le solde est absent de /shop.");
  assert(
    shopEmbed.description.includes(user.credits.toLocaleString("fr-FR")),
    "Le solde affiché par /shop ne correspond pas à la base."
  );
  assert(commandIsPrivate("shop"), "/shop n'est pas configuré en réponse privée.");

  const cardInteraction = fakeInteraction("smoke-cardinfo", {
    nom: card.contentKey,
    variant: "normal"
  });
  await handleCardinfo(cardInteraction, user);
  const cardPayload = cardInteraction.replies.at(-1);
  const cardEmbed = cardPayload?.embeds?.[0]?.toJSON();
  assert(cardEmbed?.title, "/cardinfo n'a produit aucun embed.");
  assert(
    cardEmbed.fields?.some((field) => field.name === "Identifiant Vault"),
    "/cardinfo n'affiche pas l'identifiant Vault."
  );
  assert(cardPayload.files?.length === 1, "/cardinfo n'a joint aucune image.");
  assert(
    Buffer.isBuffer(cardPayload.files[0].attachment) &&
      cardPayload.files[0].attachment.length > 0,
    "L'image jointe par /cardinfo est vide."
  );

  console.log(JSON.stringify({
    shop: {
      privateReplyConfigured: commandIsPrivate("shop"),
      credits: user.credits,
      catalogFields: shopEmbed.fields?.length ?? 0
    },
    cardinfo: {
      contentKey: card.contentKey,
      title: cardEmbed.title,
      attachedImageBytes: cardPayload.files[0].attachment.length
    }
  }, null, 2));
} finally {
  await prisma.$disconnect();
}
