export function cardVariantImageUrl(
  normalImageUrl: string | null,
  variant: "normal" | "shiny" | "holo"
) {
  if (!normalImageUrl || variant === "normal") return normalImageUrl;
  return normalImageUrl.replace(/\.png(?=$|\?)/i, `_${variant}.png`);
}
