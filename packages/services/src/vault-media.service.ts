import fs from "node:fs/promises";
import path from "node:path";
import {
  DeleteObjectsCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client
} from "@aws-sdk/client-s3";
import { Prisma, prisma } from "@rta/database";
import { AppError } from "./errors.js";

type CsvRecord = Record<string, string>;

function parseCsv(input: string): CsvRecord[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;

  for (let index = 0; index < input.length; index += 1) {
    const character = input[index];
    if (quoted) {
      if (character === '"') {
        if (input[index + 1] === '"') {
          field += '"';
          index += 1;
        } else {
          quoted = false;
        }
      } else {
        field += character;
      }
    } else if (character === '"') {
      quoted = true;
    } else if (character === ",") {
      row.push(field);
      field = "";
    } else if (character === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (character !== "\r") {
      field += character;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  const [rawHeaders, ...dataRows] = rows;
  if (!rawHeaders) {
    throw new AppError("Catalogue média vide.", 500);
  }
  const headers = rawHeaders.map((header, index) =>
    index === 0 ? header.replace(/^\uFEFF/, "") : header
  );
  return dataRows
    .filter((values) => values.some((value) => value.trim()))
    .map((values) =>
      Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""]))
    );
}

function metadataObject(value: Prisma.JsonValue | null): Record<string, Prisma.JsonValue> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, Prisma.JsonValue>
    : {};
}

async function runPool<T>(entries: T[], concurrency: number, task: (entry: T) => Promise<void>) {
  let cursor = 0;
  const workers = Array.from({ length: Math.min(concurrency, entries.length) }, async () => {
    while (cursor < entries.length) {
      const entry = entries[cursor];
      cursor += 1;
      if (entry !== undefined) {
        await task(entry);
      }
    }
  });
  await Promise.all(workers);
}

export async function syncVaultMedia() {
  const vaultRoot = path.resolve(
    process.env.RTA_VAULT_ROOT || path.join(process.cwd(), "..", "Vault-RTA")
  );
  const endpoint = process.env.S3_ENDPOINT;
  const accessKeyId = process.env.S3_ACCESS_KEY;
  const secretAccessKey = process.env.S3_SECRET_KEY;
  const bucket = process.env.S3_BUCKET;
  const publicBaseUrl = process.env.S3_PUBLIC_URL?.replace(/\/+$/, "");
  if (!endpoint || !accessKeyId || !secretAccessKey || !bucket || !publicBaseUrl) {
    throw new AppError("Configuration MinIO/S3 incomplète.", 500);
  }

  const cardsCsvPath = path.join(vaultRoot, "_data", "cards.csv");
  const itemsCsvPath = path.join(vaultRoot, "_data", "notion_bdd", "BDD - Items.csv");
  const bossesCsvPath = path.join(vaultRoot, "_data", "notion_bdd", "BDD - Bosses.csv");
  const [cardRows, itemRows, bossRows] = await Promise.all([
    fs.readFile(cardsCsvPath, "utf8").then(parseCsv),
    fs.readFile(itemsCsvPath, "utf8").then(parseCsv),
    fs.readFile(bossesCsvPath, "utf8").then(parseCsv)
  ]);
  if (cardRows.length !== 810 || itemRows.length !== 42 || bossRows.length !== 17) {
    throw new AppError(
      `Catalogue média incomplet : ${cardRows.length} cartes, ${itemRows.length} objets et ${bossRows.length} boss.`,
      500
    );
  }

  const s3 = new S3Client({
    endpoint,
    forcePathStyle: true,
    region: "us-east-1",
    credentials: { accessKeyId, secretAccessKey }
  });

  const canonicalKeys = new Set([
    ...cardRows.flatMap((card) => {
      const contentKey = card.ID.trim();
      return [
        `vault/cards/${contentKey}.png`,
        `vault/cards/${contentKey}_shiny.png`,
        `vault/cards/${contentKey}_holo.png`
      ];
    }),
    ...itemRows.map((item) => `vault/items/${item["Clé"].trim()}.png`),
    ...bossRows.map((boss) => `vault/bosses/${boss["Clé"].trim()}.png`)
  ]);
  const storedKeys: string[] = [];
  let continuationToken: string | undefined;
  do {
    const listed = await s3.send(new ListObjectsV2Command({
      Bucket: bucket,
      ContinuationToken: continuationToken
    }));
    storedKeys.push(
      ...(listed.Contents ?? []).flatMap((entry) => entry.Key ? [entry.Key] : [])
    );
    continuationToken = listed.IsTruncated ? listed.NextContinuationToken : undefined;
  } while (continuationToken);

  const obsoleteKeys = storedKeys.filter((key) => !canonicalKeys.has(key));
  for (let offset = 0; offset < obsoleteKeys.length; offset += 1_000) {
    const keys = obsoleteKeys.slice(offset, offset + 1_000);
    await s3.send(new DeleteObjectsCommand({
      Bucket: bucket,
      Delete: { Objects: keys.map((Key) => ({ Key })), Quiet: true }
    }));
  }
  await prisma.imageAsset.deleteMany({
    where: { key: { notIn: [...canonicalKeys] } }
  });

  const upload = async (filePath: string, key: string) => {
    const body = await fs.readFile(filePath);
    await s3.send(new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: body,
      ContentType: "image/png",
      CacheControl: "public, max-age=31536000, immutable"
    }));
    const url = `${publicBaseUrl}/${key}`;
    await prisma.imageAsset.upsert({
      where: { key },
      update: { url },
      create: { key, url }
    });
    return url;
  };

  let uploadedCards = 0;
  await runPool(cardRows, 8, async (card) => {
    const contentKey = card.ID.trim();
    const deckDirectory = card.Deck === "Apex Predators" ? "Apex Legends" : card.Deck;
    const definition = await prisma.card.findUnique({ where: { contentKey } });
    if (!definition) {
      throw new AppError(`Définition de carte absente : ${contentKey}`, 500);
    }
    const variants = {
      normal: "",
      shiny: "_shiny",
      holo: "_holo"
    } as const;
    const uploaded = await Promise.all(
      Object.entries(variants).map(async ([variant, suffix]) => {
        const filePath = path.join(
          vaultRoot,
          "20-Cards",
          deckDirectory,
          `${card.Nom}${suffix}.png`
        );
        const key = `vault/cards/${contentKey}${suffix}.png`;
        const url = await upload(filePath, key);
        return [variant, { key, url }] as const;
      })
    );
    const variantAssets = Object.fromEntries(uploaded);
    await prisma.card.update({
      where: { contentKey },
      data: {
        imageUrl: variantAssets.normal!.url,
        metadata: {
          ...metadataObject(definition.metadata),
          variantImages: {
            normal: variantAssets.normal!.url,
            shiny: variantAssets.shiny!.url,
            holo: variantAssets.holo!.url
          },
          variantImageKeys: {
            normal: variantAssets.normal!.key,
            shiny: variantAssets.shiny!.key,
            holo: variantAssets.holo!.key
          }
        }
      }
    });
    uploadedCards += 1;
    if (uploadedCards % 100 === 0 || uploadedCards === cardRows.length) {
      console.log(
        `[vault-media] ${uploadedCards}/${cardRows.length} jeux de variantes synchronisés`
      );
    }
  });

  let uploadedItems = 0;
  await runPool(itemRows, 6, async (item) => {
    const contentKey = item["Clé"].trim();
    const itemDefinition = await prisma.itemDefinition.findUnique({ where: { contentKey } });
    if (!itemDefinition) {
      throw new AppError(`Définition d'objet absente : ${contentKey}`, 500);
    }
    const filePath = path.resolve(vaultRoot, item.Image.replaceAll("/", path.sep));
    const key = `vault/items/${contentKey}.png`;
    const url = await upload(filePath, key);
    await prisma.itemDefinition.update({
      where: { contentKey },
      data: {
        metadata: {
          ...metadataObject(itemDefinition.metadata),
          imageUrl: url,
          imageKey: key
        }
      }
    });
    uploadedItems += 1;
    if (uploadedItems % 10 === 0 || uploadedItems === itemRows.length) {
      console.log(`[vault-media] ${uploadedItems}/${itemRows.length} images d'objets synchronisées`);
    }
  });

  let uploadedBosses = 0;
  await runPool(bossRows, 6, async (boss) => {
    const contentKey = boss["Clé"].trim();
    const definition = await prisma.bossDefinition.findUnique({ where: { contentKey } });
    if (!definition) {
      throw new AppError(`Définition de boss absente : ${contentKey}`, 500);
    }
    const filePath = path.resolve(vaultRoot, boss.Image.replaceAll("/", path.sep));
    const key = `vault/bosses/${contentKey}.png`;
    const url = await upload(filePath, key);
    await prisma.bossDefinition.update({
      where: { contentKey },
      data: {
        metadata: {
          ...metadataObject(definition.metadata),
          imageUrl: url,
          imageKey: key
        }
      }
    });
    uploadedBosses += 1;
    if (uploadedBosses % 5 === 0 || uploadedBosses === bossRows.length) {
      console.log(`[vault-media] ${uploadedBosses}/${bossRows.length} images de boss synchronisées`);
    }
  });

  return {
    cards: cardRows.length,
    items: itemRows.length,
    bosses: bossRows.length,
    assets: cardRows.length * 3 + itemRows.length + bossRows.length,
    removedObsoleteAssets: obsoleteKeys.length
  };
}
