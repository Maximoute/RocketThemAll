import { createHash } from "node:crypto";
import { prisma } from "@rta/database";

const endpoint = process.env.S3_ENDPOINT?.replace(/\/+$/, "");
const bucket = process.env.S3_BUCKET;
if (!endpoint || !bucket) {
  throw new Error("S3_ENDPOINT and S3_BUCKET are required.");
}

const [normalAssets, shinyAssets, holoAssets, cards] = await Promise.all([
  prisma.imageAsset.count({
    where: {
      key: { startsWith: "vault/cards/", endsWith: ".png" },
      NOT: [{ key: { endsWith: "_shiny.png" } }, { key: { endsWith: "_holo.png" } }]
    }
  }),
  prisma.imageAsset.count({ where: { key: { endsWith: "_shiny.png" } } }),
  prisma.imageAsset.count({ where: { key: { endsWith: "_holo.png" } } }),
  prisma.card.findMany({
    where: { source: "vault", status: "PUBLISHED", isActive: true },
    select: { contentKey: true, metadata: true }
  })
]);

const cardsWithAllVariants = cards.filter((card) => {
  const metadata = card.metadata;
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return false;
  const variants = metadata.variantImages;
  return Boolean(
    variants &&
    typeof variants === "object" &&
    !Array.isArray(variants) &&
    typeof variants.normal === "string" &&
    typeof variants.shiny === "string" &&
    typeof variants.holo === "string"
  );
}).length;

if (
  normalAssets !== 810 ||
  shinyAssets !== 810 ||
  holoAssets !== 810 ||
  cardsWithAllVariants !== 810
) {
  throw new Error(
    `Catalogue de variantes incomplet: normal=${normalAssets}, shiny=${shinyAssets}, ` +
    `holo=${holoAssets}, metadata=${cardsWithAllVariants}.`
  );
}

const sampleKey = cards.find((card) => card.contentKey)?.contentKey;
if (!sampleKey) throw new Error("Aucune carte Vault disponible.");
const hashes = {};
for (const [variant, suffix] of Object.entries({
  normal: "",
  shiny: "_shiny",
  holo: "_holo"
})) {
  const response = await fetch(
    `${endpoint}/${bucket}/vault/cards/${encodeURIComponent(sampleKey)}${suffix}.png`
  );
  if (!response.ok) {
    throw new Error(`Média ${variant} inaccessible pour ${sampleKey}: HTTP ${response.status}.`);
  }
  hashes[variant] = createHash("sha256")
    .update(Buffer.from(await response.arrayBuffer()))
    .digest("hex");
}
if (new Set(Object.values(hashes)).size !== 3) {
  throw new Error(`Les trois variantes de ${sampleKey} ne sont pas visuellement distinctes.`);
}

console.log(JSON.stringify({
  cards: cards.length,
  assets: { normal: normalAssets, shiny: shinyAssets, holo: holoAssets },
  cardsWithAllVariants,
  sampleKey,
  sampleHashesDistinct: true
}, null, 2));

await prisma.$disconnect();
