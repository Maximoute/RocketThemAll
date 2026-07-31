import { prisma } from "@rta/database";
import { notFound } from "next/navigation";
import VariantCarousel from "./VariantCarousel.client";

type ResourceLink = {
  label: string;
  url: string;
  type?: string;
  why?: string;
};

type VaultCardMetadata = {
  shortDescription?: string | null;
  longDescription?: string | null;
  lore?: string | null;
  sourceUrl?: string | null;
  worldName?: string | null;
  primaryZoneName?: string | null;
  compatibleZoneNames?: string[];
  sources?: ResourceLink[];
  exploreFurther?: ResourceLink[];
  videos?: ResourceLink[];
};

const RARITY_COLORS: Record<string, string> = {
  Common: "#9e9e9e",
  Uncommon: "#4caf50",
  Rare: "#2196f3",
  "Very Rare": "#9c27b0",
  Import: "#ff9800",
  Exotic: "#f44336",
  "Black Market": "#ffd700"
};

function isExternalUrl(value: unknown): value is string {
  if (typeof value !== "string") return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

function resourceLinks(value: unknown): ResourceLink[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return [];
    const candidate = entry as Record<string, unknown>;
    if (!isExternalUrl(candidate.url)) return [];
    return [{
      label: typeof candidate.label === "string" && candidate.label.trim()
        ? candidate.label
        : candidate.url,
      url: candidate.url,
      type: typeof candidate.type === "string" ? candidate.type : undefined,
      why: typeof candidate.why === "string" ? candidate.why : undefined
    }];
  });
}

function ResourceList({ title, resources }: { title: string; resources: ResourceLink[] }) {
  if (resources.length === 0) return null;

  return (
    <section className="bg-rta-surface border border-rta-border rounded-xl p-5">
      <h2 className="font-black text-lg mb-3">{title}</h2>
      <ul className="grid gap-3">
        {resources.map((resource, index) => (
          <li key={`${resource.url}-${index}`} className="bg-rta-surface2 rounded-lg p-3">
            <a
              href={resource.url}
              target="_blank"
              rel="noopener noreferrer"
              className="font-bold text-rta-cta hover:underline"
            >
              {resource.label} ↗
            </a>
            {resource.why && <p className="text-sm text-rta-muted mt-1">{resource.why}</p>}
          </li>
        ))}
      </ul>
    </section>
  );
}

export default async function CardInfoPage({
  params: paramsPromise
}: {
  params: Promise<{ id: string }>;
}) {
  const params = await paramsPromise;
  const card = await prisma.card.findUnique({
    where: { id: params.id },
    include: { deck: true, rarity: true }
  });

  if (!card) notFound();

  const metadata = (
    card.metadata && typeof card.metadata === "object" && !Array.isArray(card.metadata)
      ? card.metadata
      : {}
  ) as VaultCardMetadata;
  const sources = resourceLinks(metadata.sources);
  const exploreFurther = resourceLinks(metadata.exploreFurther);
  const videos = resourceLinks(metadata.videos);
  const directSourceUrl = isExternalUrl(metadata.sourceUrl) ? metadata.sourceUrl : null;
  const description = metadata.longDescription || card.description || metadata.shortDescription;
  const rarityColor = RARITY_COLORS[card.rarity.name] ?? "#9e9e9e";

  return (
    <div className="max-w-5xl mx-auto">
      <a href="/collection" className="inline-block text-sm text-rta-cta hover:underline mb-5">
        ← Retour à la collection
      </a>

      <section className="bg-rta-surface border border-rta-border rounded-2xl overflow-hidden">
        <div className="grid md:grid-cols-[320px_1fr]">
          <VariantCarousel cardName={card.name} normalImageUrl={card.imageUrl} />

          <div className="p-6 md:p-8">
            <div className="flex flex-wrap gap-2 mb-4">
              <span
                className="font-bold px-2.5 py-1 rounded-md text-sm"
                style={{
                  color: rarityColor,
                  backgroundColor: `${rarityColor}18`,
                  border: `1px solid ${rarityColor}55`
                }}
              >
                {card.rarity.name}
              </span>
              {card.category && (
                <span className="bg-rta-surface2 border border-rta-border px-2.5 py-1 rounded-md text-sm">
                  {card.category}
                </span>
              )}
            </div>

            <h1 className="text-3xl font-black tracking-tight">{card.name}</h1>
            {metadata.shortDescription && metadata.shortDescription !== description && (
              <p className="text-rta-muted mt-2">{metadata.shortDescription}</p>
            )}

            <dl className="grid sm:grid-cols-2 gap-4 mt-6 text-sm">
              <div>
                <dt className="text-rta-muted">Deck</dt>
                <dd className="font-bold">{card.deck.name}</dd>
              </div>
              {metadata.worldName && (
                <div>
                  <dt className="text-rta-muted">Monde</dt>
                  <dd className="font-bold">{metadata.worldName}</dd>
                </div>
              )}
              {metadata.primaryZoneName && (
                <div>
                  <dt className="text-rta-muted">Zone principale</dt>
                  <dd className="font-bold">{metadata.primaryZoneName}</dd>
                </div>
              )}
              <div>
                <dt className="text-rta-muted">Récompense</dt>
                <dd className="font-bold">+{card.xpReward} XP</dd>
              </div>
            </dl>

            {directSourceUrl && (
              <a
                href={directSourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex mt-6 text-sm font-bold text-rta-cta hover:underline"
              >
                Consulter la source principale ↗
              </a>
            )}
          </div>
        </div>
      </section>

      <div className="grid gap-5 mt-5">
        {description && (
          <section className="bg-rta-surface border border-rta-border rounded-xl p-5">
            <h2 className="font-black text-lg mb-2">Description</h2>
            <p className="text-rta-muted leading-7 whitespace-pre-line">{description}</p>
          </section>
        )}

        {metadata.lore && (
          <section className="bg-rta-surface border border-rta-border rounded-xl p-5">
            <h2 className="font-black text-lg mb-2">À savoir</h2>
            <p className="text-rta-muted leading-7 whitespace-pre-line">{metadata.lore}</p>
          </section>
        )}

        <ResourceList title="Vidéos" resources={videos} />
        <ResourceList title="Sources" resources={sources} />
        <ResourceList title="Pour aller plus loin" resources={exploreFurther} />
      </div>
    </div>
  );
}
