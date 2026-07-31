import Link from "next/link";
import { Prisma, prisma } from "@rta/database";
import { requireAdmin } from "../../../lib/guard";
import AdminCardsFiltersClient from "./filters.client";

const rarityColor: Record<string, string> = {
  Common: "#9e9e9e",
  Uncommon: "#4caf50",
  Rare: "#2196f3",
  "Very Rare": "#9c27b0",
  Import: "#ff9800",
  Exotic: "#f44336",
  "Black Market": "#212121",
  Limited: "#b8860b"
};

type SearchParams = {
  q?: string;
  deck?: string;
  rarity?: string;
  category?: string;
  sort?: "name" | "rarity" | "deck" | "category";
  order?: "asc" | "desc";
  page?: string;
};

export default async function AdminCardsPage({
  searchParams: searchParamsPromise
}: {
  searchParams: Promise<SearchParams>;
}) {
  await requireAdmin();
  const searchParams = await searchParamsPromise;
  const pageSize = 48;
  const requestedPage = Math.max(1, Number(searchParams.page ?? 1) || 1);
  const order = searchParams.order === "desc" ? "desc" : "asc";

  const where: Prisma.CardWhereInput = {
    source: "vault",
    status: "PUBLISHED",
    isActive: true,
    ...(searchParams.q
      ? { name: { contains: searchParams.q.trim(), mode: "insensitive" } }
      : {}),
    ...(searchParams.deck ? { deck: { name: searchParams.deck } } : {}),
    ...(searchParams.rarity ? { rarity: { name: searchParams.rarity } } : {}),
    ...(searchParams.category ? { category: searchParams.category } : {})
  };

  const canonicalWhere: Prisma.CardWhereInput = {
    source: "vault",
    status: "PUBLISHED",
    isActive: true
  };

  const [totalCards, canonicalTotal, decks, rarities, categoryRows] = await Promise.all([
    prisma.card.count({ where }),
    prisma.card.count({ where: canonicalWhere }),
    prisma.deck.findMany({
      where: { cards: { some: canonicalWhere } },
      orderBy: { name: "asc" },
      select: { name: true }
    }),
    prisma.rarity.findMany({ orderBy: { weight: "desc" }, select: { name: true } }),
    prisma.card.findMany({
      where: { ...canonicalWhere, category: { not: null } },
      distinct: ["category"],
      orderBy: { category: "asc" },
      select: { category: true }
    })
  ]);

  const totalPages = Math.max(1, Math.ceil(totalCards / pageSize));
  const page = Math.min(requestedPage, totalPages);
  const orderBy: Prisma.CardOrderByWithRelationInput[] =
    searchParams.sort === "rarity"
      ? [{ rarity: { weight: order } }, { name: "asc" }]
      : searchParams.sort === "deck"
        ? [{ deck: { name: order } }, { name: "asc" }]
        : searchParams.sort === "category"
          ? [{ category: order }, { name: "asc" }]
          : [{ name: order }];

  const cards = await prisma.card.findMany({
    where,
    include: { deck: true, rarity: true },
    orderBy,
    skip: (page - 1) * pageSize,
    take: pageSize
  });

  const pageHref = (targetPage: number) => {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(searchParams)) {
      if (key !== "page" && value) params.set(key, value);
    }
    params.set("page", String(targetPage));
    return `/admin/cards?${params.toString()}`;
  };

  return (
    <section>
      <div style={{ display: "flex", justifyContent: "space-between", gap: "16px", alignItems: "end" }}>
        <div>
          <h1 style={{ margin: 0 }}>Catalogue des cartes</h1>
          <p style={{ color: "#6b5f4f", marginTop: "6px" }}>
            Source unique : Vault. {canonicalTotal} cartes publiées, aucune création manuelle.
          </p>
        </div>
        <Link href="/api/cards/export" className="button">
          Exporter le catalogue
        </Link>
      </div>

      <div className="card" style={{ marginTop: "16px" }}>
        <AdminCardsFiltersClient
          decks={decks.map((deck) => ({ value: deck.name, label: deck.name }))}
          rarities={rarities.map((rarity) => ({ value: rarity.name, label: rarity.name }))}
          categories={categoryRows.flatMap((row) =>
            row.category ? [{ value: row.category, label: row.category }] : []
          )}
          initial={searchParams}
        />
      </div>

      <p style={{ color: "#6b5f4f", fontSize: "13px" }}>
        {totalCards} résultat{totalCards > 1 ? "s" : ""} — page {page}/{totalPages}
      </p>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(190px, 1fr))",
          gap: "14px"
        }}
      >
        {cards.map((card) => (
          <Link
            key={card.id}
            href={`/cardinfo/${card.id}`}
            className="card"
            style={{ color: "inherit", textDecoration: "none", overflow: "hidden", padding: 0 }}
          >
            <div style={{ aspectRatio: "1 / 1", background: "#f4efe8", overflow: "hidden" }}>
              {card.imageUrl ? (
                <img
                  src={card.imageUrl}
                  alt={card.name}
                  loading="lazy"
                  style={{ width: "100%", height: "100%", objectFit: "cover" }}
                />
              ) : (
                <div style={{ padding: "24px", color: "#6b5f4f" }}>Image indisponible</div>
              )}
            </div>
            <div style={{ padding: "12px" }}>
              <strong>{card.name}</strong>
              <div style={{ color: "#6b5f4f", fontSize: "12px", marginTop: "4px" }}>
                {card.deck.name}
              </div>
              <span
                style={{
                  display: "inline-block",
                  marginTop: "8px",
                  padding: "2px 7px",
                  borderRadius: "999px",
                  color: "white",
                  fontSize: "11px",
                  background: rarityColor[card.rarity.name] ?? "#6b7280"
                }}
              >
                {card.rarity.name}
              </span>
            </div>
          </Link>
        ))}
      </div>

      {totalPages > 1 && (
        <nav style={{ display: "flex", justifyContent: "center", gap: "12px", marginTop: "20px" }}>
          {page > 1 && <Link href={pageHref(page - 1)}>← Précédent</Link>}
          {page < totalPages && <Link href={pageHref(page + 1)}>Suivant →</Link>}
        </nav>
      )}
    </section>
  );
}
