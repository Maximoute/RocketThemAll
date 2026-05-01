import { getServerSession } from "next-auth";
import { authOptions } from "../../lib/auth";
import { prisma } from "@rta/database";
import { redirect } from "next/navigation";
import { RARITIES, DECKS } from "@rta/shared";
import InventoryFiltersClient from "./filters.client";

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

export default async function InventoryPage({ searchParams }: { searchParams: SearchParams }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.name) {
    redirect("/login");
  }

  const user = await prisma.user.findFirst({ where: { username: session.user.name } });
  if (!user) {
    return <section className="card">Utilisateur introuvable</section>;
  }

  const items = await prisma.inventoryItem.findMany({
    where: {
      userId: user.id,
      card: {
        name: searchParams.q ? { contains: searchParams.q, mode: "insensitive" } : undefined,
        deck: searchParams.deck ? { name: searchParams.deck } : undefined,
        rarity: searchParams.rarity ? { name: searchParams.rarity } : undefined,
        category: searchParams.category ? searchParams.category : undefined
      }
    },
    include: { card: { include: { deck: true, rarity: true } } }
  });

  const sort = searchParams.sort ?? "name";
  const order = searchParams.order ?? "asc";
  const sorted = [...items].sort((a, b) => {
    const dir = order === "asc" ? 1 : -1;
    if (sort === "quantity") return (a.quantity - b.quantity) * dir;
    if (sort === "rarity") {
      const byWeight = (a.card.rarity.weight - b.card.rarity.weight) * dir;
      if (byWeight !== 0) return byWeight;
      return a.card.name.localeCompare(b.card.name);
    }
    if (sort === "deck") return a.card.deck.name.localeCompare(b.card.deck.name) * dir;
    if (sort === "category") return (a.card.category ?? "").localeCompare(b.card.category ?? "") * dir;
    return a.card.name.localeCompare(b.card.name) * dir;
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
      <h1>Mon Inventaire ({sorted.length} cartes)</h1>

      <InventoryFiltersClient
        decks={DECKS.map((d) => ({ value: d, label: d }))}
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
          {sorted.map((item) => (
            <article key={item.id} style={{ background: "var(--card)", borderRadius: "10px", padding: "0.8rem", boxShadow: "0 2px 8px rgba(0,0,0,0.08)", display: "flex", flexDirection: "column", gap: "0.4rem" }}>
              {item.card.imageUrl && (
                <img src={item.card.imageUrl} alt={item.card.name} style={{ width: "100%", height: "140px", objectFit: "cover", borderRadius: "6px" }} />
              )}
              <strong style={{ fontSize: "0.95rem" }}>{item.card.name}</strong>
              <span style={{ fontSize: "0.8rem", fontWeight: 600, color: rarityColor[item.card.rarity.name] ?? "#333" }}>
                {item.card.rarity.name}
              </span>
              <span style={{ fontSize: "0.8rem", color: "var(--muted)" }}>{item.card.deck.name}</span>
              {item.card.category && (
                <span style={{ fontSize: "0.75rem", background: "rgba(0,0,0,0.07)", borderRadius: "4px", padding: "0.15rem 0.4rem", alignSelf: "flex-start" }}>
                  {categoryLabel(item.card.category)}
                </span>
              )}
              <span style={{ fontSize: "0.85rem", marginTop: "auto" }}>×{item.quantity}</span>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}


