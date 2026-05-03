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
    name: searchParams.q ? { contains: searchParams.q, mode: "insensitive" } : undefined,
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

  return (
    <section className="card">
      <h1>Collection ({totalCards} cartes)</h1>
      {user && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "0.75rem", marginBottom: "1rem" }}>
          {deckProgress.map((deck) => (
            <article key={deck.deckName} style={{ background: "var(--card)", borderRadius: "10px", padding: "0.8rem", border: "1px solid rgba(0,0,0,0.08)" }}>
              <strong>{deck.deckName}</strong>
              <div>{deck.owned}/{deck.total} cartes</div>
              <div>{deck.completion}% complété</div>
              <div style={{ fontSize: "0.8rem", color: "var(--muted)" }}>
                50%: {deck.claimed50 ? "réclamé" : deck.completion >= 50 ? "disponible" : "verrouillé"} | 100%: {deck.claimed100 ? "réclamé" : deck.completion >= 100 ? "disponible" : "verrouillé"}
              </div>
            </article>
          ))}
        </div>
      )}

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

      <div style={{ marginTop: "0.75rem", marginBottom: "1rem" }}>
        <p style={{ color: "var(--muted)", margin: "0 0 8px", fontSize: "0.85rem" }}>
          Page {safePage} / {totalPages} — {cards.length} cartes affichées
        </p>
        <div className="pagination">
          {safePage > 1
            ? <a href={buildPageHref(safePage - 1)} className="page-btn">← Précédent</a>
            : <span className="page-btn-disabled">← Précédent</span>}
          {safePage < totalPages
            ? <a href={buildPageHref(safePage + 1)} className="page-btn">Suivant →</a>
            : <span className="page-btn-disabled">Suivant →</span>}
        </div>
      </div>

      {cards.length === 0 ? (
        <p style={{ color: "var(--muted)" }}>Aucune carte trouvée.</p>
      ) : (
        <div className="grid cards">
          {cards.map((card) => {
            const rarityClass = "rarity-" + card.rarity.name.replace(/\s+/g, "-");
            return (
              <article key={card.id} className="item-card">
                {card.imageUrl && (
                  <img src={card.imageUrl} alt={card.name} />
                )}
                <div className="item-card-body">
                  <span className="item-card-name">{card.name}</span>
                  {user && ownedIds.has(card.id) && (
                    <span className="owned-badge">✓ Possédée</span>
                  )}
                  <span className={`rarity-badge ${rarityClass}`}>{card.rarity.name}</span>
                  <span className="tag-pill">{card.deck.name}</span>
                  {card.category && (
                    <span className="tag-pill">{categoryLabel(card.category)}</span>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}


