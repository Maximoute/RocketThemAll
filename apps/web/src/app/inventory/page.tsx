import { getServerSession } from "next-auth";
import { authOptions } from "../../lib/auth";
import { prisma } from "@rta/database";
import { redirect } from "next/navigation";
import { RARITIES, DECKS } from "@rta/shared";

type SearchParams = {
  deck?: string;
  rarity?: string;
  q?: string;
  sort?: string;
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
        rarity: searchParams.rarity ? { name: searchParams.rarity } : undefined
      }
    },
    include: { card: { include: { deck: true, rarity: true } } }
  });

  const sort = searchParams.sort ?? "name";
  const sorted = [...items].sort((a, b) => {
    if (sort === "quantity") return b.quantity - a.quantity;
    if (sort === "rarity") return a.card.rarity.name.localeCompare(b.card.rarity.name);
    if (sort === "deck") return a.card.deck.name.localeCompare(b.card.deck.name);
    return a.card.name.localeCompare(b.card.name);
  });

  const params = (extra: Record<string, string>) => {
    const p = new URLSearchParams({
      ...(searchParams.q ? { q: searchParams.q } : {}),
      ...(searchParams.deck ? { deck: searchParams.deck } : {}),
      ...(searchParams.rarity ? { rarity: searchParams.rarity } : {}),
      ...(searchParams.sort ? { sort: searchParams.sort } : {}),
      ...extra
    });
    return `?${p.toString()}`;
  };

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

  return (
    <section className="card">
      <h1>Mon Inventaire ({sorted.length} cartes)</h1>

      {/* Filters */}
      <form method="GET" style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", marginBottom: "1.5rem", alignItems: "center" }}>
        <input
          name="q"
          defaultValue={searchParams.q ?? ""}
          placeholder="Rechercher..."
          style={{ padding: "0.4rem 0.7rem", borderRadius: "6px", border: "1px solid #ccc", fontSize: "0.9rem" }}
        />
        <select name="deck" defaultValue={searchParams.deck ?? ""} style={{ padding: "0.4rem 0.7rem", borderRadius: "6px", border: "1px solid #ccc", fontSize: "0.9rem" }}>
          <option value="">Tous les decks</option>
          {DECKS.map((d) => <option key={d} value={d}>{d}</option>)}
        </select>
        <select name="rarity" defaultValue={searchParams.rarity ?? ""} style={{ padding: "0.4rem 0.7rem", borderRadius: "6px", border: "1px solid #ccc", fontSize: "0.9rem" }}>
          <option value="">Toutes les raretés</option>
          {RARITIES.map((r) => <option key={r} value={r}>{r}</option>)}
        </select>
        <select name="sort" defaultValue={sort} style={{ padding: "0.4rem 0.7rem", borderRadius: "6px", border: "1px solid #ccc", fontSize: "0.9rem" }}>
          <option value="name">Tri : Alphabétique</option>
          <option value="quantity">Tri : Quantité</option>
          <option value="rarity">Tri : Rareté</option>
          <option value="deck">Tri : Deck</option>
        </select>
        <button type="submit" style={{ padding: "0.4rem 1rem", borderRadius: "6px", background: "var(--accent)", color: "#fff", border: "none", cursor: "pointer", fontSize: "0.9rem" }}>
          Filtrer
        </button>
        <a href="/inventory" style={{ padding: "0.4rem 0.8rem", borderRadius: "6px", border: "1px solid #ccc", fontSize: "0.9rem", textDecoration: "none", color: "var(--ink)" }}>
          Réinitialiser
        </a>
      </form>

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
              <span style={{ fontSize: "0.85rem", marginTop: "auto" }}>×{item.quantity}</span>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}


