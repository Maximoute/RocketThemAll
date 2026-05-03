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
        name: searchParams.q ? { contains: searchParams.q, mode: "insensitive" } : undefined,
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

  return (
    <section className="card">
      <h1>Mon Inventaire ({totalItems} cartes)</h1>
      <p>Crédits: {user.credits} | Fragments: {user.fragments}</p>
      <p>Valeur dynamique totale inventaire: {totalInventoryValue} crédits</p>
      <h2>Fragments par tier</h2>
      <p style={{ color: "var(--muted)", marginTop: "-0.4rem" }}>
        Craft: {FRAGMENT_CRAFT_COST} fragments du tier inférieur pour créer 1 carte du tier supérieur.
      </p>
      <ul>
        {fragmentBalances.map((row) => (
          <li key={row.rarityName}>{row.rarityName}: {row.quantity}</li>
        ))}
      </ul>
      <form action={craftCardFromFragments} style={{ display: "flex", gap: "0.5rem", alignItems: "center", marginBottom: "1rem", flexWrap: "wrap" }}>
        <label htmlFor="targetRarity">Créer une carte:</label>
        <select id="targetRarity" name="targetRarity" defaultValue="Uncommon">
          {FRAGMENT_CHAIN.filter((rarity) => rarity !== "Common").map((rarity) => (
            <option key={rarity} value={rarity}>{rarity}</option>
          ))}
        </select>
        <button type="submit">Craft via fragments</button>
      </form>

      <InventoryFiltersClient
        decks={deckRows.map((d) => ({ value: d.name, label: d.name }))}
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

      <article className="card" style={{ marginTop: "0.75rem", marginBottom: "1rem" }}>
        <h2>Pagination</h2>
        <p style={{ color: "var(--muted)" }}>
          Page {safePage} / {totalPages} - {items.length} cartes affichées.
        </p>
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
          {safePage > 1 ? (
            <a href={buildPageHref(safePage - 1)} style={{ padding: "6px 10px", borderRadius: "6px", border: "1px solid #d1d5db", textDecoration: "none" }}>
              ← Page précédente
            </a>
          ) : (
            <span style={{ padding: "6px 10px", borderRadius: "6px", border: "1px solid #e5e7eb", color: "#9ca3af" }}>← Page précédente</span>
          )}
          {safePage < totalPages ? (
            <a href={buildPageHref(safePage + 1)} style={{ padding: "6px 10px", borderRadius: "6px", border: "1px solid #d1d5db", textDecoration: "none" }}>
              Page suivante →
            </a>
          ) : (
            <span style={{ padding: "6px 10px", borderRadius: "6px", border: "1px solid #e5e7eb", color: "#9ca3af" }}>Page suivante →</span>
          )}
        </div>
      </article>

      {items.length === 0 ? (
        <p style={{ color: "var(--muted)" }}>Aucune carte trouvée.</p>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: "1rem" }}>
          {items.map((item) => {
            const dynamic = dynamicValues.get(`${item.cardId}:${item.variant}`);
            return (
            <article key={item.id} style={{ background: "var(--card)", borderRadius: "10px", padding: "0.8rem", boxShadow: "0 2px 8px rgba(0,0,0,0.08)", display: "flex", flexDirection: "column", gap: "0.4rem" }}>
              {item.card.imageUrl && (
                <img src={item.card.imageUrl} alt={item.card.name} style={{ width: "100%", height: "140px", objectFit: "cover", borderRadius: "6px" }} />
              )}
              <strong style={{ fontSize: "0.95rem" }}>{item.card.name}</strong>
              <span style={{ fontSize: "0.75rem", fontWeight: 600 }}>Variante: {item.variant}</span>
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
              <span style={{ fontSize: "0.8rem", color: "var(--muted)" }}>Valeur /u: {dynamic?.unitPrice ?? 0} crédits</span>
              <span style={{ fontSize: "0.8rem", color: "var(--muted)" }}>Circulation: {dynamic?.circulationCount ?? 0}</span>
              <a
                href={`/inventory/card/${item.id}`}
                style={{ fontSize: "0.85rem", color: "var(--accent)", textDecoration: "none" }}
              >
                Ouvrir la fiche
              </a>
              <form action={recycleFromInventory} style={{ display: "grid", gap: "0.4rem", marginTop: "0.4rem" }}>
                <input type="hidden" name="itemId" value={item.id} />
                <input type="number" name="quantity" min={1} max={item.quantity} defaultValue={1} />
                <button type="submit">Fragmenter</button>
              </form>
              <form action={sellFromInventory} style={{ display: "grid", gap: "0.4rem", marginTop: "0.2rem" }}>
                <input type="hidden" name="itemId" value={item.id} />
                <input type="number" name="quantity" min={1} max={item.quantity} defaultValue={1} />
                <button type="submit">Vendre (80%)</button>
              </form>
            </article>
          );})}
        </div>
      )}
    </section>
  );
}


