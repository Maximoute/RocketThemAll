import { getServerSession } from "next-auth";
import { authOptions } from "../../../lib/auth";
import { prisma } from "@rta/database";
import type { Prisma } from "@prisma/client";
import { notFound, redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { RARITIES } from "@rta/shared";
import InventoryFiltersClient from "../../inventory/filters.client";
import { requireAdmin } from "../../../lib/guard";
import { sendBotDirectMessage } from "../../../lib/discord-bot";

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
  sort?: string;
  order?: "asc" | "desc";
  page?: string;
  notice?: string;
};

function xpForNextLevel(level: number) {
  return Math.floor(100 * Math.pow(level, 1.5));
}

function categoryLabel(cat: string | null) {
  return POP_CATEGORIES.find((entry) => entry.value === cat)?.label ?? (cat ?? "-");
}

function buildNotice(searchParams: SearchParams) {
  if (searchParams.notice === "trade-dm-sent") {
    return "Demande de trade envoyée en MP Discord par le bot.";
  }
  if (searchParams.notice === "trade-dm-failed") {
    return "Impossible d'envoyer le MP Discord. L'utilisateur bloque peut-être les DMs du bot.";
  }
  if (searchParams.notice === "profile-deleted") {
    return "Profil supprimé.";
  }
  return null;
}

export default async function PublicProfilePage({
  params,
  searchParams
}: {
  params: { discordId: string };
  searchParams: SearchParams;
}) {
  const session = await getServerSession(authOptions);
  const viewer = session?.user?.id
    ? await prisma.user.findUnique({ where: { discordId: session.user.id } })
    : null;
  const isAdmin = Boolean(viewer?.isAdmin);

  const user = await prisma.user.findUnique({ where: { discordId: params.discordId } });
  if (!user) {
    notFound();
  }
  const profileUser = user;

  async function sendTradeRequestDm() {
    "use server";
    const dmSession = await getServerSession(authOptions);
    if (!dmSession?.user?.id) {
      redirect("/login");
    }

    const sender = await prisma.user.findUnique({ where: { discordId: dmSession.user.id } });
    const target = await prisma.user.findUnique({ where: { discordId: params.discordId } });
    if (!sender || !target || sender.discordId === target.discordId) {
      redirect(`/profiles/${params.discordId}?notice=trade-dm-failed`);
    }

    const result = await sendBotDirectMessage(
      target.discordId,
      `🤝 ${sender.username} souhaite trade avec toi sur RocketThemAll. Profil: ${(process.env.NEXTAUTH_URL ?? "").replace(/\/$/, "")}/profiles/${sender.discordId}\nUtilise /trade user sur Discord si tu veux ouvrir un trade.`
    );

    redirect(`/profiles/${params.discordId}?notice=${result.ok ? "trade-dm-sent" : "trade-dm-failed"}`);
  }

  async function updateEconomy(formData: FormData) {
    "use server";
    const admin = await requireAdmin();
    const credits = Math.max(0, Number(formData.get("credits") ?? 0));
    const fragments = Math.max(0, Number(formData.get("fragments") ?? 0));

    await prisma.user.update({ where: { id: profileUser.id }, data: { credits, fragments } });
    await prisma.adminLog.create({
      data: {
        adminId: admin.id,
        action: "PROFILE_ECONOMY_UPDATED",
        target: profileUser.id,
        metadata: { credits, fragments }
      }
    });

    revalidatePath(`/profiles/${params.discordId}`);
    revalidatePath("/admin/users");
  }

  async function updateLevel(formData: FormData) {
    "use server";
    const admin = await requireAdmin();
    const level = Math.max(1, Number(formData.get("level") ?? 1));
    const xp = Math.max(0, Number(formData.get("xp") ?? 0));

    await prisma.user.update({ where: { id: profileUser.id }, data: { level, xp } });
    await prisma.adminLog.create({
      data: {
        adminId: admin.id,
        action: "PROFILE_LEVEL_UPDATED",
        target: profileUser.id,
        metadata: { level, xp }
      }
    });

    revalidatePath(`/profiles/${params.discordId}`);
    revalidatePath("/admin/users");
  }

  async function setBooster(formData: FormData) {
    "use server";
    const admin = await requireAdmin();
    const basicQuantity = Math.max(0, Number(formData.get("basicQuantity") ?? 0));
    const rareQuantity = Math.max(0, Number(formData.get("rareQuantity") ?? 0));
    const epicQuantity = Math.max(0, Number(formData.get("epicQuantity") ?? 0));
    const legendaryQuantity = Math.max(0, Number(formData.get("legendaryQuantity") ?? 0));

    await prisma.$transaction(async (tx) => {
      await tx.userBooster.upsert({ where: { userId_boosterType: { userId: profileUser.id, boosterType: "basic" } }, update: { quantity: basicQuantity }, create: { userId: profileUser.id, boosterType: "basic", quantity: basicQuantity } });
      await tx.userBooster.upsert({ where: { userId_boosterType: { userId: profileUser.id, boosterType: "rare" } }, update: { quantity: rareQuantity }, create: { userId: profileUser.id, boosterType: "rare", quantity: rareQuantity } });
      await tx.userBooster.upsert({ where: { userId_boosterType: { userId: profileUser.id, boosterType: "epic" } }, update: { quantity: epicQuantity }, create: { userId: profileUser.id, boosterType: "epic", quantity: epicQuantity } });
      await tx.userBooster.upsert({ where: { userId_boosterType: { userId: profileUser.id, boosterType: "legendary" } }, update: { quantity: legendaryQuantity }, create: { userId: profileUser.id, boosterType: "legendary", quantity: legendaryQuantity } });
      await tx.booster.upsert({ where: { userId: profileUser.id }, update: { basicQuantity: 0, rareQuantity: 0, epicQuantity: 0, quantity: 0 }, create: { userId: profileUser.id, basicQuantity: 0, rareQuantity: 0, epicQuantity: 0, quantity: 0 } });
    });

    await prisma.adminLog.create({
      data: {
        adminId: admin.id,
        action: "PROFILE_BOOSTERS_UPDATED",
        target: profileUser.id,
        metadata: { basicQuantity, rareQuantity, epicQuantity, legendaryQuantity }
      }
    });

    revalidatePath(`/profiles/${params.discordId}`);
  }

  async function giveCard(formData: FormData) {
    "use server";
    const admin = await requireAdmin();
    const cardName = String(formData.get("cardName") ?? "").trim();
    const variant = String(formData.get("variant") ?? "normal") as "normal" | "shiny" | "holo";
    const quantity = Math.max(1, Number(formData.get("quantity") ?? 1));

    const card = await prisma.card.findFirst({ where: { name: { contains: cardName, mode: "insensitive" } } });
    if (!card) {
      revalidatePath(`/profiles/${params.discordId}`);
      return;
    }

    await prisma.inventoryItem.upsert({
      where: { userId_cardId_variant: { userId: profileUser.id, cardId: card.id, variant } },
      update: { quantity: { increment: quantity } },
      create: { userId: profileUser.id, cardId: card.id, variant, quantity }
    });

    await prisma.adminLog.create({
      data: {
        adminId: admin.id,
        action: "PROFILE_CARD_GIVEN",
        target: profileUser.id,
        metadata: { cardId: card.id, cardName: card.name, variant, quantity }
      }
    });

    revalidatePath(`/profiles/${params.discordId}`);
  }

  async function removeInventoryItem(formData: FormData) {
    "use server";
    const admin = await requireAdmin();
    const itemId = String(formData.get("itemId") ?? "");
    const quantity = Math.max(1, Number(formData.get("quantity") ?? 1));

    const item = await prisma.inventoryItem.findUnique({ where: { id: itemId }, include: { card: true } });
    if (!item || item.userId !== profileUser.id) {
      revalidatePath(`/profiles/${params.discordId}`);
      return;
    }

    if (item.quantity <= quantity) {
      await prisma.inventoryItem.delete({ where: { id: item.id } });
    } else {
      await prisma.inventoryItem.update({ where: { id: item.id }, data: { quantity: { decrement: quantity } } });
    }

    await prisma.adminLog.create({
      data: {
        adminId: admin.id,
        action: "PROFILE_CARD_REMOVED",
        target: profileUser.id,
        metadata: { itemId: item.id, cardId: item.cardId, cardName: item.card.name, quantity, variant: item.variant }
      }
    });

    revalidatePath(`/profiles/${params.discordId}`);
  }

  async function clearAvatar() {
    "use server";
    const admin = await requireAdmin();
    await prisma.user.update({ where: { id: profileUser.id }, data: { avatarUrl: null } });
    await prisma.adminLog.create({
      data: {
        adminId: admin.id,
        action: "PROFILE_AVATAR_REMOVED",
        target: profileUser.id
      }
    });
    revalidatePath(`/profiles/${params.discordId}`);
  }

  async function deleteProfile() {
    "use server";
    const admin = await requireAdmin();

    await prisma.$transaction(async (tx) => {
      await tx.tradeItem.deleteMany({ where: { userId: profileUser.id } });
      await tx.trade.deleteMany({ where: { OR: [{ user1Id: profileUser.id }, { user2Id: profileUser.id }] } });
      await tx.inventoryItem.deleteMany({ where: { userId: profileUser.id } });
      await tx.fragmentBalance.deleteMany({ where: { userId: profileUser.id } });
      await tx.userBooster.deleteMany({ where: { userId: profileUser.id } });
      await tx.booster.deleteMany({ where: { userId: profileUser.id } });
      await tx.captureLog.deleteMany({ where: { userId: profileUser.id } });
      await tx.spawnChargeLog.deleteMany({ where: { userId: profileUser.id } });
      await tx.transactionLog.deleteMany({ where: { userId: profileUser.id } });
      await tx.economyLog.deleteMany({ where: { userId: profileUser.id } });
      await tx.collectionRewardClaim.deleteMany({ where: { userId: profileUser.id } });
      await tx.guildActivityLog.deleteMany({ where: { OR: [{ userId: profileUser.id }, { discordUserId: profileUser.discordId }] } });
      await tx.adminLog.deleteMany({ where: { adminId: profileUser.id } });
      await tx.spawnLog.updateMany({ where: { userId: profileUser.id }, data: { userId: null } });
      await tx.spawnLog.updateMany({ where: { capturedById: profileUser.id }, data: { capturedById: null } });
      await tx.user.delete({ where: { id: profileUser.id } });
      await tx.adminLog.create({
        data: {
          adminId: admin.id,
          action: "PROFILE_DELETED",
          target: profileUser.id,
          metadata: { discordId: profileUser.discordId, username: profileUser.username }
        }
      });
    });

    redirect("/admin/users?notice=profile-deleted");
  }

  const sort = searchParams.sort ?? "name";
  const order = searchParams.order ?? "asc";
  const pageRaw = Number(searchParams.page ?? "1");
  const page = Number.isFinite(pageRaw) ? Math.max(1, Math.floor(pageRaw)) : 1;
  const pageSize = 60;
  const xpNeeded = xpForNextLevel(profileUser.level);
  const xpProgress = Math.max(0, Math.min(100, xpNeeded > 0 ? (profileUser.xp / xpNeeded) * 100 : 0));
  const boosters = await prisma.userBooster.findMany({ where: { userId: profileUser.id } });
  const boosterMap = new Map(boosters.map((entry) => [entry.boosterType, entry.quantity]));
  const deckRows = await prisma.deck.findMany({ orderBy: { name: "asc" }, select: { name: true } });
  const inventoryWhere: Prisma.InventoryItemWhereInput = {
    userId: profileUser.id,
    card: {
      name: searchParams.q ? { contains: searchParams.q, mode: "insensitive" } : undefined,
      deck: searchParams.deck ? { name: searchParams.deck } : undefined,
      rarity: searchParams.rarity ? { name: searchParams.rarity } : undefined,
      category: searchParams.category ? searchParams.category : undefined
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

  const [totalItems, items, personalLogs] = await Promise.all([
    prisma.inventoryItem.count({ where: inventoryWhere }),
    prisma.inventoryItem.findMany({
      where: inventoryWhere,
      include: { card: { include: { deck: true, rarity: true } } },
      orderBy,
      skip: (page - 1) * pageSize,
      take: pageSize
    }),
    prisma.guildActivityLog.findMany({
      where: { OR: [{ userId: profileUser.id }, { discordUserId: profileUser.discordId }] },
      orderBy: { createdAt: "desc" },
      take: 80
    })
  ]);

  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const safePage = Math.min(page, totalPages);
  const notice = buildNotice(searchParams);
  const viewerIsOwner = viewer?.id === profileUser.id;

  function buildPageHref(targetPage: number) {
    const paramsObj = new URLSearchParams();
    if (searchParams.q) paramsObj.set("q", searchParams.q);
    if (searchParams.deck) paramsObj.set("deck", searchParams.deck);
    if (searchParams.rarity) paramsObj.set("rarity", searchParams.rarity);
    if (searchParams.category) paramsObj.set("category", searchParams.category);
    if (sort) paramsObj.set("sort", sort);
    if (order) paramsObj.set("order", order);
    paramsObj.set("page", String(targetPage));
    return `/profiles/${profileUser.discordId}?${paramsObj.toString()}`;
  }

  return (
    <section className="card">
      <a href="/profile" style={{ display: "inline-block", marginBottom: "1rem", textDecoration: "none", color: "var(--accent)" }}>
        ← Retour à mon espace
      </a>

      {notice ? (
        <article className="card" style={{ background: "#fff8e8", border: "1px solid #f5d9a6", marginBottom: "1rem" }}>
          {notice}
        </article>
      ) : null}

      <div style={{ display: "grid", gridTemplateColumns: "minmax(220px, 280px) 1fr", gap: "1.5rem", alignItems: "start" }}>
        <aside className="card" style={{ margin: 0 }}>
          {profileUser.avatarUrl ? (
            <img src={profileUser.avatarUrl} alt={profileUser.username} style={{ width: "100%", maxWidth: "220px", aspectRatio: "1 / 1", objectFit: "cover", borderRadius: "18px", marginBottom: "1rem" }} />
          ) : (
            <div style={{ width: "220px", height: "220px", borderRadius: "18px", background: "linear-gradient(135deg, #f59e0b, #f97316)", color: "white", display: "grid", placeItems: "center", fontSize: "4rem", fontWeight: 800, marginBottom: "1rem" }}>
              {profileUser.username.slice(0, 2).toUpperCase()}
            </div>
          )}

          <h1 style={{ marginTop: 0, marginBottom: "0.25rem" }}>{profileUser.username}</h1>
          <p style={{ color: "var(--muted)", marginTop: 0 }}>Profil public RocketThemAll</p>
          <p>Crédits: {profileUser.credits}</p>
          <p>Niveau: {profileUser.level}</p>
          <div style={{ marginBottom: "0.75rem" }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.9rem", marginBottom: "0.3rem" }}>
              <span>XP</span>
              <span>{profileUser.xp} / {xpNeeded}</span>
            </div>
            <div style={{ height: "10px", background: "#ece7df", borderRadius: "999px", overflow: "hidden" }}>
              <div style={{ width: `${xpProgress}%`, height: "100%", background: "linear-gradient(90deg, #22c55e, #14b8a6)" }} />
            </div>
          </div>
          <p>Boosters: basic {boosterMap.get("basic") ?? 0} | rare {boosterMap.get("rare") ?? 0} | epic {boosterMap.get("epic") ?? 0} | legendary {boosterMap.get("legendary") ?? 0}</p>
          <p style={{ fontSize: "0.9rem", color: "var(--muted)" }}>Discord ID: {profileUser.discordId}</p>

          {!viewer || viewerIsOwner ? null : (
            <div style={{ display: "grid", gap: "0.6rem", marginTop: "1rem" }}>
              <form action={sendTradeRequestDm}>
                <button type="submit">Envoyer une demande de trade en MP Discord</button>
              </form>
              <a href={`discord://-/users/${profileUser.discordId}`} style={{ textDecoration: "none" }}>
                <button type="button">Ouvrir sur Discord (si supporté)</button>
              </a>
              <p style={{ fontSize: "0.8rem", color: "var(--muted)", margin: 0 }}>
                Discord ne permet pas d'envoyer automatiquement une demande d'ami via son API. Utilise l'ID Discord ou le lien ci-dessus si ton client le supporte.
              </p>
            </div>
          )}

          {isAdmin ? (
            <article className="card" style={{ marginTop: "1rem", marginBottom: 0 }}>
              <h2 style={{ marginTop: 0 }}>Outils admin</h2>
              <p style={{ fontSize: "0.85rem", color: "var(--muted)" }}>Accès spécial profil admin.</p>
              <form action={updateEconomy} style={{ display: "grid", gap: "0.4rem", marginBottom: "0.75rem" }}>
                <strong>Économie</strong>
                <input type="number" name="credits" min={0} defaultValue={profileUser.credits} />
                <input type="number" name="fragments" min={0} defaultValue={profileUser.fragments} />
                <button type="submit">Mettre à jour crédits / fragments</button>
              </form>
              <form action={updateLevel} style={{ display: "grid", gap: "0.4rem", marginBottom: "0.75rem" }}>
                <strong>Niveau</strong>
                <input type="number" name="level" min={1} defaultValue={profileUser.level} />
                <input type="number" name="xp" min={0} defaultValue={profileUser.xp} />
                <button type="submit">Mettre à jour niveau / XP</button>
              </form>
              <form action={setBooster} style={{ display: "grid", gap: "0.4rem", marginBottom: "0.75rem" }}>
                <strong>Boosters</strong>
                <input type="number" name="basicQuantity" min={0} defaultValue={boosterMap.get("basic") ?? 0} />
                <input type="number" name="rareQuantity" min={0} defaultValue={boosterMap.get("rare") ?? 0} />
                <input type="number" name="epicQuantity" min={0} defaultValue={boosterMap.get("epic") ?? 0} />
                <input type="number" name="legendaryQuantity" min={0} defaultValue={boosterMap.get("legendary") ?? 0} />
                <button type="submit">Mettre à jour boosters</button>
              </form>
              <form action={giveCard} style={{ display: "grid", gap: "0.4rem", marginBottom: "0.75rem" }}>
                <strong>Donner une carte</strong>
                <input type="text" name="cardName" placeholder="Nom de carte" required />
                <select name="variant" defaultValue="normal">
                  <option value="normal">Normal</option>
                  <option value="shiny">Shiny</option>
                  <option value="holo">Holo</option>
                </select>
                <input type="number" name="quantity" min={1} defaultValue={1} />
                <button type="submit">Donner la carte</button>
              </form>
              <form action={clearAvatar} style={{ marginBottom: "0.5rem" }}>
                <button type="submit">Supprimer la photo de profil</button>
              </form>
              <form action={deleteProfile}>
                <button type="submit" style={{ background: "#b91c1c", color: "white" }}>Supprimer le profil</button>
              </form>
            </article>
          ) : null}
        </aside>

        <div>
          <article className="card" style={{ marginBottom: "1rem" }}>
            <h2 style={{ marginTop: 0 }}>Inventaire</h2>
            <InventoryFiltersClient
              decks={deckRows.map((entry) => ({ value: entry.name, label: entry.name }))}
              rarities={RARITIES.map((entry) => ({ value: entry, label: entry }))}
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

            <p style={{ color: "var(--muted)" }}>Page {safePage} / {totalPages} - {totalItems} cartes.</p>
            <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap", marginBottom: "1rem" }}>
              {safePage > 1 ? <a href={buildPageHref(safePage - 1)}>← Page précédente</a> : <span style={{ color: "var(--muted)" }}>← Page précédente</span>}
              {safePage < totalPages ? <a href={buildPageHref(safePage + 1)}>Page suivante →</a> : <span style={{ color: "var(--muted)" }}>Page suivante →</span>}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(190px, 1fr))", gap: "1rem" }}>
              {items.length === 0 ? <p>Aucune carte trouvée.</p> : items.map((item) => (
                <article key={item.id} style={{ background: "var(--card)", borderRadius: "10px", padding: "0.8rem", boxShadow: "0 2px 8px rgba(0,0,0,0.08)", display: "flex", flexDirection: "column", gap: "0.4rem" }}>
                  {item.card.imageUrl ? <img src={item.card.imageUrl} alt={item.card.name} style={{ width: "100%", height: "140px", objectFit: "cover", borderRadius: "6px" }} /> : null}
                  <strong>{item.card.name}</strong>
                  <span style={{ fontSize: "0.8rem", color: "var(--muted)" }}>{item.card.deck.name}</span>
                  <span style={{ fontSize: "0.8rem" }}>{item.card.rarity.name} • {item.variant}</span>
                  {item.card.category ? <span style={{ fontSize: "0.75rem" }}>{categoryLabel(item.card.category)}</span> : null}
                  <span>×{item.quantity}</span>
                  {isAdmin ? (
                    <form action={removeInventoryItem} style={{ display: "grid", gap: "0.35rem", marginTop: "auto" }}>
                      <input type="hidden" name="itemId" value={item.id} />
                      <input type="number" name="quantity" min={1} max={item.quantity} defaultValue={1} />
                      <button type="submit">Retirer de l'inventaire</button>
                    </form>
                  ) : null}
                </article>
              ))}
            </div>

            <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap", marginTop: "1rem" }}>
              {safePage > 1 ? <a href={buildPageHref(safePage - 1)}>← Page précédente</a> : <span style={{ color: "var(--muted)" }}>← Page précédente</span>}
              {safePage < totalPages ? <a href={buildPageHref(safePage + 1)}>Page suivante →</a> : <span style={{ color: "var(--muted)" }}>Page suivante →</span>}
            </div>
          </article>

          <article className="card">
            <h2 style={{ marginTop: 0 }}>{isAdmin ? "Logs perso" : "Activité récente"}</h2>
            {personalLogs.length === 0 ? (
              <p style={{ color: "var(--muted)" }}>Aucun log personnel trouvé.</p>
            ) : (
              <div style={{ display: "grid", gap: "0.75rem" }}>
                {personalLogs.map((log) => (
                  <article key={log.id} style={{ border: "1px solid #ebe7df", borderRadius: "10px", padding: "0.75rem" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: "1rem", flexWrap: "wrap" }}>
                      <strong>{log.summary}</strong>
                      <span style={{ color: "var(--muted)", fontSize: "0.85rem" }}>{log.createdAt.toLocaleString("fr-FR")}</span>
                    </div>
                    <div style={{ marginTop: "0.4rem", color: "var(--muted)", fontSize: "0.9rem" }}>
                      {log.category} • {log.action} • {log.status ?? "-"}
                    </div>
                  </article>
                ))}
              </div>
            )}
          </article>
        </div>
      </div>
    </section>
  );
}