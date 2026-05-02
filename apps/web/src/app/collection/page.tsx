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
};

export default async function CollectionPage({ searchParams }: { searchParams: SearchParams }) {
  const session = await getServerSession(authOptions);
  const [cards, deckRows] = await Promise.all([
    prisma.card.findMany({
      where: {
        name: searchParams.q ? { contains: searchParams.q, mode: "insensitive" } : undefined,
        deck: searchParams.deck ? { name: searchParams.deck } : undefined,
        rarity: searchParams.rarity ? { name: searchParams.rarity } : undefined,
        category: searchParams.category ? searchParams.category : undefined
      },
      include: { deck: true, rarity: true }
    }),
    prisma.deck.findMany({ orderBy: { name: "asc" } })
  ]);
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
  const deckProgress = allDecks.map((deckName) => {
    const deckCards = cards.filter((card) => card.deck.name === deckName);
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

  const sort = searchParams.sort ?? "name";
  const order = searchParams.order ?? "asc";
  const sorted = [...cards].sort((a, b) => {
    const dir = order === "asc" ? 1 : -1;
    if (sort === "rarity") {
      const byWeight = (a.rarity.weight - b.rarity.weight) * dir;
      if (byWeight !== 0) return byWeight;
      return a.name.localeCompare(b.name);
    }
    if (sort === "deck") return a.deck.name.localeCompare(b.deck.name) * dir;
    if (sort === "category") return (a.category ?? "").localeCompare(b.category ?? "") * dir;
    return a.name.localeCompare(b.name) * dir;
  });

  const rarityColor: Record<string, string> = {
    Common: "#9e9e9e",
    Uncommon: "#4caf50",
    Rare: "#2196f3",
    "Very Rare": "#9c27b0",
    Import: "#ff9800",
    Exotic: "#f44336",
    "Black Market": "#212121",
    Limited: "#ffd700"
  };

  const categoryLabel = (cat: string | null) =>
    POP_CATEGORIES.find((c) => c.value === cat)?.label ?? (cat ?? "");

  return (
    <section className="card">
      <h1>Collection ({sorted.length} cartes)</h1>
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

      {sorted.length === 0 ? (
        <p style={{ color: "var(--muted)" }}>Aucune carte trouvée.</p>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: "1rem" }}>
          {sorted.map((card) => (
            <article key={card.id} style={{ background: "var(--card)", borderRadius: "10px", padding: "0.8rem", boxShadow: "0 2px 8px rgba(0,0,0,0.08)", display: "flex", flexDirection: "column", gap: "0.4rem" }}>
              {card.imageUrl && (
                <img src={card.imageUrl} alt={card.name} style={{ width: "100%", height: "140px", objectFit: "cover", borderRadius: "6px" }} />
              )}
              <strong style={{ fontSize: "0.95rem" }}>{card.name}</strong>
              {user && ownedIds.has(card.id) && <span style={{ fontSize: "0.75rem", color: "#2e7d32", fontWeight: 700 }}>Possédée</span>}
              <span style={{ fontSize: "0.8rem", fontWeight: 600, color: rarityColor[card.rarity.name] ?? "#333" }}>
                {card.rarity.name}
              </span>
              <span style={{ fontSize: "0.8rem", color: "var(--muted)" }}>{card.deck.name}</span>
              {card.category && (
                <span style={{ fontSize: "0.75rem", background: "rgba(0,0,0,0.07)", borderRadius: "4px", padding: "0.15rem 0.4rem", alignSelf: "flex-start" }}>
                  {categoryLabel(card.category)}
                </span>
              )}
              {card.description && (
                <span style={{ fontSize: "0.75rem", color: "var(--muted)", marginTop: "0.2rem" }}>{card.description}</span>
              )}
            </article>
          ))}
        </div>
      )}
    </section>
  );
}


