import { AttachmentBuilder, EmbedBuilder } from "discord.js";

export type CardImageVariant = "normal" | "shiny" | "holo";

export function cardVariantImageUrl(
  normalImageUrl: string | null,
  variant: CardImageVariant
) {
  if (!normalImageUrl || variant === "normal") return normalImageUrl;
  return normalImageUrl.replace(/\.png(?=$|\?)/i, `_${variant}.png`);
}

export async function attachCardImage(
  embed: EmbedBuilder,
  card: { contentKey: string | null; imageUrl: string | null; name: string },
  variant: CardImageVariant | null = "normal"
) {
  const selectedVariant = variant ?? "normal";
  const suffix = selectedVariant === "normal" ? "" : `_${selectedVariant}`;
  const endpoint = process.env.S3_ENDPOINT?.replace(/\/+$/, "");
  const bucket = process.env.S3_BUCKET;

  if (endpoint && bucket && card.contentKey) {
    try {
      const response = await fetch(
        `${endpoint}/${bucket}/vault/cards/${encodeURIComponent(card.contentKey)}${suffix}.png`
      );
      if (response.ok) {
        const buffer = Buffer.from(await response.arrayBuffer());
        const safeContentKey = card.contentKey.replace(/[^a-zA-Z0-9._-]/g, "_");
        const filename = `${safeContentKey}${suffix}.png`;
        embed.setImage(`attachment://${filename}`);
        return [new AttachmentBuilder(buffer, { name: filename })];
      }
    } catch (error) {
      console.warn(
        `Unable to attach ${selectedVariant} MinIO image for ${card.contentKey}`,
        error
      );
    }
  }

  const fallbackUrl = cardVariantImageUrl(card.imageUrl, selectedVariant);
  if (fallbackUrl && /^https?:\/\//i.test(fallbackUrl)) {
    embed.setImage(fallbackUrl);
  }
  return [];
}
