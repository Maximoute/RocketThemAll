import { prisma } from "@rta/database";
import { RARITIES } from "@rta/shared";
import CollectionFiltersClient from "./filters.client";
import { getServerSession } from "next-auth";
import { authOptions } from "../../lib/auth";

const POP_CATEGORIES: { value: string; label: string }[] = [
  { value: "movie", label: "🎬 Films" },
  { value: "tv", label: "📺 Séries" },
  { value: "anime", label: "🎌 Anime" },
  { value: "manga", label: "📖 Manga" },
  { value: "video_game", label: "🎮 Jeux vidéo" },
  { value: "meme", label: "😂 Mèmes" },
  { value: "music", label: "🎵 Musique" },
  { value: "internet", label: "🌐 Internet" },
  { value: "comics", label: "🦸 Comics" },
  { value: "sport", label: "⚽ Sport" },
  { value: "manual", label: "📋 Manuel" },
  { value: "body", label: "🚗 Body" },
  { value: "decal", label: "🎨 Decal" },
  { value: "wheels", label: "🛞 Wheels" },
  { value: "rocket_boost", label: "💨 Rocket Boost" },
  { value: "goal_explosion", label: "💥 Goal Explosion" },
  { value: "trail", label: "🛤️ Trail" },
  { value: "topper", label: "🎩 Topper" },
  { value: "antenna", label: "📡 Antenna" },
  { value: "player_banner", label: "🏳️ Banner" },
  { value: "player_title", label: "🏷️ Title" },
  { value: "unknown", label: "❓ Unknown" },
];

type SearchParams = {
  deck?: string;
  rarity?: string;
  category?: string;
  q?: string;
  sort?: string;
  order?: "asc" | "desc";
  page?: string;
};

export default async function CollectionPage({ searchParams }: { searchParams: SearchParams }) {
  const session = await getServerSession(authOptions);
  const sort = searchParams.sort ?? "name";
  const order = searchParams.order ?? "asc";
  const pageRaw = Number(searchParams.page ?? "1");
  const page = Number.isFinite(pageRaw) ? Math.max(1, Math.floor(pageRaw)) : 1;
  const pageSize = 100;

  const where = {
    name: searchParams.q ? { contains: searchParams.q, mode: "insensitive" as const } : undefined,
    deck: searchParams.deck ? { name: searchParams.deck } : undefined,
    rarity: searchParams.rarity ? { name: searchParams.rarity } : undefined,
    category: searchParams.category ? searchParams.category : undefined
  };

  const orderBy =
    sort === "rarity"
      ? [{ rarity: { weight: order } }, { name: "asc" as const }]
      : sort === "deck"
      ? [{ deck: { name: order } }, { name: "asc" as const }]
      : sort === "category"
      ? [{ category: order }, { name: "asc" as const }]
      : [{ name: order }];

  const [totalCards, deckRows] = await Promise.all([
    prisma.card.count({ where }),
    prisma.deck.findMany({ orderBy: { name: "asc" } })
  ]);

  const totalPages = Math.max(1, Math.ceil(totalCards / pageSize));
  const safePage = Math.min(page, totalPages);

  const cards = await prisma.card.findMany({
    where,
    include: { deck: true, rarity: true },
    orderBy,
    skip: (safePage - 1) * pageSize,
    take: pageSize
  });

  const allDecks = deckRows.map((deck) => deck.name);
  const user = session?.user?.name
    ? await prisma.user.findFirst({ where: { username: session.user.name } })
    : null;
  const inventory = user
    ? await prisma.inventoryItem.findMany({ where: { userId: user.id, quantity: { gt: 0 } } })
    : [];
  const rewardClaims = user
    ? await prisma.collectionRewardClaim.findMany({ where: { userId: user.id } })
    : [];
  const ownedIds = new Set(inventory.map((item) => item.cardId));
  const filteredDeckCards = await prisma.card.findMany({
    where,
    select: { id: true, deckId: true, deck: { select: { name: true } } }
  });

  const deckProgress = allDecks.map((deckName) => {
    const deckCards = filteredDeckCards.filter((card) => card.deck.name === deckName);
    const total = deckCards.length;
    const owned = deckCards.filter((card) => ownedIds.has(card.id)).length;
    return {
      deckName,
      total,
      owned,
      completion: total === 0 ? 0 : Math.round((owned / total) * 100),
      claimed50: rewardClaims.some((claim) => claim.deckId === deckCards[0]?.deckId && claim.milestone === 50),
      claimed100: rewardClaims.some((claim) => claim.deckId === deckCards[0]?.deckId && claim.milestone === 100)
    };
  }).filter((deck) => deck.total > 0);

  function buildPageHref(targetPage: number): string {
    const params = new URLSearchParams();
    if (searchParams.q) params.set("q", searchParams.q);
    if (searchParams.deck) params.set("deck", searchParams.deck);
    if (searchParams.rarity) params.set("rarity", searchParams.rarity);
    if (searchParams.category) params.set("category", searchParams.category);
    if (sort) params.set("sort", sort);
    if (order) params.set("order", order);
    params.set("page", String(targetPage));
    return `/collection?${params.toString()}`;
  }


  const categoryLabel = (cat: string | null) =>
    POP_CATEGORIES.find((c) => c.value === cat)?.label ?? (cat ?? "");

  const rarityGlow: Record<string, string> = {
    "Common":       "border-rta-border",
    "Uncommon":     "glow-uncommon",
    "Rare":         "glow-rare",
    "Very Rare":    "glow-very-rare",
    "Import":       "glow-import",
    "Exotic":       "glow-exotic",
    "Black Market": "glow-black-market",
    "Limited":      "glow-limited",
  };
  const rarityBadgeClass: Record<string, string> = {
    "Common":       "bg-rta-surface2 text-rta-muted",
    "Uncommon":     "bg-rta-success/15 text-rta-success border border-rta-success",
    "Rare":         "bg-rta-accentHi/20 text-purple-300 border border-rta-accentHi",
    "Very Rare":    "bg-purple-500/15 text-purple-300 border border-purple-500",
    "Import":       "bg-rta-cta/15 text-rta-cta border border-rta-cta",
    "Exotic":       "bg-red-500/15 text-red-400 border border-red-500",
    "Black Market": "bg-gradient-to-r from-rta-gold to-rta-cta text-rta-bg font-black",
    "Limited":      "bg-rta-gold/15 text-rta-gold border border-rta-gold",
  };

  return (
    <div>
      <div className="flex items-end justify-between gap-4 mb-6 flex-wrap">
        <div>
          <h1 className="text-3xl font-black tracking-tight">Collection</h1>
          <p className="text-rta-muted text-sm mt-1">Toutes les cartes disponibles · les tiennes sont en couleur</p>
        </div>
      </div>

      <CollectionFiltersClient
        decks={allDecks.map((d) => ({ value: d, label: d }))}
        rarities={RARITIES.map((r) => ({ value: r, label: r }))}
        categories={POP_CATEGORIES}
        initial={{
          q: searchParams.q,
          deck: searchParams.deck,
          rarity: searchParams.rarity,
          category: searchParams.category,
          sort,
          order
        }}
      />

      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <p className="text-rta-muted text-sm">
          Page {safePage} / {totalPages} — {cards.length} cartes affichées
        </p>
        <div className="flex gap-2">
          {safePage > 1
            ? <a href={buildPageHref(safePage - 1)} className="px-3 py-1.5 rounded-lg bg-rta-surface border border-rta-border text-rta-ink text-sm hover:bg-rta-surface2 transition-colors">← Précédent</a>
            : <span className="px-3 py-1.5 rounded-lg bg-rta-surface border border-rta-border text-rta-muted text-sm opacity-40 cursor-not-allowed">← Précédent</span>}
          {safePage < totalPages
            ? <a href={buildPageHref(safePage + 1)} className="px-3 py-1.5 rounded-lg bg-rta-surface border border-rta-border text-rta-ink text-sm hover:bg-rta-surface2 transition-colors">Suivant →</a>
            : <span className="px-3 py-1.5 rounded-lg bg-rta-surface border border-rta-border text-rta-muted text-sm opacity-40 cursor-not-allowed">Suivant →</span>}
        </div>
      </div>

      {cards.length === 0 ? (
        <p className="text-rta-muted">Aucune carte trouvée.</p>
      ) : (
        <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(175px, 1fr))" }}>
          {cards.map((card) => {
            const owned = ownedIds.has(card.id);
            const rarity = card.rarity.name;
            return (
              <article
                key={card.id}
                className={[
                  "bg-rta-surface border rounded-xl overflow-hidden relative transition-transform duration-200",
                  owned ? "hover:-translate-y-1" : "opacity-40 grayscale",
                  rarityGlow[rarity] ?? "border-rta-border",
                ].join(" ")}
              >
                <div className="aspect-[3/4] w-full bg-gradient-to-b from-rta-surface2 to-rta-bg flex items-center justify-center relative">
                  {card.imageUrl ? (
                    <img src={card.imageUrl} alt={card.name} className="w-full h-full object-cover absolute inset-0" />
                  ) : (
                    <span className="text-4xl opacity-30">🃏</span>
                  )}
                  <span className={`absolute top-2 right-2 text-[0.58rem] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded ${rarityBadgeClass[rarity] ?? "bg-rta-surface2 text-rta-muted"}`}>
                    {rarity}
                  </span>
                  <span className="absolute bottom-2 left-2 text-[0.58rem] px-1.5 py-0.5 rounded-full bg-rta-bg/80 text-rta-muted border border-rta-ink/15">
                    {card.deck?.name ?? ""}
                  </span>
                  {!owned && (
                    <span className="absolute bottom-2 right-2 text-[0.58rem] px-1.5 py-0.5 rounded-full bg-rta-bg/85 text-rta-muted border border-rta-border">
                      Non possédée
                    </span>
                  )}
                </div>
                <div className="p-3">
                  <p className="text-sm font-bold text-rta-ink truncate">{card.name}</p>
                  <p className="text-[0.68rem] text-rta-muted uppercase tracking-wide mt-0.5">{rarity}</p>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}


