import { randomUUID } from "node:crypto";
import { prisma } from "@rta/database";
import {
  FRAGMENT_BOOSTER_COST,
  FRAGMENT_CARD_COST,
  TRANSMUTATION_CARD_COST,
  TRANSMUTATION_RARITY_CHAIN,
  TransmutationService,
  type TransmutationMode
} from "@rta/services";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "../../lib/guard";
import { getUserFragmentBalances } from "../../lib/fragments";
import { cardVariantImageUrl } from "../../lib/card-variant";
import CollectionSubnav from "../collection/collection-subnav";
import CardSacrificeSelector from "./card-sacrifice-selector.client";

const transmutationService = new TransmutationService();

type SearchParams = { success?: string; error?: string };

export default async function TransmutationPage({
  searchParams: searchParamsPromise
}: {
  searchParams: Promise<SearchParams>;
}) {
  const [user, searchParams] = await Promise.all([requireUser(), searchParamsPromise]);

  async function transmuteCards(formData: FormData) {
    "use server";
    const actionUser = await requireUser();
    const rawMode = String(formData.get("mode") ?? "BULK");
    const mode: TransmutationMode = ["DECK", "TIER", "BULK"].includes(rawMode)
      ? rawMode as TransmutationMode
      : "BULK";
    try {
      const result = await transmutationService.transmuteCards({
        userId: actionUser.id,
        mode,
        sacrificeItemIds: formData.getAll("sacrificeItemId").map(String),
        idempotencyKey: `web-${randomUUID()}`
      });
      revalidatePath("/collection/reactor");
      revalidatePath("/inventory");
      revalidatePath("/collection");
      redirect(`/collection/reactor?success=${encodeURIComponent(
        `${result.card.name} [${result.variant}] obtenue`
      )}`);
    } catch (error) {
      if (error && typeof error === "object" && "digest" in error) throw error;
      redirect(`/collection/reactor?error=${encodeURIComponent(
        error instanceof Error ? error.message : "Transmutation impossible"
      )}`);
    }
  }

  async function craftCard(formData: FormData) {
    "use server";
    const actionUser = await requireUser();
    const sourceRarity = String(formData.get("rarity") ?? "");
    if (!TRANSMUTATION_RARITY_CHAIN.includes(sourceRarity as never)) {
      redirect("/collection/reactor?error=Tier%20invalide");
    }
    try {
      const result = await transmutationService.craftCardFromFragments({
        userId: actionUser.id,
        sourceRarity: sourceRarity as (typeof TRANSMUTATION_RARITY_CHAIN)[number],
        idempotencyKey: `web-${randomUUID()}`
      });
      revalidatePath("/collection/reactor");
      revalidatePath("/inventory");
      redirect(`/collection/reactor?success=${encodeURIComponent(
        `Catalyse réussie : ${result.card.name} [${result.variant}]`
      )}`);
    } catch (error) {
      if (error && typeof error === "object" && "digest" in error) throw error;
      redirect(`/collection/reactor?error=${encodeURIComponent(
        error instanceof Error ? error.message : "Catalyse impossible"
      )}`);
    }
  }

  async function craftBooster(formData: FormData) {
    "use server";
    const actionUser = await requireUser();
    const rarity = String(formData.get("rarity") ?? "");
    if (!TRANSMUTATION_RARITY_CHAIN.includes(rarity as never)) {
      redirect("/collection/reactor?error=Tier%20invalide");
    }
    try {
      const result = await transmutationService.craftBoosterFromFragments({
        userId: actionUser.id,
        rarity: rarity as (typeof TRANSMUTATION_RARITY_CHAIN)[number],
        idempotencyKey: `web-${randomUUID()}`
      });
      revalidatePath("/collection/reactor");
      revalidatePath("/profile");
      redirect(`/collection/reactor?success=${encodeURIComponent(
        `Booster ${result.contentKey.split(".").at(-1)} créé`
      )}`);
    } catch (error) {
      if (error && typeof error === "object" && "digest" in error) throw error;
      redirect(`/collection/reactor?error=${encodeURIComponent(
        error instanceof Error ? error.message : "Catalyse impossible"
      )}`);
    }
  }

  const [inventory, fragmentBalances] = await Promise.all([
    prisma.inventoryItem.findMany({
      where: { userId: user.id, quantity: { gt: 0 }, archive: null },
      include: { card: { include: { deck: true, rarity: true } } },
      orderBy: [
        { card: { deck: { name: "asc" } } },
        { card: { rarity: { weight: "desc" } } },
        { card: { name: "asc" } }
      ]
    }),
    getUserFragmentBalances(user.id)
  ]);
  const fragmentMap = new Map(fragmentBalances.map((row) => [row.rarityName, row.quantity]));
  const selectorInventory = inventory.map((item) => ({
    id: item.id,
    name: item.card.name,
    deckId: item.card.deckId,
    deckName: item.card.deck.name,
    rarityName: item.card.rarity.name,
    rarityWeight: item.card.rarity.weight,
    variant: item.variant,
    quantity: item.quantity,
    imageUrl: cardVariantImageUrl(item.card.imageUrl, item.variant)
  }));

  return (
    <div>
      <CollectionSubnav active="reactor" />
      <div className="mb-6 rounded-2xl border border-rta-accentHi bg-gradient-to-br from-rta-accentHi/20 to-rta-surface p-6">
        <p className="text-xs font-black uppercase tracking-[0.2em] text-rta-cta">Collection avancée</p>
        <h1 className="mt-1 text-3xl font-black">⚛️ Réacteur d’Anomalies</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-rta-muted">
          Injecte cinq cartes précises dans le Réacteur. La transaction est atomique :
          soit les cinq sacrifices et la récompense sont validés ensemble, soit rien ne bouge.
        </p>
      </div>

      {searchParams.success && (
        <div className="mb-4 rounded-xl border border-rta-success bg-rta-success/10 p-3 text-sm font-bold text-rta-success">
          ✅ {searchParams.success}
        </div>
      )}
      {searchParams.error && (
        <div className="mb-4 rounded-xl border border-red-500 bg-red-500/10 p-3 text-sm font-bold text-red-300">
          ❌ {searchParams.error}
        </div>
      )}

      <section className="mb-6 rounded-xl border border-rta-border bg-rta-surface p-5">
        <h2 className="text-xl font-black">Fusion de cinq cartes</h2>
        <div className="mt-3 grid gap-3 md:grid-cols-3">
          <div className="rounded-lg border border-rta-border bg-rta-bg/50 p-3 text-xs leading-5 text-rta-muted">
            <strong className="block text-rta-ink">Deck</strong>
            5 cartes du même deck → une carte manquante de ce deck. Deck complet : priorité à une variante Shiny/Holo manquante.
          </div>
          <div className="rounded-lg border border-rta-border bg-rta-bg/50 p-3 text-xs leading-5 text-rta-muted">
            <strong className="block text-rta-ink">Tier</strong>
            5 cartes du même tier → une carte manquante du tier immédiatement supérieur, tous decks confondus.
          </div>
          <div className="rounded-lg border border-rta-border bg-rta-bg/50 p-3 text-xs leading-5 text-rta-muted">
            <strong className="block text-rta-ink">Vrac</strong>
            5 cartes libres → une carte que tu ne possèdes pas. 5 Shiny ou 5 Holo garantissent la même variante.
          </div>
        </div>

        <form action={transmuteCards} className="mt-5">
          <CardSacrificeSelector
            inventory={selectorInventory}
            cost={TRANSMUTATION_CARD_COST}
            tierNames={TRANSMUTATION_RARITY_CHAIN.slice(0, -1)}
          />
        </form>
      </section>

      <section className="rounded-xl border border-rta-border bg-rta-surface p-5">
        <h2 className="text-xl font-black">Catalyseurs de fragments</h2>
        <p className="mt-1 text-sm text-rta-muted">
          {FRAGMENT_CARD_COST} fragments d’un tier créent une carte manquante du tier supérieur.
          {" "}{FRAGMENT_BOOSTER_COST} fragments créent un Booster du Conquérant du même tier.
        </p>
        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {TRANSMUTATION_RARITY_CHAIN.map((rarity, index) => {
            const quantity = fragmentMap.get(rarity) ?? 0;
            const hasNext = index < TRANSMUTATION_RARITY_CHAIN.length - 1;
            const canBooster = index < TRANSMUTATION_RARITY_CHAIN.length - 1;
            return (
              <article key={rarity} className="rounded-lg border border-rta-border bg-rta-bg/50 p-4">
                <div className="flex items-center justify-between gap-2">
                  <strong>{rarity}</strong>
                  <span className="text-lg font-black text-purple-300">{quantity}</span>
                </div>
                <div className="mt-3 grid gap-2">
                  {hasNext && (
                    <form action={craftCard}>
                      <input type="hidden" name="rarity" value={rarity} />
                      <button
                        type="submit"
                        disabled={quantity < FRAGMENT_CARD_COST}
                        className="w-full rounded-lg bg-rta-accent px-3 py-2 text-xs font-bold text-rta-ink disabled:opacity-35"
                      >
                        {FRAGMENT_CARD_COST} → carte {TRANSMUTATION_RARITY_CHAIN[index + 1]}
                      </button>
                    </form>
                  )}
                  {canBooster && (
                    <form action={craftBooster}>
                      <input type="hidden" name="rarity" value={rarity} />
                      <button
                        type="submit"
                        disabled={quantity < FRAGMENT_BOOSTER_COST}
                        className="w-full rounded-lg border border-rta-gold/50 bg-rta-gold/10 px-3 py-2 text-xs font-bold text-rta-gold disabled:opacity-35"
                      >
                        {FRAGMENT_BOOSTER_COST} → booster {rarity}
                      </button>
                    </form>
                  )}
                  {!hasNext && <span className="text-xs text-rta-muted">Tier maximal atteint.</span>}
                </div>
              </article>
            );
          })}
        </div>
      </section>
    </div>
  );
}
