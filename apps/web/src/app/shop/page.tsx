import { randomUUID } from "node:crypto";
import { prisma } from "@rta/database";
import {
  AppError,
  BoosterService,
  configuredDiscordSku,
  discordMonetizationEnabled,
  formatEuro,
  getMonetizationProduct,
  ItemShopService,
  itemResaleUnitPrice,
  itemTechnicalDescription,
  MONETIZATION_PRODUCTS,
  MonetizationService,
  type MonetizationProductKey
} from "@rta/services";
import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "../../lib/guard";
import {
  paymentsEnabled,
  stripeModeLabel,
  stripeProductReady
} from "../../lib/stripe";
import {
  createStripeCheckout,
  openStripeCustomerPortal
} from "./actions";

const BOOSTER_TYPES = ["basic", "rare", "epic", "legendary"] as const;
type BoosterType = (typeof BOOSTER_TYPES)[number];
const boosterService = new BoosterService();
const itemShopService = new ItemShopService();
const monetizationService = new MonetizationService();

type ShopMetadata = {
  creditPrice?: number;
  rarity?: string | null;
  acquisitionSource?: string | null;
  imageUrl?: string | null;
  category?: string | null;
  tradable?: boolean;
};

type SearchParams = {
  error?: string;
  success?: string;
  payment?: "success" | "cancelled";
  session_id?: string;
  section?: "credits" | "premium";
};

function asMetadata(value: unknown): ShopMetadata {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as ShopMetadata
    : {};
}

function boosterType(contentKey: string): BoosterType | null {
  const value = contentKey.replace(/^booster\./, "") as BoosterType;
  return BOOSTER_TYPES.includes(value) ? value : null;
}

function boosterCatalogRank(contentKey: string) {
  const type = boosterType(contentKey);
  return type ? BOOSTER_TYPES.indexOf(type) : Number.MAX_SAFE_INTEGER;
}

function categoryLabel(type: string, metadata: ShopMetadata) {
  return metadata.category || ({
    ARTIFACT: "Artefacts",
    CONSUMABLE: "Consommables",
    OFFERING: "Offrandes de boss",
    BOOSTER: "Boosters"
  } as Record<string, string>)[type] || "Autres";
}

export default async function ShopPage({
  searchParams: searchParamsPromise
}: {
  searchParams: Promise<SearchParams>;
}) {
  const [user, searchParams] = await Promise.all([requireUser(), searchParamsPromise]);
  const section = searchParams.section === "premium" ? "premium" : "credits";

  async function buyCatalogItem(formData: FormData) {
    "use server";

    const actionUser = await requireUser();
    const contentKey = String(formData.get("contentKey") ?? "");
    const operationKey = String(formData.get("operationKey") ?? "");
    try {
      const definition = await prisma.itemDefinition.findUnique({
        where: { contentKey },
        select: { type: true, status: true }
      });
      if (!definition || definition.status !== "PUBLISHED") {
        throw new AppError("Objet introuvable", 404);
      }
      if (definition.type === "BOOSTER") {
        const type = boosterType(contentKey);
        if (!type) throw new AppError("Booster invalide", 400);
        await boosterService.buyBooster(actionUser.id, type, operationKey);
      } else {
        await itemShopService.buyItem(actionUser.id, contentKey, operationKey);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Achat impossible";
      redirect(`/shop?error=${encodeURIComponent(message)}`);
    }
    redirect("/shop?success=Achat%20confirm%C3%A9");
  }

  async function sellCatalogItem(formData: FormData) {
    "use server";

    const actionUser = await requireUser();
    const contentKey = String(formData.get("contentKey") ?? "");
    let credits = 0;
    try {
      const result = await itemShopService.sellItem(
        actionUser.id,
        contentKey,
        1,
        `web-${randomUUID()}`
      );
      credits = result.credits;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Vente impossible";
      redirect(`/shop?error=${encodeURIComponent(message)}`);
    }
    redirect(`/shop?success=${encodeURIComponent(
      `Objet vendu pour ${credits.toLocaleString("fr-FR")} crédits`
    )}`);
  }

  const [definitions, ownedItems, ownedBoosters] = await Promise.all([
    prisma.itemDefinition.findMany({
      where: { status: "PUBLISHED" },
      orderBy: [{ type: "asc" }, { name: "asc" }]
    }),
    prisma.userItem.findMany({ where: { userId: user.id } }),
    prisma.userBooster.findMany({ where: { userId: user.id } })
  ]);
  const [supporterAccess, paymentCustomer, paymentOrders] = await Promise.all([
    monetizationService.getUserAccess(user.id),
    monetizationService.findPaymentCustomer(user.id, "STRIPE"),
    monetizationService.getUserOrders(user.id, 8)
  ]);
  const subscriptions = Object.values(MONETIZATION_PRODUCTS)
    .filter((product) => product.kind === "SUBSCRIPTION");
  const creditPacks = Object.values(MONETIZATION_PRODUCTS)
    .filter((product) => product.kind === "CREDIT_PACK");
  const discordStoreEnabled = discordMonetizationEnabled();
  const discordApplicationId = process.env.DISCORD_CLIENT_ID?.trim() ?? "";
  const stripeStatus = stripeModeLabel();
  const itemStock = new Map(ownedItems.map((row) => [row.itemId, row.quantity]));
  const boosterStock = new Map(ownedBoosters.map((row) => [row.boosterType, row.quantity]));
  const catalog = definitions.flatMap((definition) => {
    const metadata = asMetadata(definition.metadata);
    const rawPrice = Number(metadata.creditPrice);
    const price = Number.isSafeInteger(rawPrice) && rawPrice > 0 ? rawPrice : 0;
    const type = boosterType(definition.contentKey);
    const stock = definition.type === "BOOSTER"
      ? (type ? boosterStock.get(type) ?? 0 : 0)
      : itemStock.get(definition.id) ?? 0;
    const sellableOwned = stock > 0 && metadata.tradable === true && definition.type !== "SOUVENIR";
    if (price <= 0 && !sellableOwned) return [];
    return [{
      definition,
      metadata,
      price,
      stock,
      category: categoryLabel(definition.type, metadata)
    }];
  });
  const grouped = new Map<string, typeof catalog>();
  for (const entry of catalog) {
    grouped.set(entry.category, [...(grouped.get(entry.category) ?? []), entry]);
  }
  for (const entries of grouped.values()) {
    entries.sort((left, right) => {
      if (left.definition.type === "BOOSTER" && right.definition.type === "BOOSTER") {
        return boosterCatalogRank(left.definition.contentKey) -
          boosterCatalogRank(right.definition.contentKey);
      }
      return left.definition.name.localeCompare(right.definition.name, "fr");
    });
  }

  return (
    <div>
      <div className="flex items-end justify-between gap-4 mb-6 flex-wrap">
        <div>
          <h1 className="text-3xl font-black tracking-tight">
            {section === "premium" ? "Boutique €" : "Boutique en crédits"}
          </h1>
          <p className="text-rta-muted text-sm mt-1">
            {section === "premium"
              ? "VIP, Fondateur et packs de crédits payés en argent réel"
              : `${catalog.length} objets du jeu achetables avec tes crédits RTA`}
          </p>
        </div>
        <div className="bg-rta-surface border border-rta-border rounded-xl px-5 py-3 text-right">
          <div className="text-[0.65rem] uppercase tracking-widest text-rta-muted">
            {section === "premium" ? "Paiements" : "Ton solde"}
          </div>
          <div className="text-2xl font-black text-rta-gold">
            {section === "premium"
              ? `Stripe · ${stripeStatus}`
              : `⚡ ${user.credits.toLocaleString("fr-FR")} crédits`}
          </div>
        </div>
      </div>

      <nav className="mb-6 grid gap-3 sm:grid-cols-2" aria-label="Sections de la boutique">
        <Link
          href="/shop"
          className={[
            "rounded-xl border p-4 transition-colors",
            section === "credits"
              ? "border-rta-cta bg-rta-cta/10"
              : "border-rta-border bg-rta-surface hover:border-rta-cta/60"
          ].join(" ")}
        >
          <span className="block text-sm font-black text-rta-ink">🛒 Boutique crédits</span>
          <span className="mt-1 block text-xs text-rta-muted">
            Objets, offrandes et boosters avec les crédits gagnés en jeu.
          </span>
        </Link>
        <Link
          href="/shop?section=premium"
          className={[
            "rounded-xl border p-4 transition-colors",
            section === "premium"
              ? "border-rta-gold bg-rta-gold/10"
              : "border-rta-border bg-rta-surface hover:border-rta-gold/60"
          ].join(" ")}
        >
          <span className="block text-sm font-black text-rta-gold">💳 Boutique €</span>
          <span className="mt-1 block text-xs text-rta-muted">
            Abonnements de soutien et achats uniques payés en argent réel.
          </span>
        </Link>
      </nav>

      {searchParams.error && (
        <div className="mb-5 rounded-xl border border-red-500/60 bg-red-500/10 p-3 text-sm text-red-200">
          {searchParams.error}
        </div>
      )}
      {searchParams.success && (
        <div className="mb-5 rounded-xl border border-rta-success/60 bg-rta-success/10 p-3 text-sm text-rta-success">
          {searchParams.success}
        </div>
      )}
      {searchParams.payment === "success" && (
        <div className="mb-5 rounded-xl border border-rta-success/60 bg-rta-success/10 p-3 text-sm text-rta-success">
          Paiement confirmé par Stripe. Les crédits ou le statut sont attribués
          uniquement après validation du webhook signé; recharge la page dans
          quelques secondes si le solde n’est pas encore actualisé.
        </div>
      )}
      {searchParams.payment === "cancelled" && (
        <div className="mb-5 rounded-xl border border-rta-border bg-rta-surface p-3 text-sm text-rta-muted">
          Paiement annulé : rien n’a été débité et aucune récompense n’a été attribuée.
        </div>
      )}

      {section === "premium" && (
      <section id="support" className="mb-10 scroll-mt-28">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.18em] text-rta-cta">
              Soutenir Rocket Them All
            </p>
            <h2 className="mt-1 text-2xl font-black">VIP, Fondateur et crédits</h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-rta-muted">
              Aucun gemme ni monnaie premium : les packs ajoutent directement
              des crédits utilisables dans la boutique normale du jeu.
            </p>
          </div>
          <div className="rounded-xl border border-rta-border bg-rta-surface px-4 py-3 text-right">
            <div className="text-[0.65rem] font-bold uppercase tracking-widest text-rta-muted">
              Ton statut
            </div>
            <div className={supporterAccess.tier === "FREE" ? "font-black" : "font-black text-rta-gold"}>
              {supporterAccess.label}
            </div>
            {supporterAccess.activeUntil && (
              <div className="mt-1 text-xs text-rta-muted">
                Actif jusqu’au {supporterAccess.activeUntil.toLocaleDateString("fr-BE")}
              </div>
            )}
          </div>
        </div>

        {!paymentsEnabled() && !discordStoreEnabled && (
          <div className="mb-4 rounded-xl border border-rta-gold/50 bg-rta-gold/10 p-4 text-sm leading-6 text-rta-ink">
            Le catalogue est prêt, mais les paiements restent volontairement
            désactivés tant que Stripe, les produits Discord, la fiscalité et
            l’identité légale ne sont pas configurés.
          </div>
        )}

        <div className="grid gap-4 lg:grid-cols-2">
          {subscriptions.map((product) => {
            const productKey = product.key as MonetizationProductKey;
            const stripeReady = stripeProductReady(productKey);
            const skuId = discordStoreEnabled
              ? configuredDiscordSku(productKey)
              : null;
            const discordUrl = skuId && discordApplicationId
              ? `https://discord.com/application-directory/${discordApplicationId}/store/${skuId}`
              : null;
            const isFounder = product.tier === "FOUNDER";
            return (
              <article
                key={product.key}
                className={[
                  "rounded-2xl border p-5",
                  isFounder
                    ? "border-rta-gold bg-gradient-to-br from-rta-gold/15 to-rta-surface shadow-[0_0_20px_rgba(245,200,66,0.16)]"
                    : "border-rta-border bg-rta-surface"
                ].join(" ")}
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="text-xs font-black uppercase tracking-widest text-rta-cta">
                      Abonnement mensuel
                    </div>
                    <h3 className="mt-1 text-xl font-black">{product.name}</h3>
                  </div>
                  <div className="text-right">
                    <div className="text-2xl font-black text-rta-gold">
                      {formatEuro(product.priceCents)}
                    </div>
                    <div className="text-xs text-rta-muted">par mois</div>
                  </div>
                </div>
                <p className="mt-3 text-sm leading-6 text-rta-muted">
                  {product.description}
                </p>
                <ul className="mt-4 space-y-2 text-sm text-rta-ink">
                  {product.benefits.map((benefit) => (
                    <li key={benefit}>✓ {benefit}</li>
                  ))}
                </ul>
                <div className="mt-5 space-y-3">
                  <form action={createStripeCheckout} className="space-y-3">
                    <input type="hidden" name="productKey" value={product.key} />
                    <label className="flex items-start gap-2 text-xs leading-5 text-rta-muted">
                      <input
                        type="checkbox"
                        name="withdrawalWaiver"
                        value="accepted"
                        required
                        className="mt-1"
                      />
                      <span>
                        Je demande l’activation immédiate et reconnais perdre mon
                        droit de rétractation une fois le service pleinement exécuté.
                      </span>
                    </label>
                    <button
                      type="submit"
                      disabled={!stripeReady || supporterAccess.tier !== "FREE"}
                      className="w-full rounded-lg bg-rta-cta px-4 py-2.5 text-sm font-black text-rta-bg disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      {supporterAccess.tier !== "FREE"
                        ? "Abonnement déjà actif"
                        : stripeReady
                          ? `S’abonner avec Stripe · ${formatEuro(product.priceCents)}`
                          : "Stripe bientôt disponible"}
                    </button>
                  </form>
                  {discordUrl && supporterAccess.tier === "FREE" && (
                    <a
                      href={discordUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="block rounded-lg border border-[#5865F2] px-4 py-2.5 text-center text-sm font-black text-[#9da5ff] hover:bg-[#5865F2]/10"
                    >
                      Acheter dans Discord Premium
                    </a>
                  )}
                </div>
              </article>
            );
          })}
        </div>

        <div className="mt-8">
          <div className="mb-3 flex items-end justify-between gap-3">
            <div>
              <h3 className="text-xl font-black">Acheter des crédits</h3>
              <p className="mt-1 text-sm text-rta-muted">
                Achat unique, livré directement sur le compte Discord connecté.
              </p>
            </div>
            <span className="text-xs text-rta-muted">Stripe : {stripeStatus}</span>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {creditPacks.map((product) => {
              const productKey = product.key as MonetizationProductKey;
              const stripeReady = stripeProductReady(productKey);
              const skuId = discordStoreEnabled
                ? configuredDiscordSku(productKey)
                : null;
              const discordUrl = skuId && discordApplicationId
                ? `https://discord.com/application-directory/${discordApplicationId}/store/${skuId}`
                : null;
              return (
                <article
                  key={product.key}
                  className="rounded-xl border border-rta-border bg-rta-surface p-5"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h4 className="text-lg font-black">
                        {product.credits.toLocaleString("fr-FR")} crédits
                      </h4>
                      {product.bonusCredits > 0 && (
                        <span className="mt-1 inline-block rounded-full bg-rta-success/15 px-2 py-0.5 text-xs font-black text-rta-success">
                          +{product.bonusCredits.toLocaleString("fr-FR")} offerts
                        </span>
                      )}
                    </div>
                    <div className="text-xl font-black text-rta-gold">
                      {formatEuro(product.priceCents)}
                    </div>
                  </div>
                  <p className="mt-3 text-sm text-rta-muted">{product.description}</p>
                  <form action={createStripeCheckout} className="mt-4 space-y-3">
                    <input type="hidden" name="productKey" value={product.key} />
                    <label className="flex items-start gap-2 text-xs leading-5 text-rta-muted">
                      <input
                        type="checkbox"
                        name="withdrawalWaiver"
                        value="accepted"
                        required
                        className="mt-1"
                      />
                      <span>
                        Je demande la livraison immédiate et reconnais perdre mon
                        droit de rétractation après l’ajout des crédits.
                      </span>
                    </label>
                    <button
                      type="submit"
                      disabled={!stripeReady}
                      className="w-full rounded-lg bg-rta-success px-4 py-2.5 text-sm font-black text-rta-bg disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      {stripeReady ? "Acheter avec Stripe" : "Stripe bientôt disponible"}
                    </button>
                  </form>
                  {discordUrl && (
                    <a
                      href={discordUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-3 block rounded-lg border border-[#5865F2] px-4 py-2 text-center text-sm font-black text-[#9da5ff] hover:bg-[#5865F2]/10"
                    >
                      Acheter dans Discord
                    </a>
                  )}
                </article>
              );
            })}
          </div>
        </div>

        {paymentCustomer && (
          <form action={openStripeCustomerPortal} className="mt-5">
            <button
              type="submit"
              className="rounded-lg border border-rta-border bg-rta-surface px-4 py-2 text-sm font-bold text-rta-ink hover:border-rta-cta"
            >
              Gérer mon abonnement et mes factures Stripe
            </button>
          </form>
        )}

        {paymentOrders.length > 0 && (
          <details className="mt-5 rounded-xl border border-rta-border bg-rta-bg/50 p-4">
            <summary className="cursor-pointer text-sm font-black">
              Mes derniers paiements
            </summary>
            <ul className="mt-3 space-y-2 text-xs text-rta-muted">
              {paymentOrders.map((order) => (
                <li key={order.id} className="flex flex-wrap justify-between gap-2 border-t border-rta-border pt-2">
                  <span>{getMonetizationProduct(order.productKey).name}</span>
                  <span>{formatEuro(order.amountCents)}</span>
                  <span>{order.provider}</span>
                  <span>{order.status}</span>
                </li>
              ))}
            </ul>
          </details>
        )}
      </section>
      )}

      {section === "credits" && (
      <>
      <p className="text-sm text-rta-muted mb-7">
        Les boosters s’ouvrent depuis <code className="bg-rta-surface2 px-1.5 py-0.5 rounded text-rta-ink text-xs">/items</code>
        avec le bouton « Ouvrir un booster ». Basic propose 3 cartes et tu en gardes 1,
        Rare 4 et tu en gardes 2, Epic 5 et tu en gardes 3, Legendary 6 et tu en gardes 4.
        Deux cartes sont toujours rejetées.
        Les autres achats sont ajoutés directement à tes objets.
      </p>

      {catalog.length === 0 ? (
        <div className="bg-rta-surface border border-rta-border rounded-xl p-5 text-rta-muted">
          Aucun objet payant publié dans le catalogue.
        </div>
      ) : (
        <div className="space-y-9">
          {[...grouped.entries()].map(([category, entries]) => (
            <section key={category}>
              <div className="flex items-center gap-3 mb-3">
                <h2 className="text-xl font-black">{category}</h2>
                <span className="rounded-full border border-rta-border bg-rta-surface2 px-2 py-0.5 text-xs text-rta-muted">
                  {entries.length}
                </span>
              </div>
              <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))" }}>
                {entries.map(({ definition, metadata, price, stock }) => {
                  const stockFull = definition.type !== "BOOSTER" && stock >= definition.maxStack;
                  const canBuy = price > 0 && user.credits >= price && !stockFull;
                  const premium = definition.contentKey === "booster.legendary";
                  const technicalDescription = itemTechnicalDescription(definition);
                  const canSell =
                    stock > 0 &&
                    metadata.tradable === true &&
                    definition.type !== "SOUVENIR" &&
                    !(definition.type === "BOOSTER" && /^booster\.(basic|rare|epic|legendary)$/.test(definition.contentKey));
                  const resalePrice = itemResaleUnitPrice(definition.metadata);
                  return (
                    <article
                      key={definition.contentKey}
                      className={[
                        "bg-rta-surface border rounded-xl overflow-hidden transition-transform duration-200 hover:-translate-y-1",
                        premium ? "border-rta-gold shadow-[0_0_18px_rgba(245,200,66,0.3)]" : "border-rta-border"
                      ].join(" ")}
                    >
                      <div className="aspect-square bg-gradient-to-b from-rta-surface2 to-rta-bg relative">
                        {metadata.imageUrl ? (
                          <img
                            src={metadata.imageUrl}
                            alt={definition.name}
                            className="absolute inset-0 w-full h-full object-contain p-3"
                          />
                        ) : (
                          <div className="absolute inset-0 grid place-items-center text-5xl opacity-30">🎁</div>
                        )}
                        {metadata.rarity && (
                          <span className="absolute top-2 left-2 bg-rta-bg/85 border border-rta-border text-[0.62rem] font-bold px-2 py-1 rounded">
                            {metadata.rarity}
                          </span>
                        )}
                      </div>

                      <div className="p-4">
                        <h3 className="font-bold text-rta-ink min-h-12">{definition.name}</h3>
                        <p className="text-xs text-rta-muted mt-1 min-h-12">
                          {metadata.acquisitionSource || "Catalogue officiel RTA"}
                        </p>
                        <div className="mt-3 min-h-24 rounded-lg border border-rta-border bg-rta-bg/50 p-3">
                          <p className="text-[0.62rem] font-black uppercase tracking-widest text-rta-cta">
                            Effet technique
                          </p>
                          <p className="mt-1 text-xs leading-5 text-rta-ink">
                            {technicalDescription}
                          </p>
                        </div>
                        <div className="flex items-center justify-between gap-3 mt-4">
                          <span className={`text-lg font-black ${canBuy ? "text-rta-gold" : "text-rta-muted"}`}>
                            {price > 0 ? `⚡ ${price.toLocaleString("fr-FR")}` : "Butin uniquement"}
                          </span>
                          <form action={buyCatalogItem}>
                            <input type="hidden" name="contentKey" value={definition.contentKey} />
                            <input type="hidden" name="operationKey" value={`web-${randomUUID()}`} />
                            <button
                              type="submit"
                              disabled={!canBuy}
                              className={[
                                "px-4 py-1.5 rounded-lg text-sm font-bold transition-colors",
                                canBuy
                                  ? "bg-rta-cta text-rta-bg hover:bg-rta-cta/90"
                                  : "bg-rta-surface2 text-rta-muted cursor-not-allowed"
                              ].join(" ")}
                            >
                              {stockFull ? "Stock max" : canBuy ? "Acheter" : price <= 0 ? "Non achetable" : "Insuffisant"}
                            </button>
                          </form>
                        </div>
                        <p className="text-xs text-rta-muted mt-2">
                          En stock : {stock}{definition.type === "BOOSTER" ? "" : ` / ${definition.maxStack}`}
                        </p>
                        {canSell && (
                          <form action={sellCatalogItem} className="mt-2">
                            <input type="hidden" name="contentKey" value={definition.contentKey} />
                            <button
                              type="submit"
                              className="w-full rounded-lg border border-rta-gold/50 bg-rta-gold/10 px-3 py-1.5 text-xs font-bold text-rta-gold hover:bg-rta-gold/20"
                            >
                              Vendre 1 · +{resalePrice.toLocaleString("fr-FR")} crédits
                            </button>
                          </form>
                        )}
                      </div>
                    </article>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      )}
      </>
      )}
    </div>
  );
}
