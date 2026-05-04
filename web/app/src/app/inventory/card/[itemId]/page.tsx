import { getServerSession } from "next-auth";
import { authOptions } from "../../../../lib/auth";
import { prisma } from "@rta/database";
import { notFound, redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getUserFragmentBalances } from "../../../../lib/fragments";
import { getDynamicCardValue } from "../../../../lib/economy";

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

const RARITY_COLORS: Record<string, string> = {
  Common: "#9e9e9e",
  Uncommon: "#4caf50",
  Rare: "#2196f3",
  "Very Rare": "#9c27b0",
  Import: "#ff9800",
  Exotic: "#f44336",
  "Black Market": "#212121",
  Limited: "#ffd700"
};

export default async function InventoryCardPage({ params }: { params: { itemId: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.name) {
    redirect("/login");
  }

  const user = await prisma.user.findFirst({ where: { username: session.user.name } });
  if (!user) {
    return <section className="card">Utilisateur introuvable</section>;
  }

  const item = await prisma.inventoryItem.findFirst({
    where: { id: params.itemId, userId: user.id },
    include: { card: { include: { rarity: true, deck: true } } }
  });

  if (!item) {
    notFound();
  }

  const config = await prisma.appConfig.upsert({ where: { id: "default" }, update: {}, create: { id: "default" } });
  const rarity = item.card.rarity.name as keyof typeof RECYCLE_PRICE_KEYS;
  const unitCredits = config[RECYCLE_PRICE_KEYS[rarity]] as number;
  const unitFragments = config[FRAGMENT_REWARD_KEYS[rarity]] as number;
  const fragmentBalances = await getUserFragmentBalances(user.id);
  const dynamicValue = await getDynamicCardValue(item.cardId, item.variant);

  async function fragmentFromCardPage(formData: FormData) {
    "use server";

    const actionSession = await getServerSession(authOptions);
    if (!actionSession?.user?.name) {
      redirect("/login");
    }

    const actionUser = await prisma.user.findFirst({ where: { username: actionSession.user.name } });
    if (!actionUser) {
      return;
    }

    const quantityRaw = Number(formData.get("quantity") ?? 1);
    const quantity = Number.isFinite(quantityRaw) ? Math.max(1, Math.floor(quantityRaw)) : 1;

    const currentItem = await prisma.inventoryItem.findFirst({
      where: { id: params.itemId, userId: actionUser.id },
      include: { card: { include: { rarity: true } } }
    });

    if (!currentItem) {
      redirect("/inventory");
    }

    const safeQuantity = Math.min(quantity, currentItem.quantity);
    const actionConfig = await prisma.appConfig.upsert({ where: { id: "default" }, update: {}, create: { id: "default" } });
    const actionRarity = currentItem.card.rarity.name as keyof typeof RECYCLE_PRICE_KEYS;
    const actionUnitCredits = actionConfig[RECYCLE_PRICE_KEYS[actionRarity]] as number;
    const actionUnitFragments = actionConfig[FRAGMENT_REWARD_KEYS[actionRarity]] as number;
    const gainedCredits = actionUnitCredits * safeQuantity;
    const gainedFragments = actionUnitFragments * safeQuantity;

    await prisma.$transaction(async (tx) => {
      if (currentItem.quantity === safeQuantity) {
        await tx.inventoryItem.delete({ where: { id: currentItem.id } });
      } else {
        await tx.inventoryItem.update({ where: { id: currentItem.id }, data: { quantity: { decrement: safeQuantity } } });
      }

      await tx.user.update({
        where: { id: actionUser.id },
        data: { credits: { increment: gainedCredits }, fragments: { increment: gainedFragments } }
      });

      await tx.fragmentBalance.upsert({
        where: { userId_rarityId: { userId: actionUser.id, rarityId: currentItem.card.rarityId } },
        update: { quantity: { increment: gainedFragments } },
        create: { userId: actionUser.id, rarityId: currentItem.card.rarityId, quantity: gainedFragments }
      });

      await tx.transactionLog.create({
        data: {
          userId: actionUser.id,
          type: "recycle",
          amount: gainedCredits,
          metadata: {
            cardId: currentItem.cardId,
            quantity: safeQuantity,
            fragments: gainedFragments,
            source: "inventory_web_card_page"
          }
        }
      });
    });

    revalidatePath("/inventory");
    revalidatePath(`/inventory/card/${params.itemId}`);
    revalidatePath("/profile");
  }

  const rarityColor = RARITY_COLORS[item.card.rarity.name] ?? "#333";

  return (
    <section className="card" style={{ maxWidth: "760px", margin: "0 auto" }}>
      <a href="/inventory" style={{ fontSize: "0.9rem", color: "var(--accent)", textDecoration: "none" }}>
        ← Retour à l'inventaire
      </a>

      <div style={{ display: "flex", gap: "1rem", marginTop: "1rem", flexWrap: "wrap" }}>
        {item.card.imageUrl && (
          <img
            src={item.card.imageUrl}
            alt={item.card.name}
            style={{ width: "220px", height: "300px", objectFit: "cover", borderRadius: "10px", boxShadow: "0 4px 16px rgba(0,0,0,0.15)" }}
          />
        )}

        <div style={{ flex: 1, minWidth: "220px" }}>
          <h1 style={{ marginTop: 0 }}>{item.card.name}</h1>
          <p style={{ color: rarityColor, fontWeight: 700 }}>{item.card.rarity.name}</p>
          <p>Variante: {item.variant}</p>
          <p>Deck: {item.card.deck.name}</p>
          <p>Quantité: {item.quantity}</p>
          <p>Valeur recyclage / carte: {unitCredits} crédits + {unitFragments} fragments</p>
          <p>Valeur de marché / carte: {dynamicValue?.unitPrice ?? 0} crédits (circulation: {dynamicValue?.circulationCount ?? 0})</p>
          <p>Fragments totaux: {user.fragments}</p>

          <details>
            <summary>Voir fragments par tier</summary>
            <ul>
              {fragmentBalances.map((row) => (
                <li key={row.rarityName}>{row.rarityName}: {row.quantity}</li>
              ))}
            </ul>
          </details>

          <form action={fragmentFromCardPage} style={{ display: "grid", gap: "0.6rem", maxWidth: "240px", marginTop: "0.8rem" }}>
            <label htmlFor="quantity">Quantité à fragmenter</label>
            <input id="quantity" name="quantity" type="number" min={1} max={item.quantity} defaultValue={1} />
            <button type="submit">Fragmenter cette carte</button>
          </form>
        </div>
      </div>

      {item.card.description && (
        <div style={{ marginTop: "1rem", padding: "0.9rem", background: "rgba(0,0,0,0.04)", borderRadius: "8px" }}>
          <strong>Description</strong>
          <p style={{ marginBottom: 0 }}>{item.card.description}</p>
        </div>
      )}
    </section>
  );
}
