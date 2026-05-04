import axios from "axios";
import { prisma } from "../../database/src/index";

type ProductEntry = {
  name?: string;
  quality?: number;
  slot?: number;
  paintable?: boolean;
  tradable?: boolean;
  tradeIn?: boolean;
  special?: number;
  blueprint?: boolean;
  currency?: boolean;
};

const DECK_NAME = "rocket_league_items";
const EXTERNAL_IMAGE_BASE = "https://rocket-league.com";
const RL_ITEMS_RAW_BASE = "https://raw.githubusercontent.com/rocketleagueapi/items/main/src/parsed";
const RL_IMAGE_LISTING_PATHS = [
  "/items/misc",
  "/items/bodies",
  "/items/decals",
  "/items/paints",
  "/items/wheels",
  "/items/boosts",
  "/items/toppers",
  "/items/antennas",
  "/items/explosions",
  "/items/trails",
  "/items/anthems",
  "/items/banners",
  "/items/borders",
  "/items/stickers",
  "/items/avatars"
];

const typeFrMap: Record<string, string> = {
  body: "voiture",
  decal: "decalcomanie",
  wheels: "roues",
  boost: "boost",
  topper: "accessoire",
  antenna: "antenne",
  goal_explosion: "explosion de but",
  trail: "trainee",
  paint_finish: "peinture",
  player_banner: "banniere",
  avatar_border: "bordure avatar",
  engine_audio: "son moteur",
  player_anthem: "hymne",
  sticker: "sticker",
  avatar: "avatar",
  misc: "divers",
  player_title: "titre"
};

const typeRouteMap: Record<string, string> = {
  body: "bodies",
  decal: "decals",
  wheels: "wheels",
  boost: "boosts",
  topper: "toppers",
  antenna: "antennas",
  goal_explosion: "explosions",
  trail: "trails",
  paint_finish: "paints",
  player_banner: "banners",
  avatar_border: "borders",
  engine_audio: "engines",
  player_anthem: "anthems",
  sticker: "stickers",
  avatar: "avatars",
  player_title: "titles",
  misc: "misc"
};

const knownAliases: Record<string, string[]> = {
  octane: ["octane"],
  fennec: ["fennec"],
  dominus: ["dominus"],
  zomba: ["zomba"],
  apex: ["apex"],
  mainframe: ["mainframe"],
  interstellar: ["interstellar"],
  "dueling dragons": ["dueling dragons", "dueling dragon"]
};

const imageCache = new Map<string, string | null>();

type ListingImageIndex = {
  byPath: Map<string, string>;
  byUniqueSlug: Map<string, string>;
};

const xpByRarity: Record<string, number> = {
  Common: 10,
  Uncommon: 20,
  Rare: 40,
  "Very Rare": 70,
  Import: 110,
  Exotic: 160,
  "Black Market": 250,
  Limited: 300
};

const dropRateByRarity: Record<string, number> = {
  Common: 0.5,
  Uncommon: 0.22,
  Rare: 0.12,
  "Very Rare": 0.07,
  Import: 0.04,
  Exotic: 0.03,
  "Black Market": 0.01,
  Limited: 0.01
};

function getXpReward(rarityName: string): number {
  return xpByRarity[rarityName] ?? 10;
}

function getDropRate(rarityName: string): number {
  return dropRateByRarity[rarityName] ?? 0.5;
}

type CatalogData = {
  products: Record<string, ProductEntry>;
  qualities: Record<string, string>;
  slots: Record<string, string>;
  paints: Record<string, string>;
  certs: Record<string, string>;
  specials: Record<string, string>;
  series: Record<string, string>;
};

async function fetchCatalogJson<T>(name: string): Promise<T> {
  const response = await axios.get<T>(`${RL_ITEMS_RAW_BASE}/${name}.json`, { timeout: 15000 });
  return response.data;
}

async function loadCatalogData(): Promise<CatalogData> {
  const [
    productsData,
    qualitiesData,
    slotsData,
    paintsData,
    certsData,
    specialsData,
    seriesData
  ] = await Promise.all([
    fetchCatalogJson<Record<string, ProductEntry>>("products"),
    fetchCatalogJson<Record<string, string>>("qualities"),
    fetchCatalogJson<Record<string, string>>("slots"),
    fetchCatalogJson<Record<string, string>>("paints"),
    fetchCatalogJson<Record<string, string>>("certs"),
    fetchCatalogJson<Record<string, string>>("specials"),
    fetchCatalogJson<Record<string, string>>("series")
  ]);

  return {
    products: productsData,
    qualities: qualitiesData,
    slots: slotsData,
    paints: paintsData,
    certs: certsData,
    specials: specialsData,
    series: seriesData
  };
}

function normalizeInput(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[’'`]/g, " ")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function slugify(value: string): string {
  return normalizeInput(value).replace(/\s+/g, "-");
}

function cleanupItemName(name: string): string {
  return name.replace(/\s+/g, " ").trim();
}

function mapSlotLabelToType(slotLabel: string): string | null {
  const label = normalizeInput(slotLabel);
  if (!label) return null;
  if (label.includes("title")) return "player_title";
  if (label.includes("anthem")) return "player_anthem";
  if (label.includes("body") || label.includes("car")) return "body";
  if (label.includes("decal")) return "decal";
  if (label.includes("wheel")) return "wheels";
  if (label.includes("boost")) return "boost";
  if (label.includes("topper")) return "topper";
  if (label.includes("antenna")) return "antenna";
  if (label.includes("explosion")) return "goal_explosion";
  if (label.includes("trail")) return "trail";
  if (label.includes("paint finish")) return "paint_finish";
  if (label.includes("banner")) return "player_banner";
  if (label.includes("sticker")) return "sticker";
  if (label.includes("avatar")) return "avatar";
  if (label.includes("avatar border") || label.includes("border")) return "avatar_border";
  if (label.includes("engine audio") || label.includes("engine")) return "engine_audio";
  if (label.includes("misc")) return "misc";
  return null;
}

function mapQualityToDbRarity(qualityLabel: string): string {
  const q = normalizeInput(qualityLabel);
  if (q.includes("black market")) return "Black Market";
  if (q.includes("exotic")) return "Exotic";
  if (q.includes("import")) return "Import";
  if (q.includes("very rare")) return "Very Rare";
  if (q.includes("rare")) return "Rare";
  if (q.includes("uncommon")) return "Uncommon";
  if (q.includes("limited") || q.includes("premium") || q.includes("legacy")) return "Limited";
  return "Common";
}

function isLikelyItemImage(url: string, slug: string): boolean {
  const candidate = url.toLowerCase();
  if (!candidate) return false;
  const blockedHints = [
    "logo",
    "premium",
    "googleusercontent",
    "appstore",
    "play.google",
    "favicon"
  ];
  const blockedExactFiles = ["title_big.png", "engine.png"];
  if (blockedHints.some((hint) => candidate.includes(hint))) return false;
  if (blockedExactFiles.some((file) => candidate.endsWith(`/${file}`))) return false;

  if (candidate.includes("/content/media/items/avatar/")) return true;
  if (candidate.includes("/content/media/items/") || candidate.includes("/media/items/")) return true;
  if (candidate.includes(slug)) return true;
  if (candidate.includes("/items/") || candidate.includes("item")) return true;
  return false;
}

function pageMatchesProductId(html: string, productId: number): boolean {
  if (!Number.isFinite(productId) || productId <= 0) return false;
  const markers = [
    `filterItem=${productId}`,
    `item=${productId}`,
    `filteritem=${productId}`
  ];
  const lowered = html.toLowerCase();
  return markers.some((marker) => lowered.includes(marker.toLowerCase()));
}

function parseImageFromHtml(html: string, slug: string): string | null {
  const markdownImage = html.match(/!\[[^\]]*\]\((https?:\/\/[^\s)]+\/content\/media\/items\/[^)]+)\)/i)?.[1];
  if (markdownImage && isLikelyItemImage(markdownImage, slug)) return markdownImage;

  const mediaImage = html.match(/https?:\/\/[^\s"']+\/content\/media\/items\/[^\s"']+/i)?.[0];
  if (mediaImage && isLikelyItemImage(mediaImage, slug)) return mediaImage;

  const og = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i)?.[1];
  if (og && isLikelyItemImage(og, slug)) return og;
  const tw = html.match(/<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["']/i)?.[1];
  if (tw && isLikelyItemImage(tw, slug)) return tw;
  const firstImg = html.match(/<img[^>]+src=["']([^"']+)["'][^>]*>/i)?.[1];
  if (firstImg && isLikelyItemImage(firstImg, slug)) return firstImg;
  return null;
}

function absolutizeUrl(url: string): string {
  if (url.startsWith("http://") || url.startsWith("https://")) return url;
  if (url.startsWith("//")) return `https:${url}`;
  if (url.startsWith("/")) return `${EXTERNAL_IMAGE_BASE}${url}`;
  return `${EXTERNAL_IMAGE_BASE}/${url}`;
}

function normalizeItemPath(path: string): string {
  return path.trim().toLowerCase().replace(/\/+$/, "");
}

function extractSlugFromPath(path: string): string {
  const clean = normalizeItemPath(path);
  const parts = clean.split("/").filter(Boolean);
  return parts[parts.length - 1] ?? "";
}

async function buildListingImageIndex(): Promise<ListingImageIndex> {
  const byPath = new Map<string, string>();
  const slugCandidateMap = new Map<string, Set<string>>();

  for (const listingPath of RL_IMAGE_LISTING_PATHS) {
    try {
      const html = (
        await axios.get<string>(`${EXTERNAL_IMAGE_BASE}${listingPath}`, {
          timeout: 15000,
          validateStatus: (status) => status >= 200 && status < 500
        })
      ).data;

      if (typeof html !== "string") continue;

      const imageThenHrefRegex = /(?:data-src|src)=\"((?:https?:\/\/rocket-league\.com)?\/content\/media\/items\/avatar\/220px\/[^\"']+)\"[\s\S]{0,900}?href=\"(\/items\/[a-z-]+\/[a-z0-9-]+(?:\/[a-z0-9-]+)?)\"/gi;
      const hrefThenImageRegex = /href=\"(\/items\/[a-z-]+\/[a-z0-9-]+(?:\/[a-z0-9-]+)?)\"[\s\S]{0,900}?(?:data-src|src)=\"((?:https?:\/\/rocket-league\.com)?\/content\/media\/items\/avatar\/220px\/[^\"']+)\"/gi;

      const register = (href: string, imageUrl: string) => {
        const normalizedPath = normalizeItemPath(href);
        const absoluteImage = absolutizeUrl(imageUrl);
        byPath.set(normalizedPath, absoluteImage);

        const slug = extractSlugFromPath(normalizedPath);
        if (!slug) return;
        if (!slugCandidateMap.has(slug)) {
          slugCandidateMap.set(slug, new Set([absoluteImage]));
          return;
        }
        slugCandidateMap.get(slug)!.add(absoluteImage);
      };

      for (const match of html.matchAll(imageThenHrefRegex)) {
        register(match[2], match[1]);
      }
      for (const match of html.matchAll(hrefThenImageRegex)) {
        register(match[1], match[2]);
      }
    } catch {
      continue;
    }
  }

  const byUniqueSlug = new Map<string, string>();
  for (const [slug, images] of slugCandidateMap.entries()) {
    if (images.size === 1) {
      byUniqueSlug.set(slug, Array.from(images)[0]);
    }
  }

  return { byPath, byUniqueSlug };
}

async function findExternalImage(
  itemName: string,
  itemType: string,
  productId: number,
  listingImageIndex: ListingImageIndex
): Promise<string | null> {
  const cacheKey = `${itemType}:${normalizeInput(itemName)}`;
  const cached = imageCache.get(cacheKey);
  if (cached !== undefined) return cached;

  const slug = slugify(itemName);
  if (!slug) {
    imageCache.set(cacheKey, null);
    return null;
  }

  const route = typeRouteMap[itemType] ?? "items";
  const listingPathCandidates = [
    `/items/${route}/${slug}`,
    `/items/${route}/global/${slug}`,
    `/items/${route}/blackmarket/${slug}`,
    `/items/misc/${slug}`
  ].map((path) => normalizeItemPath(path));

  for (const candidatePath of listingPathCandidates) {
    const indexedImage = listingImageIndex.byPath.get(candidatePath);
    if (indexedImage) {
      imageCache.set(cacheKey, indexedImage);
      return indexedImage;
    }
  }

  const uniqueSlugImage = listingImageIndex.byUniqueSlug.get(slug);
  if (uniqueSlugImage) {
    imageCache.set(cacheKey, uniqueSlugImage);
    return uniqueSlugImage;
  }

  const candidatePaths = [
    `/items/${route}/${slug}`,
    `/items/${slug}`,
    `/items/${route}/global/${slug}`,
    `/items/${route}/blackmarket/${slug}`
  ];

  for (const path of candidatePaths) {
    try {
      const response = await axios.get(`${EXTERNAL_IMAGE_BASE}${path}`, {
        timeout: 8000,
        validateStatus: (status) => status >= 200 && status < 500
      });

      if (response.status !== 200 || typeof response.data !== "string") {
        continue;
      }

      if (!pageMatchesProductId(response.data, productId)) {
        continue;
      }

      const image = parseImageFromHtml(response.data, slug);
      if (image) {
        const absolute = absolutizeUrl(image);
        imageCache.set(cacheKey, absolute);
        return absolute;
      }
    } catch {
      continue;
    }
  }

  imageCache.set(cacheKey, null);
  return null;
}

function buildAcceptedNames(itemName: string, itemType: string): string[] {
  const cleaned = cleanupItemName(itemName);
  const normalized = normalizeInput(cleaned);
  const typeFr = typeFrMap[itemType] ?? itemType;

  const set = new Set<string>();
  if (normalized) {
    set.add(normalized);
    set.add(normalized.replace(/\s+/g, ""));
  }

  if (normalized) {
    set.add(`${typeFr} ${normalized}`.trim());
    set.add(`${itemType} ${normalized}`.trim());
  }

  if (itemType === "body" && normalized) {
    set.add(`car ${normalized}`);
    set.add(`voiture ${normalized}`);
    set.add(`body ${normalized}`);
  }

  const shortAliases = knownAliases[normalized] ?? [];
  for (const alias of shortAliases) {
    set.add(normalizeInput(alias));
  }

  return Array.from(set).filter((value) => value.length >= 2);
}

function resolveSafeName(baseName: string, productId: number, usedNames: Set<string>): string {
  if (!usedNames.has(baseName)) {
    usedNames.add(baseName);
    return baseName;
  }

  const withId = `${baseName} [RL#${productId}]`;
  if (!usedNames.has(withId)) {
    usedNames.add(withId);
    return withId;
  }

  let i = 2;
  while (usedNames.has(`${withId}-${i}`)) {
    i += 1;
  }
  const finalName = `${withId}-${i}`;
  usedNames.add(finalName);
  return finalName;
}

export async function importRocketLeagueItems(options?: { limit?: number }): Promise<{
  created: number;
  updated: number;
  blacklisted: number;
  skipped: number;
}> {
  console.log("Importing Rocket League items from @rocketleagueapi/items...");

  const [catalog, listingImageIndex] = await Promise.all([loadCatalogData(), buildListingImageIndex()]);

  const deck = await prisma.deck.upsert({
    where: { name: DECK_NAME },
    update: {},
    create: { name: DECK_NAME }
  });

  const rarities = await prisma.rarity.findMany({ select: { id: true, name: true } });
  const rarityByName = new Map(rarities.map((r) => [r.name, r.id]));

  const existingCards = await prisma.card.findMany({
    select: { id: true, name: true, source: true, sourceId: true }
  });
  const usedNames = new Set(existingCards.map((card) => card.name));
  const existingBySourceId = new Map(
    existingCards
      .filter((card) => card.source === "rocketleagueapi" && typeof card.sourceId === "string")
      .map((card) => [card.sourceId as string, card])
  );

  const productEntries = Object.entries(catalog.products);
  const limit = options?.limit ? Math.max(1, Math.floor(options.limit)) : productEntries.length;

  let created = 0;
  let updated = 0;
  let blacklisted = 0;
  let skipped = 0;

  for (const [productIdRaw, product] of productEntries.slice(0, limit)) {
    const productId = Number(productIdRaw);
    const rawName = cleanupItemName(product.name ?? "");
    if (!rawName || !Number.isFinite(productId)) {
      skipped += 1;
      continue;
    }

    const slotLabel = String(catalog.slots[String(product.slot ?? "")] ?? "");
    const itemType = mapSlotLabelToType(slotLabel);
    if (!itemType) {
      skipped += 1;
      continue;
    }
    if (itemType === "engine_audio" || itemType === "player_title") {
      skipped += 1;
      continue;
    }
    const itemTypeFr = typeFrMap[itemType] ?? itemType;

    const qualityLabel = String(catalog.qualities[String(product.quality ?? "")] ?? "Common");
    const rarityName = mapQualityToDbRarity(qualityLabel);
    const rarityId = rarityByName.get(rarityName);
    if (!rarityId) {
      skipped += 1;
      continue;
    }

    const imageUrl = await findExternalImage(rawName, itemType, productId, listingImageIndex);
    const spawnEnabled = Boolean(imageUrl);
    const category = spawnEnabled ? itemType : "blacklisted";
    const blacklistReason = spawnEnabled ? null : "missing_image";

    const acceptedNames = buildAcceptedNames(rawName, itemType);
    const sourceId = `product-${productId}`;
    const existing = existingBySourceId.get(sourceId);

    const specialLabel = catalog.specials[String(product.special ?? "")] ?? null;

    const descriptionParts = [
      `Item type: ${itemType}`,
      `Quality: ${qualityLabel}`,
      specialLabel ? `Special edition: ${specialLabel}` : null,
      `Paintable: ${product.paintable ? "yes" : "no"}`,
      `Tradable: ${product.tradable ? "yes" : "no"}`
    ].filter(Boolean);

    const payload = {
      deckId: deck.id,
      rarityId,
      imageUrl,
      description: descriptionParts.join(" | "),
      acceptedNames,
      spawnEnabled,
      blacklistReason,
      category,
      rarityFactors: {
        sourceData: {
          naming: {
            display_name: rawName,
            name_en: rawName,
            name_fr: rawName,
            name_fr_official: null,
            accepted_names: acceptedNames,
            item_type: itemType,
            item_type_fr: itemTypeFr
          },
          productId,
          qualityId: product.quality ?? null,
          qualityLabel,
          slotId: product.slot ?? null,
          slotLabel,
          specialId: product.special ?? null,
          specialLabel,
          paintable: Boolean(product.paintable),
          tradable: Boolean(product.tradable),
          tradeIn: Boolean(product.tradeIn),
          blueprint: Boolean(product.blueprint),
          sourceCatalogs: {
            paintsCount: Object.keys(catalog.paints).length,
            certificationsCount: Object.keys(catalog.certs).length,
            specialEditionsCount: Object.keys(catalog.specials).length,
            seriesCount: Object.keys(catalog.series).length
          }
        }
      },
      xpReward: getXpReward(rarityName),
      dropRate: getDropRate(rarityName),
      source: "rocketleagueapi",
      sourceId
    };

    if (existing) {
      await prisma.card.update({
        where: { id: existing.id },
        data: payload
      });
      updated += 1;
    } else {
      const safeName = resolveSafeName(rawName, productId, usedNames);
      await prisma.card.create({
        data: {
          ...payload,
          name: safeName
        }
      });
      created += 1;
    }

    if (!spawnEnabled) {
      blacklisted += 1;
    }
  }

  console.log(
    `Rocket League items import done. created=${created}, updated=${updated}, blacklisted=${blacklisted}, skipped=${skipped}`
  );

  return { created, updated, blacklisted, skipped };
}