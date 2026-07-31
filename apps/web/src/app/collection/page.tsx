import { Prisma, prisma } from "@rta/database";
import { RARITIES } from "@rta/shared";
import CollectionFiltersClient from "./filters.client";
import { resolveSessionUser } from "../../lib/guard";

const DECKS_PER_PAGE = 3;

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
  { value: "unknown", label: "❓ Unknown" }
];

type SearchParams = {
  deck?: string;
  rarity?: string;
  category?: string;
  q?: string;
  ownership?: "owned" | "missing";
  page?: string;
};

const rarityGlow: Record<string, string> = {
  Common: "border-rta-border",
  Uncommon: "glow-uncommon",
  Rare: "glow-rare",
  "Very Rare": "glow-very-rare",
  Import: "glow-import",
  Exotic: "glow-exotic",
  "Black Market": "glow-black-market",
  Limited: "glow-limited"
};

const rarityBadgeClass: Record<string, string> = {
  Common: "bg-rta-surface2 text-rta-muted",
  Uncommon: "bg-rta-success/15 text-rta-success border border-rta-success",
  Rare: "bg-rta-accentHi/20 text-purple-300 border border-rta-accentHi",
  "Very Rare": "bg-purple-500/15 text-purple-300 border border-purple-500",
  Import: "bg-rta-cta/15 text-rta-cta border border-rta-cta",
  Exotic: "bg-red-500/15 text-red-400 border border-red-500",
  "Black Market": "bg-gradient-to-r from-rta-gold to-rta-cta text-rta-bg font-black",
  Limited: "bg-rta-gold/15 text-rta-gold border border-rta-gold"
};

export default async function CollectionPage({
  searchParams: searchParamsPromise
}: {
  searchParams: Promise<SearchParams>;
}) {
  const searchParams = await searchParamsPromise;
  const user = await resolveSessionUser();
  const pageRaw = Number(searchParams.page ?? "1");
  const requestedPage = Number.isFinite(pageRaw) ? Math.max(1, Math.floor(pageRaw)) : 1;
  const ownership = searchParams.ownership === "owned" || searchParams.ownership === "missing"
    ? searchParams.ownership
    : undefined;

  const [inventory, rewardClaims, deckRows] = await Promise.all([
    user
      ? prisma.inventoryItem.findMany({
          where: { userId: user.id, quantity: { gt: 0 } },
          select: { cardId: true }
        })
      : Promise.resolve([]),
    user
      ? prisma.collectionRewardClaim.findMany({ where: { userId: user.id } })
      : Promise.resolve([]),
    prisma.deck.findMany({
      where: {
        status: "PUBLISHED",
        isActive: true,
        cards: { some: { source: "vault", status: "PUBLISHED", isActive: true } }
      },
      include: { world: { select: { name: true, position: true } } }
    })
  ]);

  const ownedIds = new Set(inventory.map((item) => item.cardId));
  const ownershipWhere: Prisma.CardWhereInput | undefined = ownership
    ? user
      ? ownership === "owned"
        ? { inventory: { some: { userId: user.id, quantity: { gt: 0 } } } }
        : { inventory: { none: { userId: user.id, quantity: { gt: 0 } } } }
      : { id: "__authentication_required__" }
    : undefined;

  const cardWhere: Prisma.CardWhereInput = {
    source: "vault",
    status: "PUBLISHED",
    isActive: true,
    name: searchParams.q
      ? { contains: searchParams.q, mode: "insensitive" }
      : undefined,
    deck: searchParams.deck ? { name: searchParams.deck } : undefined,
    rarity: searchParams.rarity ? { name: searchParams.rarity } : undefined,
    category: searchParams.category || undefined,
    AND: ownershipWhere
  };

  const sortedDecks = deckRows.sort((left, right) => {
    const worldOrder = (left.world?.position ?? 999) - (right.world?.position ?? 999);
    return worldOrder || left.name.localeCompare(right.name, "fr");
  });
  const matchingDeckIds = new Set(
    (
      await prisma.card.findMany({
        where: cardWhere,
        select: { deckId: true },
        distinct: ["deckId"]
      })
    ).map((card) => card.deckId)
  );
  const filteredDecks = sortedDecks.filter((deck) => matchingDeckIds.has(deck.id));
  const totalPages = Math.max(1, Math.ceil(filteredDecks.length / DECKS_PER_PAGE));
  const safePage = Math.min(requestedPage, totalPages);
  const pageDecks = filteredDecks.slice(
    (safePage - 1) * DECKS_PER_PAGE,
    safePage * DECKS_PER_PAGE
  );
  const pageDeckIds = pageDecks.map((deck) => deck.id);

  const [cards, catalogCards] = pageDeckIds.length
    ? await Promise.all([
        prisma.card.findMany({
          where: { AND: [cardWhere, { deckId: { in: pageDeckIds } }] },
          include: { deck: true, rarity: true },
          orderBy: [{ rarity: { weight: "desc" } }, { name: "asc" }]
        }),
        prisma.card.findMany({
          where: {
            source: "vault",
            status: "PUBLISHED",
            isActive: true,
            deckId: { in: pageDeckIds }
          },
          select: { id: true, deckId: true }
        })
      ])
    : [[], []];

  const allDecks = sortedDecks.map((deck) => deck.name);
  const cardsByDeck = new Map<string, typeof cards>();
  for (const deck of pageDecks) cardsByDeck.set(deck.id, []);
  for (const card of cards) cardsByDeck.get(card.deckId)?.push(card);

  function buildPageHref(targetPage: number): string {
    const params = new URLSearchParams();
    if (searchParams.q) params.set("q", searchParams.q);
    if (searchParams.deck) params.set("deck", searchParams.deck);
    if (searchParams.rarity) params.set("rarity", searchParams.rarity);
    if (searchParams.category) params.set("category", searchParams.category);
    if (ownership) params.set("ownership", ownership);
    params.set("page", String(targetPage));
    return `/collection?${params.toString()}`;
  }

  return (
    <div>
      <div className="flex items-end justify-between gap-4 mb-6 flex-wrap">
        <div>
          <h1 className="text-3xl font-black tracking-tight">Collection</h1>
          <p className="text-rta-muted text-sm mt-1">
            3 decks par page · cartes classées de Common à Black Market
          </p>
        </div>
      </div>

      <CollectionFiltersClient
        decks={allDecks.map((deck) => ({ value: deck, label: deck }))}
        rarities={RARITIES.map((rarity) => ({ value: rarity, label: rarity }))}
        categories={POP_CATEGORIES}
        initial={{
          q: searchParams.q,
          deck: searchParams.deck,
          rarity: searchParams.rarity,
          category: searchParams.category,
          ownership
        }}
      />

      {ownership && !user && (
        <div className="mb-4 rounded-xl border border-rta-cta/50 bg-rta-cta/10 p-3 text-sm text-rta-ink">
          Connecte-toi avec Discord pour filtrer les cartes possédées ou manquantes.
        </div>
      )}

      <div className="flex items-center justify-between mb-5 flex-wrap gap-2">
        <p className="text-rta-muted text-sm">
          Page {safePage} / {totalPages} — {pageDecks.length} deck{pageDecks.length > 1 ? "s" : ""}
        </p>
        <div className="flex gap-2">
          {safePage > 1 ? (
            <a
              href={buildPageHref(safePage - 1)}
              className="px-3 py-1.5 rounded-lg bg-rta-surface border border-rta-border text-rta-ink text-sm hover:bg-rta-surface2 transition-colors"
            >
              ← Précédent
            </a>
          ) : (
            <span className="px-3 py-1.5 rounded-lg bg-rta-surface border border-rta-border text-rta-muted text-sm opacity-40 cursor-not-allowed">
              ← Précédent
            </span>
          )}
          {safePage < totalPages ? (
            <a
              href={buildPageHref(safePage + 1)}
              className="px-3 py-1.5 rounded-lg bg-rta-surface border border-rta-border text-rta-ink text-sm hover:bg-rta-surface2 transition-colors"
            >
              Suivant →
            </a>
          ) : (
            <span className="px-3 py-1.5 rounded-lg bg-rta-surface border border-rta-border text-rta-muted text-sm opacity-40 cursor-not-allowed">
              Suivant →
            </span>
          )}
        </div>
      </div>

      {pageDecks.length === 0 ? (
        <p className="text-rta-muted">Aucune carte trouvée avec ces filtres.</p>
      ) : (
        <div className="space-y-10">
          {pageDecks.map((deck) => {
            const deckCards = cardsByDeck.get(deck.id) ?? [];
            const canonicalDeckCards = catalogCards.filter((card) => card.deckId === deck.id);
            const ownedCount = canonicalDeckCards.filter((card) => ownedIds.has(card.id)).length;
            const completion = canonicalDeckCards.length
              ? Math.round((ownedCount / canonicalDeckCards.length) * 100)
              : 0;
            const claimed50 = rewardClaims.some(
              (claim) => claim.deckId === deck.id && claim.milestone === 50
            );
            const claimed100 = rewardClaims.some(
              (claim) => claim.deckId === deck.id && claim.milestone === 100
            );

            return (
              <section key={deck.id} aria-labelledby={`deck-${deck.id}`}>
                <div className="mb-4 rounded-xl border border-rta-border bg-rta-surface p-4">
                  <div className="flex items-end justify-between gap-4 flex-wrap">
                    <div>
                      <p className="text-[0.68rem] uppercase tracking-[0.2em] text-rta-cta font-bold">
                        {deck.world
                          ? `Monde ${deck.world.position} · ${deck.world.name}`
                          : "Deck Vault"}
                      </p>
                      <h2 id={`deck-${deck.id}`} className="text-2xl font-black mt-1">
                        {deck.name}
                      </h2>
                    </div>
                    <div className="text-right">
                      <p className="font-black text-rta-gold">
                        {ownedCount}/{canonicalDeckCards.length} possédées
                      </p>
                      <p className="text-xs text-rta-muted">
                        {completion}% complété
                        {claimed50 ? " · palier 50% ✓" : ""}
                        {claimed100 ? " · palier 100% ✓" : ""}
                      </p>
                    </div>
                  </div>
                  <div className="h-1.5 bg-rta-bg rounded-full overflow-hidden mt-3">
                    <div
                      className="h-full bg-gradient-to-r from-rta-accent to-rta-cta rounded-full"
                      style={{ width: `${completion}%` }}
                    />
                  </div>
                </div>

                {deckCards.length === 0 ? (
                  <p className="text-rta-muted text-sm">Aucune carte de ce deck ne correspond aux filtres.</p>
                ) : (
                  <div
                    className="grid gap-4"
                    style={{ gridTemplateColumns: "repeat(auto-fill, minmax(155px, 1fr))" }}
                  >
                    {deckCards.map((card) => {
                      const owned = ownedIds.has(card.id);
                      const rarity = card.rarity.name;
                      return (
                        <a
                          key={card.id}
                          href={`/cardinfo/${card.id}`}
                          aria-label={`Voir la fiche de ${card.name}`}
                          className={[
                            "block bg-rta-surface border rounded-xl overflow-hidden relative transition-transform duration-200 focus:outline-none focus:ring-2 focus:ring-rta-cta",
                            owned ? "hover:-translate-y-1" : "opacity-40 grayscale",
                            rarityGlow[rarity] ?? "border-rta-border"
                          ].join(" ")}
                        >
                          <div className="aspect-[3/4] w-full bg-gradient-to-b from-rta-surface2 to-rta-bg flex items-center justify-center relative">
                            {card.imageUrl ? (
                              <img
                                src={card.imageUrl}
                                alt={card.name}
                                className="w-full h-full object-cover absolute inset-0"
                              />
                            ) : (
                              <span className="text-4xl opacity-30">🃏</span>
                            )}
                            <span className={`absolute top-2 right-2 text-[0.58rem] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded ${rarityBadgeClass[rarity] ?? "bg-rta-surface2 text-rta-muted"}`}>
                              {rarity}
                            </span>
                            {!owned && (
                              <span className="absolute bottom-2 right-2 text-[0.58rem] px-1.5 py-0.5 rounded-full bg-rta-bg/85 text-rta-muted border border-rta-border">
                                Non possédée
                              </span>
                            )}
                          </div>
                          <div className="p-3">
                            <p className="text-sm font-bold text-rta-ink truncate">{card.name}</p>
                            <p className="text-[0.68rem] text-rta-muted uppercase tracking-wide mt-0.5">
                              {rarity}
                            </p>
                          </div>
                        </a>
                      );
                    })}
                  </div>
                )}
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
