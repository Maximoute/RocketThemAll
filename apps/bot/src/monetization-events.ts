import {
  type Client,
  type Entitlement
} from "discord.js";
import {
  configuredDiscordSku,
  discordMonetizationEnabled,
  MONETIZATION_PRODUCTS
} from "@rta/services";
import { monetizationService } from "./commands/service-instances.js";

async function syncEntitlement(entitlement: Entitlement) {
  if (!entitlement.userId) return;
  const discordUser = await entitlement.fetchUser();
  const result = await monetizationService.syncDiscordEntitlement({
    entitlementId: entitlement.id,
    skuId: entitlement.skuId,
    discordUserId: entitlement.userId,
    username: discordUser.username,
    avatarUrl: discordUser.displayAvatarURL(),
    active: entitlement.isActive(),
    consumed: entitlement.consumed,
    startsAt: entitlement.startsAt,
    endsAt: entitlement.endsAt,
    deleted: entitlement.deleted
  });
  if (result.shouldConsume) {
    await entitlement.consume();
  }
}

export async function syncDiscordMonetization(client: Client<true>) {
  if (!discordMonetizationEnabled()) return;
  const skuIds = Object.values(MONETIZATION_PRODUCTS)
    .map((product) => configuredDiscordSku(product.key))
    .filter((skuId): skuId is string => Boolean(skuId));
  for (const skuId of skuIds) {
    let after: string | undefined;
    for (;;) {
      const entitlements = await client.application.entitlements.fetch({
        skus: [skuId],
        limit: 100,
        excludeDeleted: false,
        excludeEnded: false,
        cache: false,
        ...(after ? { after } : {})
      });
      for (const entitlement of entitlements.values()) {
        await syncEntitlement(entitlement);
      }
      if (entitlements.size < 100) break;
      after = entitlements.lastKey();
      if (!after) break;
    }
  }
}

export function registerMonetizationEvents(client: Client) {
  client.on("entitlementCreate", (entitlement) => {
    void syncEntitlement(entitlement).catch((error) => {
      console.error("Failed to process Discord entitlement creation", error);
    });
  });
  client.on("entitlementUpdate", (_previous, entitlement) => {
    void syncEntitlement(entitlement).catch((error) => {
      console.error("Failed to process Discord entitlement update", error);
    });
  });
  client.on("entitlementDelete", (entitlement) => {
    void syncEntitlement(entitlement).catch((error) => {
      console.error("Failed to process Discord entitlement deletion", error);
    });
  });
}
