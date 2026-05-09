import { getServerSession } from "next-auth";
import { authOptions } from "../../lib/auth";
import { prisma } from "@rta/database";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { RARITIES } from "@rta/shared";
import InventoryFiltersClient from "./filters.client";
import { FRAGMENT_CHAIN, FRAGMENT_CRAFT_COST, getSourceRarityForTarget, getUserFragmentBalances, type FragmentRarity } from "../../lib/fragments";
import { getDynamicCardValue, getDynamicCardValuesBatch, getUserInventoryValue } from "../../lib/economy";

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

const RECYCLE_PRICE_KEYS = {
  Common: "commonRecyclePrice",
  Uncommon: "uncommonRecyclePrice",
  Rare: "rareRecyclePrice",
  "Very Rare": "veryRareRecyclePrice",
  Import: "importRecyclePrice",
  Exotic: "exoticRecyclePrice",
  "Black Market": "blackMarketRecyclePrice"
} as const;

const FRAGMENT_REWARD_KEYS = {
  Common: "commonFragmentReward",
  Uncommon: "uncommonFragmentReward",
  Rare: "rareFragmentReward",
  "Very Rare": "veryRareFragmentReward",
  Import: "importFragmentReward",
  Exotic: "exoticFragmentReward",
  "Black Market": "blackMarketFragmentReward"
} as const;

export default async function InventoryPage({ searchParams }: { searchParams: SearchParams }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.name) {
    redirect("/login");
  }

  const user = await prisma.user.findFirst({ where: { username: session.user.name } });
  if (!user) {
    return <section className="card">Utilisateur introuvable</section>;
  }

  async function recycleFromInventory(formData: FormData) {
    "use server";

    const actionSession = await getServerSession(authOptions);
    if (!actionSession?.user?.name) {
      redirect("/login");
    }

    const actionUser = await prisma.user.findFirst({ where: { username: actionSession.user.name } });
    if (!actionUser) {
      return;
    }

    const itemId = String(formData.get("itemId") ?? "").trim();
    const quantityRaw = Number(formData.get("quantity") ?? 1);
    const quantity = Number.isFinite(quantityRaw) ? Math.max(1, Math.floor(quantityRaw)) : 1;

    const item = await prisma.inventoryItem.findFirst({
      where: { id: itemId, userId: actionUser.id },
      include: { card: { include: { rarity: true } } }
    });

    if (!item) {
      return;
    }

    const safeQuantity = Math.min(quantity, item.quantity);
    const config = await prisma.appConfig.upsert({ where: { id: "default" }, update: {}, create: { id: "default" } });
    const rarity = item.card.rarity.name as keyof typeof RECYCLE_PRICE_KEYS;
    const unitCredits = config[RECYCLE_PRICE_KEYS[rarity]] as number;
    const unitFragments = config[FRAGMENT_REWARD_KEYS[rarity]] as number;
    const gainedCredits = unitCredits * safeQuantity;
    const gainedFragments = unitFragments * safeQuantity;

    await prisma.$transaction(async (tx) => {
      if (item.quantity === safeQuantity) {
        await tx.inventoryItem.delete({ where: { id: item.id } });
      } else {
        await tx.inventoryItem.update({ where: { id: item.id }, data: { quantity: { decrement: safeQuantity } } });
      }

      await tx.user.update({
        where: { id: actionUser.id },
        data: { credits: { increment: gainedCredits }, fragments: { increment: gainedFragments } }
      });

      await tx.fragmentBalance.upsert({
        where: { userId_rarityId: { userId: actionUser.id, rarityId: item.card.rarityId } },
        update: { quantity: { increment: gainedFragments } },
        create: { userId: actionUser.id, rarityId: item.card.rarityId, quantity: gainedFragments }
      });

      await tx.transactionLog.create({
        data: {
          userId: actionUser.id,
          type: "recycle",
          amount: gainedCredits,
          metadata: { cardId: item.cardId, quantity: safeQuantity, fragments: gainedFragments, source: "inventory_web" }
        }
      });
    });

    revalidatePath("/inventory");
    revalidatePath("/profile");
  }

  async function sellFromInventory(formData: FormData) {
    "use server";

    const actionSession = await getServerSession(authOptions);
    if (!actionSession?.user?.name) {
      redirect("/login");
    }

    const actionUser = await prisma.user.findFirst({ where: { username: actionSession.user.name } });
    if (!actionUser) {
      return;
    }

    const itemId = String(formData.get("itemId") ?? "").trim();
    const quantityRaw = Number(formData.get("quantity") ?? 1);
    const quantity = Number.isFinite(quantityRaw) ? Math.max(1, Math.floor(quantityRaw)) : 1;

    const item = await prisma.inventoryItem.findFirst({
      where: { id: itemId, userId: actionUser.id },
      include: { card: { include: { rarity: true } } }
    });

    if (!item) {
      return;
    }

    const safeQuantity = Math.min(quantity, item.quantity);
    const dynamic = await getDynamicCardValue(item.cardId, item.variant);
    const dynamicUnitPrice = dynamic?.unitPrice ?? 0;
    const unitSellPrice = Math.floor(dynamicUnitPrice * 0.8);
    const gainedCredits = unitSellPrice * safeQuantity;

    await prisma.$transaction(async (tx) => {
      if (item.quantity === safeQuantity) {
        await tx.inventoryItem.delete({ where: { id: item.id } });
      } else {
        await tx.inventoryItem.update({ where: { id: item.id }, data: { quantity: { decrement: safeQuantity } } });
      }

      if (gainedCredits > 0) {
        await tx.user.update({ where: { id: actionUser.id }, data: { credits: { increment: gainedCredits } } });
      }

      await tx.transactionLog.create({
        data: {
          userId: actionUser.id,
          type: "sell",
          amount: gainedCredits,
          metadata: {
            source: "inventory_web",
            priceRatio: 0.8,
            cardId: item.cardId,
            variant: item.variant,
            quantity: safeQuantity,
            dynamicUnitPrice,
            soldUnitPrice: unitSellPrice
          }
        }
      });

      await tx.economyLog.create({
        data: {
          userId: actionUser.id,
          type: "sell_card",
          amount: gainedCredits,
          metadata: {
            source: "inventory_web",
            priceRatio: 0.8,
            cardId: item.cardId,
            variant: item.variant,
            quantity: safeQuantity,
            dynamicUnitPrice,
            soldUnitPrice: unitSellPrice
          }
        }
      });
    });

    revalidatePath("/inventory");
    revalidatePath("/profile");
  }

  async function craftCardFromFragments(formData: FormData) {
    "use server";

    const actionSession = await getServerSession(authOptions);
    if (!actionSession?.user?.name) {
      redirect("/login");
    }

    const actionUser = await prisma.user.findFirst({ where: { username: actionSession.user.name } });
    if (!actionUser) {
      return;
    }

    const targetRarity = String(formData.get("targetRarity") ?? "") as FragmentRarity;
    if (!FRAGMENT_CHAIN.includes(targetRarity)) {
      return;
    }

    const sourceRarity = getSourceRarityForTarget(targetRarity);
    if (!sourceRarity) {
      return;
    }

    const [sourceRarityRow, targetRarityRow] = await Promise.all([
      prisma.rarity.findUnique({ where: { name: sourceRarity } }),
      prisma.rarity.findUnique({ where: { name: targetRarity } })
    ]);
    if (!sourceRarityRow || !targetRarityRow) {
      return;
    }

    const sourceBalance = await prisma.fragmentBalance.findUnique({
      where: { userId_rarityId: { userId: actionUser.id, rarityId: sourceRarityRow.id } }
    });
    if (!sourceBalance || sourceBalance.quantity < FRAGMENT_CRAFT_COST) {
      return;
    }

    const pool = await prisma.card.findMany({ where: { rarityId: targetRarityRow.id } });
    if (pool.length === 0) {
      return;
    }

    const reward = pool[Math.floor(Math.random() * pool.length)];

    await prisma.$transaction(async (tx) => {
      await tx.fragmentBalance.update({
        where: { userId_rarityId: { userId: actionUser.id, rarityId: sourceRarityRow.id } },
        data: { quantity: { decrement: FRAGMENT_CRAFT_COST } }
      });

      await tx.user.update({ where: { id: actionUser.id }, data: { fragments: { decrement: FRAGMENT_CRAFT_COST } } });

      await tx.inventoryItem.upsert({
        where: { userId_cardId_variant: { userId: actionUser.id, cardId: reward.id, variant: "normal" } },
        update: { quantity: { increment: 1 } },
        create: { userId: actionUser.id, cardId: reward.id, variant: "normal", quantity: 1 }
      });

      await tx.transactionLog.create({
        data: {
          userId: actionUser.id,
          type: "fragment_craft",
          amount: 1,
          metadata: { sourceRarity, targetRarity, cost: FRAGMENT_CRAFT_COST, rewardCardId: reward.id }
        }
      });
    });

    revalidatePath("/inventory");
    revalidatePath("/profile");
  }

  const sort = searchParams.sort ?? "name";
  const order = searchParams.order ?? "asc";
  const pageRaw = Number(searchParams.page ?? "1");
  const page = Number.isFinite(pageRaw) ? Math.max(1, Math.floor(pageRaw)) : 1;
  const pageSize = 100;

  const where = {
    where: {
      userId: user.id,
      card: {
        name: searchParams.q ? { contains: searchParams.q, mode: "insensitive" as const } : undefined,
        deck: searchParams.deck ? { name: searchParams.deck } : undefined,
        rarity: searchParams.rarity ? { name: searchParams.rarity } : undefined,
        category: searchParams.category ? searchParams.category : undefined
      }
    }
  };

  const orderBy =
    sort === "quantity"
      ? [{ quantity: order }]
      : sort === "rarity"
      ? [{ card: { rarity: { weight: order } } }, { card: { name: "asc" as const } }]
      : sort === "deck"
      ? [{ card: { deck: { name: order } } }, { card: { name: "asc" as const } }]
      : sort === "category"
      ? [{ card: { category: order } }, { card: { name: "asc" as const } }]
      : [{ card: { name: order } }];

  const [totalItems, deckRows] = await Promise.all([
    prisma.inventoryItem.count(where),
    prisma.deck.findMany({ orderBy: { name: "asc" }, select: { name: true } })
  ]);
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const safePage = Math.min(page, totalPages);

  const items = await prisma.inventoryItem.findMany({
    ...where,
    include: { card: { include: { deck: true, rarity: true } } },
    orderBy,
    skip: (safePage - 1) * pageSize,
    take: pageSize
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
  const fragmentBalances = await getUserFragmentBalances(user.id);
  const totalInventoryValue = await getUserInventoryValue(user.id);
  const dynamicValues = await getDynamicCardValuesBatch(items.map((item) => ({ cardId: item.cardId, variant: item.variant })));

  function buildPageHref(targetPage: number): string {
    const params = new URLSearchParams();
    if (searchParams.q) params.set("q", searchParams.q);
    if (searchParams.deck) params.set("deck", searchParams.deck);
    if (searchParams.rarity) params.set("rarity", searchParams.rarity);
    if (searchParams.category) params.set("category", searchParams.category);
    if (sort) params.set("sort", sort);
    if (order) params.set("order", order);
    params.set("page", String(targetPage));
    return `/inventory?${params.toString()}`;
  }

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
      {/* Header */}
      <div className="flex items-end justify-between gap-4 mb-6 flex-wrap">
        <div>
          <h1 className="text-3xl font-black tracking-tight">Mon Inventaire</h1>
          <p className="text-rta-muted text-sm mt-1">Toutes tes cartes collectées via Discord</p>
        </div>
        <div className="flex gap-6">
          {[
            { value: totalItems, label: "total",      color: "text-rta-success" },
            { value: user.credits, label: "crédits",  color: "text-rta-gold"   },
            { value: user.fragments, label: "frags",  color: "text-purple-300" },
          ].map(({ value, label, color }) => (
            <div key={label} className="text-right">
              <div className={`text-2xl font-black ${color}`}>{value.toLocaleString("fr-FR")}</div>
              <div className="text-[0.65rem] uppercase tracking-widest text-rta-muted">{label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Fragment craft */}
      <div className="bg-rta-surface border border-rta-border rounded-xl p-4 mb-5">
        <h2 className="text-sm font-bold mb-1">🔮 Craft de fragments</h2>
        <p className="text-xs text-rta-muted mb-3">
          {FRAGMENT_CRAFT_COST} fragments du tier inférieur = 1 carte du tier supérieur · Valeur inventaire: <strong className="text-rta-success">{totalInventoryValue}</strong> crédits
        </p>
        <div className="flex gap-3 flex-wrap items-center">
          {fragmentBalances.map((row) => (
            <span key={row.rarityName} className="text-xs px-2 py-1 rounded bg-rta-bg/50 border border-rta-border">
              {row.rarityName}: <strong className="text-rta-success">{row.quantity}</strong>
            </span>
          ))}
          <form action={craftCardFromFragments} className="flex gap-2 items-center ml-auto">
            <select name="targetRarity" defaultValue="Uncommon" className="bg-rta-bg border border-rta-border rounded-lg px-3 py-1.5 text-sm text-rta-ink">
              {FRAGMENT_CHAIN.filter((r) => r !== "Common").map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
            <button type="submit" className="px-3 py-1.5 rounded-lg bg-rta-accent text-rta-ink text-sm font-bold hover:bg-rta-accentHi transition-colors">
              Craft
            </button>
          </form>
        </div>
      </div>

      {/* Filters */}
      <InventoryFiltersClient
        decks={deckRows.map((d) => ({ value: d.name, label: d.name }))}
        rarities={RARITIES.map((r) => ({ value: r, label: r }))}
        categories={POP_CATEGORIES}
        initial={{ q: searchParams.q, deck: searchParams.deck, rarity: searchParams.rarity, category: searchParams.category, sort, order }}
      />

      {/* Pagination */}
      <div className="flex items-center justify-between mb-4 text-sm">
        <span className="text-rta-muted">Page {safePage} / {totalPages} · {items.length} cartes</span>
        <div className="flex gap-2">
          {safePage > 1 ? (
            <a href={buildPageHref(safePage - 1)} className="px-3 py-1.5 rounded-lg border border-rta-border text-rta-muted hover:text-rta-ink hover:border-rta-accentHi transition-colors">
              ← Précédente
            </a>
          ) : null}
          {safePage < totalPages ? (
            <a href={buildPageHref(safePage + 1)} className="px-3 py-1.5 rounded-lg border border-rta-border text-rta-muted hover:text-rta-ink hover:border-rta-accentHi transition-colors">
              Suivante →
            </a>
          ) : null}
        </div>
      </div>

      {/* Card grid */}
      {items.length === 0 ? (
        <p className="text-rta-muted text-sm">Aucune carte trouvée.</p>
      ) : (
        <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(175px, 1fr))" }}>
          {items.map((item) => {
            const dynamic = dynamicValues.get(`${item.cardId}:${item.variant}`);
            const rarity = item.card.rarity.name;
            return (
              <article key={item.id} className={`bg-rta-surface border rounded-xl overflow-hidden transition-transform duration-200 hover:-translate-y-1 relative ${rarityGlow[rarity] ?? "border-rta-border"}`}>
                <div className="aspect-[3/4] w-full bg-gradient-to-b from-rta-surface2 to-rta-bg flex items-center justify-center relative">
                  {item.card.imageUrl ? (
                    <img src={item.card.imageUrl} alt={item.card.name} className="w-full h-full object-cover absolute inset-0" />
                  ) : (
                    <span className="text-4xl opacity-30">🃏</span>
                  )}
                  <span className={`absolute top-2 right-2 text-[0.58rem] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded ${rarityBadgeClass[rarity] ?? "bg-rta-surface2 text-rta-muted"}`}>
                    {rarity}
                  </span>
                  <span className="absolute bottom-2 left-2 text-[0.58rem] px-1.5 py-0.5 rounded-full bg-rta-bg/80 text-rta-muted border border-rta-ink/15">
                    {item.card.deck.name}
                  </span>
                  <span className="absolute bottom-2 right-2 text-[0.6rem] font-bold px-1.5 py-0.5 rounded-full bg-rta-bg/85 text-rta-cta border border-rta-cta/30">
                    ×{item.quantity}
                  </span>
                </div>
                <div className="p-3">
                  <p className="text-sm font-bold text-rta-ink truncate">{item.card.name}</p>
                  {item.card.category && (
                    <p className="text-[0.65rem] text-rta-muted mt-0.5">{categoryLabel(item.card.category)}</p>
                  )}
                  <p className="text-[0.65rem] text-rta-muted mt-1">
                    {dynamic?.unitPrice ?? 0} crédits / unité
                  </p>
                  <a href={`/inventory/card/${item.id}`} className="text-xs text-rta-success hover:underline mt-1 block">
                    Voir la fiche →
                  </a>
                  <div className="flex gap-1.5 mt-2">
                    <form action={recycleFromInventory} className="flex-1">
                      <input type="hidden" name="itemId" value={item.id} />
                      <input type="hidden" name="quantity" value={1} />
                      <button type="submit" className="w-full text-[0.68rem] py-1 rounded bg-rta-bg border border-rta-border text-rta-muted hover:text-rta-ink hover:border-rta-accent transition-colors">
                        Fragmenter
                      </button>
                    </form>
                    <form action={sellFromInventory} className="flex-1">
                      <input type="hidden" name="itemId" value={item.id} />
                      <input type="hidden" name="quantity" value={1} />
                      <button type="submit" className="w-full text-[0.68rem] py-1 rounded bg-rta-bg border border-rta-border text-rta-muted hover:text-rta-ink hover:border-rta-cta transition-colors">
                        Vendre 80%
                      </button>
                    </form>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}


