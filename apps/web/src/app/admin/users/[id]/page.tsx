import Link from "next/link";
import { randomUUID } from "node:crypto";
import { prisma } from "@rta/database";
import { AdminEconomyService } from "@rta/services";
import { revalidatePath } from "next/cache";
import { notFound, redirect } from "next/navigation";
import DiscordAvatar from "../../../../components/discord-avatar";
import { requireAdmin } from "../../../../lib/guard";

const economy = new AdminEconomyService();
const VARIANTS = new Set(["normal", "shiny", "holo"]);

function positiveInteger(value: FormDataEntryValue | null, fallback = 1) {
  const parsed = Math.trunc(Number(value ?? fallback));
  return Number.isSafeInteger(parsed) ? Math.max(1, Math.min(parsed, 1_000_000)) : fallback;
}

function nonNegativeInteger(value: FormDataEntryValue | null) {
  const parsed = Math.trunc(Number(value ?? 0));
  return Number.isSafeInteger(parsed) ? Math.max(0, Math.min(parsed, 1_000_000)) : 0;
}

export default async function AdminUserDetailPage({
  params: paramsPromise,
  searchParams: searchParamsPromise
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ notice?: string; error?: string }>;
}) {
  const { id } = await paramsPromise;
  const searchParams = await searchParamsPromise;
  await requireAdmin();

  async function adjustBalance(formData: FormData) {
    "use server";
    const admin = await requireAdmin();
    let errorMessage = "";
    try {
      await economy.adjustBalance({
        adminId: admin.id,
        userId: id,
        creditDelta: Math.trunc(Number(formData.get("creditDelta") ?? 0)),
        fragmentDelta: Math.trunc(Number(formData.get("fragmentDelta") ?? 0)),
        reason: String(formData.get("reason") ?? ""),
        operationKey: `admin:${admin.id}:balance:${randomUUID()}`
      });
    } catch (error) {
      errorMessage = error instanceof Error ? error.message : "Ajustement impossible";
    }
    if (errorMessage) redirect(`/admin/users/${id}?error=${encodeURIComponent(errorMessage)}`);
    revalidatePath(`/admin/users/${id}`);
    redirect(`/admin/users/${id}?notice=Solde mis à jour`);
  }

  async function grantXp(formData: FormData) {
    "use server";
    const admin = await requireAdmin();
    let errorMessage = "";
    try {
      await economy.grantXp({
        adminId: admin.id,
        userId: id,
        xp: positiveInteger(formData.get("xp"), 100),
        reason: String(formData.get("reason") ?? ""),
        operationKey: `admin:${admin.id}:xp:${randomUUID()}`
      });
    } catch (error) {
      errorMessage = error instanceof Error ? error.message : "Don d’XP impossible";
    }
    if (errorMessage) redirect(`/admin/users/${id}?error=${encodeURIComponent(errorMessage)}`);
    revalidatePath(`/admin/users/${id}`);
    redirect(`/admin/users/${id}?notice=XP attribuée`);
  }

  async function grantItem(formData: FormData) {
    "use server";
    const admin = await requireAdmin();
    let errorMessage = "";
    try {
      await economy.grantItem({
        adminId: admin.id,
        userId: id,
        itemKey: String(formData.get("itemKey") ?? ""),
        quantity: positiveInteger(formData.get("quantity")),
        reason: String(formData.get("reason") ?? ""),
        operationKey: `admin:${admin.id}:item:${randomUUID()}`
      });
    } catch (error) {
      errorMessage = error instanceof Error ? error.message : "Don d’objet impossible";
    }
    if (errorMessage) redirect(`/admin/users/${id}?error=${encodeURIComponent(errorMessage)}`);
    revalidatePath(`/admin/users/${id}`);
    redirect(`/admin/users/${id}?notice=Objet attribué`);
  }

  async function giveCard(formData: FormData) {
    "use server";
    const admin = await requireAdmin();
    const cardId = String(formData.get("cardId") ?? "");
    const variant = String(formData.get("variant") ?? "normal");
    const quantity = positiveInteger(formData.get("quantity"));
    if (!VARIANTS.has(variant)) redirect(`/admin/users/${id}?error=Variante invalide`);
    const card = await prisma.card.findFirst({ where: { id: cardId, status: "PUBLISHED", isActive: true } });
    if (!card) redirect(`/admin/users/${id}?error=Carte introuvable`);
    await prisma.$transaction(async (tx) => {
      await tx.inventoryItem.upsert({
        where: { userId_cardId_variant: { userId: id, cardId: card.id, variant: variant as "normal" | "shiny" | "holo" } },
        update: { quantity: { increment: quantity }, version: { increment: 1 } },
        create: { userId: id, cardId: card.id, variant: variant as "normal" | "shiny" | "holo", quantity }
      });
      await tx.adminLog.create({
        data: { adminId: admin.id, action: "CARD_GIVEN", target: id, metadata: { cardId, cardName: card.name, variant, quantity } }
      });
    });
    revalidatePath(`/admin/users/${id}`);
    redirect(`/admin/users/${id}?notice=Carte attribuée`);
  }

  async function setBoosters(formData: FormData) {
    "use server";
    const admin = await requireAdmin();
    const quantities = {
      basic: nonNegativeInteger(formData.get("basic")),
      rare: nonNegativeInteger(formData.get("rare")),
      epic: nonNegativeInteger(formData.get("epic")),
      legendary: nonNegativeInteger(formData.get("legendary"))
    };
    await prisma.$transaction(async (tx) => {
      for (const [boosterType, quantity] of Object.entries(quantities)) {
        await tx.userBooster.upsert({
          where: { userId_boosterType: { userId: id, boosterType: boosterType as "basic" | "rare" | "epic" | "legendary" } },
          update: { quantity },
          create: { userId: id, boosterType: boosterType as "basic" | "rare" | "epic" | "legendary", quantity }
        });
      }
      await tx.adminLog.create({ data: { adminId: admin.id, action: "BOOSTER_QUANTITY_UPDATED", target: id, metadata: quantities } });
    });
    revalidatePath(`/admin/users/${id}`);
    redirect(`/admin/users/${id}?notice=Boosters mis à jour`);
  }

  const [user, catalog, cards] = await Promise.all([
    prisma.user.findUnique({
      where: { id },
      include: {
        progress: true,
        userBoosters: true,
        fragmentBalances: { include: { rarity: true }, orderBy: { rarity: { weight: "asc" } } },
        items: { where: { quantity: { gt: 0 } }, include: { item: true }, orderBy: { quantity: "desc" } },
        equippedArtifacts: { include: { item: true }, orderBy: { slot: "asc" } },
        inventory: {
          where: { quantity: { gt: 0 } },
          include: { card: { include: { rarity: true, deck: true } } },
          orderBy: [{ card: { deck: { name: "asc" } } }, { card: { rarity: { weight: "desc" } } }]
        },
        _count: { select: { captureLogs: true, achievements: true, dailyQuests: true } }
      }
    }),
    prisma.itemDefinition.findMany({ where: { status: "PUBLISHED" }, orderBy: [{ type: "asc" }, { name: "asc" }] }),
    prisma.card.findMany({
      where: { status: "PUBLISHED", isActive: true },
      include: { deck: true, rarity: true },
      orderBy: [{ deck: { name: "asc" } }, { name: "asc" }]
    })
  ]);
  if (!user) notFound();
  const boosters = new Map(user.userBoosters.map((row) => [row.boosterType, row.quantity]));
  const totalCards = user.inventory.reduce((sum, row) => sum + row.quantity, 0);
  const control = "min-w-0 w-full rounded-lg border border-rta-border bg-rta-bg px-3 py-2 text-sm text-rta-ink placeholder:text-rta-muted focus:border-rta-cta focus:outline-none focus:ring-1 focus:ring-rta-cta";
  const submit = "rounded-lg bg-rta-cta px-4 py-2 text-sm font-black text-rta-bg hover:brightness-110";

  return (
    <section className="space-y-5">
      <Link href="/admin/users" className="text-sm text-rta-muted hover:text-rta-ink">← Retour aux joueurs</Link>
      <header className="flex flex-wrap items-center gap-4 rounded-2xl border border-rta-border bg-rta-surface p-5">
        <div className="h-20 w-20 overflow-hidden rounded-full border-2 border-rta-accentHi"><DiscordAvatar avatarUrl={user.avatarUrl} discordId={user.discordId} username={user.username} size={80} /></div>
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-black">{user.username}</h1>
          <p className="text-xs text-rta-muted">Discord {user.discordId} · ID interne {user.id}</p>
          <p className="mt-1 text-sm">Niveau {user.level} · {user.xp} XP · {user.explorationCharges} charge(s){user.unlimitedExplorations ? " · explorations illimitées" : ""}</p>
        </div>
        <div className="grid grid-cols-2 gap-2 text-center sm:grid-cols-4">
          <div className="rounded-lg bg-rta-bg px-3 py-2"><b className="block text-rta-cta">{user.credits.toLocaleString("fr-FR")}</b><small>crédits</small></div>
          <div className="rounded-lg bg-rta-bg px-3 py-2"><b className="block">{user.fragments.toLocaleString("fr-FR")}</b><small>fragments</small></div>
          <div className="rounded-lg bg-rta-bg px-3 py-2"><b className="block">{totalCards}</b><small>cartes</small></div>
          <div className="rounded-lg bg-rta-bg px-3 py-2"><b className="block">{user._count.captureLogs}</b><small>captures</small></div>
        </div>
      </header>

      {searchParams.notice && <p className="rounded-xl border border-green-500/50 bg-green-500/10 p-3 text-green-300">{searchParams.notice}</p>}
      {searchParams.error && <p className="rounded-xl border border-red-500/50 bg-red-500/10 p-3 text-red-300">{searchParams.error}</p>}

      <div className="grid gap-5 xl:grid-cols-2">
        <article className="rounded-2xl border border-rta-border bg-rta-surface p-5">
          <h2 className="mb-3 text-lg font-black">Économie & progression</h2>
          <form action={adjustBalance} className="grid gap-2 sm:grid-cols-2">
            <input className={control} type="number" name="creditDelta" defaultValue="0" placeholder="± crédits" />
            <input className={control} type="number" name="fragmentDelta" defaultValue="0" placeholder="± fragments" />
            <input className={`${control} sm:col-span-2`} name="reason" required minLength={3} placeholder="Motif obligatoire et audité" />
            <button className={`${submit} sm:col-span-2`}>Appliquer les soldes</button>
          </form>
          <form action={grantXp} className="mt-4 grid gap-2 sm:grid-cols-[130px_1fr_auto]">
            <input className={control} type="number" min="1" name="xp" defaultValue="100" />
            <input className={control} name="reason" required minLength={3} placeholder="Motif du gain d’XP" />
            <button className={submit}>Donner l’XP</button>
          </form>
        </article>

        <article className="rounded-2xl border border-rta-border bg-rta-surface p-5">
          <h2 className="mb-3 text-lg font-black">Boosters</h2>
          <form action={setBoosters} className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {(["basic", "rare", "epic", "legendary"] as const).map((type) => <label key={type} className="text-xs text-rta-muted">{type}<input className={`${control} mt-1 w-full`} type="number" min="0" name={type} defaultValue={boosters.get(type) ?? 0} /></label>)}
            <button className={`${submit} col-span-2 sm:col-span-4`}>Mettre à jour le stock</button>
          </form>
          <div className="mt-4 flex flex-wrap gap-2 text-xs">
            {user.fragmentBalances.map((row) => <span key={row.id} className="rounded-full bg-rta-bg px-2 py-1">{row.rarity.name}: <b>{row.quantity}</b></span>)}
          </div>
        </article>
      </div>

      <article id="give-card" className="rounded-2xl border border-rta-border bg-rta-surface p-5">
        <h2 className="mb-3 text-lg font-black">Ajouter une carte ou un objet</h2>
        <div className="grid min-w-0 gap-4 2xl:grid-cols-2">
          <form action={giveCard} className="min-w-0 rounded-xl border border-rta-border bg-rta-bg/35 p-4">
            <h3 className="mb-3 text-sm font-black text-rta-cta">🎴 Donner une carte</h3>
            <div className="grid min-w-0 gap-3 sm:grid-cols-[minmax(0,1fr)_120px_90px]">
              <label className="min-w-0 text-xs font-bold text-rta-muted">
                Carte
                <select className={`${control} mt-1`} name="cardId" required>{cards.map((card) => <option key={card.id} value={card.id}>{card.deck.name} · {card.name} · {card.rarity.name}</option>)}</select>
              </label>
              <label className="text-xs font-bold text-rta-muted">
                Variante
                <select className={`${control} mt-1`} name="variant"><option value="normal">Normal</option><option value="shiny">Shiny</option><option value="holo">Holo</option></select>
              </label>
              <label className="text-xs font-bold text-rta-muted">
                Quantité
                <input className={`${control} mt-1`} type="number" name="quantity" min="1" defaultValue="1" />
              </label>
            </div>
            <button className={`${submit} mt-3 w-full`}>+ Donner la carte</button>
          </form>
          <form action={grantItem} className="min-w-0 rounded-xl border border-rta-border bg-rta-bg/35 p-4">
            <h3 className="mb-3 text-sm font-black text-rta-cta">🎁 Donner un objet</h3>
            <div className="grid min-w-0 gap-3 sm:grid-cols-[minmax(0,1fr)_90px]">
              <label className="min-w-0 text-xs font-bold text-rta-muted">
                Objet
                <select className={`${control} mt-1`} name="itemKey" required>{catalog.map((item) => <option key={item.id} value={item.contentKey}>{item.name} · {item.type}</option>)}</select>
              </label>
              <label className="text-xs font-bold text-rta-muted">
                Quantité
                <input className={`${control} mt-1`} type="number" name="quantity" min="1" defaultValue="1" />
              </label>
              <label className="min-w-0 text-xs font-bold text-rta-muted sm:col-span-2">
                Motif du don
                <input className={`${control} mt-1`} name="reason" required minLength={3} placeholder="Motif obligatoire et audité" />
              </label>
            </div>
            <button className={`${submit} mt-3 w-full`}>+ Donner l’objet</button>
          </form>
        </div>
      </article>

      <div className="grid gap-5 xl:grid-cols-2">
        <article className="rounded-2xl border border-rta-border bg-rta-surface p-5">
          <h2 className="mb-3 text-lg font-black">Objets spéciaux ({user.items.length})</h2>
          <div className="max-h-[420px] space-y-2 overflow-y-auto pr-1">
            {user.items.map((row) => <div key={row.id} className="flex justify-between rounded-lg bg-rta-bg p-3"><span><b>{row.item.name}</b><small className="block text-rta-muted">{row.item.type} · {row.item.contentKey}</small></span><b>×{row.quantity}</b></div>)}
            {user.items.length === 0 && <p className="text-sm text-rta-muted">Aucun objet spécial.</p>}
          </div>
          <p className="mt-3 text-xs text-rta-muted">Équipé : {user.equippedArtifacts.map((row) => `slot ${row.slot} · ${row.item.name}`).join(" | ") || "rien"}</p>
        </article>
        <article className="rounded-2xl border border-rta-border bg-rta-surface p-5">
          <h2 className="mb-3 text-lg font-black">Collection ({totalCards} cartes)</h2>
          <div className="max-h-[420px] space-y-2 overflow-y-auto pr-1">
            {user.inventory.map((row) => <div key={row.id} className="flex justify-between rounded-lg bg-rta-bg p-3"><span><b>{row.card.name}</b><small className="block text-rta-muted">{row.card.deck.name} · {row.card.rarity.name} · {row.variant}</small></span><b>×{row.quantity}</b></div>)}
          </div>
        </article>
      </div>
    </section>
  );
}
