import { prisma } from "@rta/database";
import { requireAdmin } from "../../../lib/guard";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { RARITIES } from "@rta/shared";
import AdminCardsFiltersClient from "./filters.client";

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

const EXAMPLE_CARDS = [
  {
    name: "Octane Legacy",
    deck: "Rocket League-like",
    rarity: "Rare",
    description: "Car body iconique, edition collection.",
    imageUrl: "https://images.unsplash.com/photo-1511884642898-4c92249e20b6",
    xpReward: 40,
    dropRate: 0.2
  },
  {
    name: "Portal Driver",
    deck: "Pop Culture",
    rarity: "Very Rare",
    description: "Pilote venu d'un portail inter-dimensionnel.",
    imageUrl: "https://images.unsplash.com/photo-1518770660439-4636190af475",
    xpReward: 70,
    dropRate: 0.1
  },
  {
    name: "Neon Pikachu",
    deck: "Pokemon",
    rarity: "Import",
    description: "Version neon d'un classique electrique.",
    imageUrl: "https://images.unsplash.com/photo-1613771404721-1f92d799e49f",
    xpReward: 110,
    dropRate: 0.05
  }
];

const POP_CATEGORIES: { value: string; label: string }[] = [
  { value: "movie", label: "Films" },
  { value: "tv", label: "Series" },
  { value: "anime", label: "Anime" },
  { value: "manga", label: "Manga" },
  { value: "video_game", label: "Jeux video" },
  { value: "meme", label: "Memes" },
  { value: "music", label: "Musique" },
  { value: "internet", label: "Internet" },
  { value: "comics", label: "Comics" },
  { value: "sport", label: "Sport" },
  { value: "manual", label: "Manuel" },
  { value: "body", label: "Body" },
  { value: "decal", label: "Decal" },
  { value: "wheels", label: "Wheels" },
  { value: "rocket_boost", label: "Rocket Boost" },
  { value: "goal_explosion", label: "Goal Explosion" },
  { value: "trail", label: "Trail" },
  { value: "topper", label: "Topper" },
  { value: "antenna", label: "Antenna" },
  { value: "player_banner", label: "Player Banner" },
  { value: "player_title", label: "Player Title" },
  { value: "unknown", label: "Unknown" }
];

type SearchParams = {
  q?: string;
  deck?: string;
  rarity?: string;
  category?: string;
  sort?: "name" | "rarity" | "deck" | "category";
  order?: "asc" | "desc";
  page?: string;
  flash?: "card_updated" | "card_created" | "duplicate_name";
};

export default async function AdminCardsPage({ searchParams }: { searchParams: SearchParams }) {
  const currentAdmin = await requireAdmin();
  const flash = searchParams.flash;

  async function createDeck(formData: FormData) {
    "use server";
    const admin = await requireAdmin();
    const name = String(formData.get("name") ?? "").trim();
    if (!name) {
      return;
    }

    await prisma.deck.upsert({
      where: { name },
      update: {},
      create: { name }
    });

    await prisma.adminLog.create({
      data: {
        adminId: admin.id,
        action: "DECK_UPSERTED",
        target: name
      }
    });

    revalidatePath("/admin/cards");
  }

  async function deleteDeck(formData: FormData) {
    "use server";
    const admin = await requireAdmin();
    const id = String(formData.get("deckId") ?? "");
    if (!id) {
      return;
    }

    // Get all card IDs in this deck
    const cards = await prisma.card.findMany({ where: { deckId: id }, select: { id: true } });
    const cardIds = cards.map(c => c.id);

    if (cardIds.length > 0) {
      // Delete all related records in the correct order (respecting foreign keys)
      await prisma.inventoryItem.deleteMany({ where: { cardId: { in: cardIds } } });
      await prisma.tradeItem.deleteMany({ where: { cardId: { in: cardIds } } });
      await prisma.captureLog.deleteMany({ where: { cardId: { in: cardIds } } });
      await prisma.spawnLog.deleteMany({ where: { cardId: { in: cardIds } } });
    }

    // Then delete all cards in this deck
    await prisma.card.deleteMany({ where: { deckId: id } });
    
    // Finally delete the deck itself
    await prisma.deck.delete({ where: { id } });
    
    await prisma.adminLog.create({
      data: {
        adminId: admin.id,
        action: "DECK_DELETED",
        target: id
      }
    });

    revalidatePath("/admin/cards");
  }

  async function updateRarity(formData: FormData) {
    "use server";
    const admin = await requireAdmin();
    const rarityId = String(formData.get("rarityId") ?? "");
    const weight = Number(formData.get("weight") ?? 1);
    const safeWeight = Number.isFinite(weight) ? Math.max(1, Math.floor(weight)) : 1;
    const catchRateRaw = Number(formData.get("catchRate") ?? 1);
    const safeCatchRate = Number.isFinite(catchRateRaw) ? Math.min(1, Math.max(0, catchRateRaw)) : 1;
    if (!rarityId) {
      return;
    }

    await prisma.rarity.update({
      where: { id: rarityId },
      data: { weight: safeWeight, catchRate: safeCatchRate }
    });

    await prisma.adminLog.create({
      data: {
        adminId: admin.id,
        action: "RARITY_UPDATED",
        target: rarityId,
        metadata: { weight: safeWeight, catchRate: safeCatchRate }
      }
    });

    revalidatePath("/admin/cards");
  }

  async function createCard(formData: FormData) {
    "use server";
    const admin = await requireAdmin();
    const name = String(formData.get("name") ?? "").trim();
    const deckId = String(formData.get("deckId") ?? "");
    const rarityId = String(formData.get("rarityId") ?? "");
    const categoryRaw = String(formData.get("category") ?? "").trim();
    const category = categoryRaw || null;
    const description = String(formData.get("description") ?? "").trim() || null;
    const imageUrl = String(formData.get("imageUrl") ?? "").trim() || null;
    const xpReward = Number(formData.get("xpReward") ?? 10);
    const dropRate = Number(formData.get("dropRate") ?? 0.1);

    if (!name || !deckId || !rarityId) {
      return;
    }

    const existingByName = await prisma.card.findUnique({ where: { name } });
    if (existingByName) {
      await prisma.adminLog.create({
        data: {
          adminId: admin.id,
          action: "CARD_CREATE_REJECTED_DUPLICATE_NAME",
          target: existingByName.id,
          metadata: { attemptedName: name }
        }
      });
      redirect("/admin/cards?flash=duplicate_name");
    }

    await prisma.card.create({
      data: {
        name,
        deckId,
        rarityId,
        category,
        description,
        imageUrl,
        xpReward: Number.isFinite(xpReward) ? Math.max(0, Math.floor(xpReward)) : 0,
        dropRate: Number.isFinite(dropRate) ? Math.max(0.0001, dropRate) : 0.1
      }
    });

    await prisma.adminLog.create({
      data: {
        adminId: admin.id,
        action: "CARD_CREATED",
        target: name
      }
    });

    redirect("/admin/cards?flash=card_created");
  }

  async function updateCard(formData: FormData) {
    "use server";
    const admin = await requireAdmin();
    const id = String(formData.get("cardId") ?? "");
    const name = String(formData.get("name") ?? "").trim();
    const deckId = String(formData.get("deckId") ?? "");
    const rarityId = String(formData.get("rarityId") ?? "");
    const categoryRaw = String(formData.get("category") ?? "").trim();
    const category = categoryRaw || null;
    const description = String(formData.get("description") ?? "").trim() || null;
    const imageUrl = String(formData.get("imageUrl") ?? "").trim() || null;
    const xpReward = Number(formData.get("xpReward") ?? 10);
    const dropRate = Number(formData.get("dropRate") ?? 0.1);

    if (!id || !name || !deckId || !rarityId) {
      return;
    }

    const duplicateName = await prisma.card.findFirst({
      where: {
        name,
        NOT: { id }
      },
      select: { id: true }
    });

    if (duplicateName) {
      await prisma.adminLog.create({
        data: {
          adminId: admin.id,
          action: "CARD_UPDATE_REJECTED_DUPLICATE_NAME",
          target: id,
          metadata: { attemptedName: name, conflictingCardId: duplicateName.id }
        }
      });
      redirect("/admin/cards?flash=duplicate_name");
    }

    try {
      await prisma.card.update({
        where: { id },
        data: {
          name,
          deckId,
          rarityId,
          category,
          description,
          imageUrl,
          xpReward: Number.isFinite(xpReward) ? Math.max(0, Math.floor(xpReward)) : 0,
          dropRate: Number.isFinite(dropRate) ? Math.max(0.0001, dropRate) : 0.1
        }
      });
    } catch (error) {
      if (error instanceof Error && error.message.includes("Unique constraint failed")) {
        redirect("/admin/cards?flash=duplicate_name");
      }
      throw error;
    }

    await prisma.adminLog.create({
      data: {
        adminId: admin.id,
        action: "CARD_UPDATED",
        target: id
      }
    });

    redirect("/admin/cards?flash=card_updated");
  }

  async function deleteCard(formData: FormData) {
    "use server";
    const admin = await requireAdmin();
    const cardId = String(formData.get("cardId") ?? "");
    if (!cardId) {
      return;
    }

    await prisma.$transaction(async (tx) => {
      await tx.inventoryItem.deleteMany({ where: { cardId } });
      await tx.tradeItem.deleteMany({ where: { cardId } });
      await tx.captureLog.deleteMany({ where: { cardId } });
      await tx.spawnLog.deleteMany({ where: { cardId } });
      await tx.card.delete({ where: { id: cardId } });
    });

    await prisma.adminLog.create({
      data: {
        adminId: admin.id,
        action: "CARD_DELETED",
        target: cardId
      }
    });

    revalidatePath("/admin/cards");
  }

  async function addExampleCards() {
    "use server";
    const admin = await requireAdmin();
    const decks = await prisma.deck.findMany();
    const rarities = await prisma.rarity.findMany();
    const deckByName = new Map(decks.map((d) => [d.name, d.id]));
    const rarityByName = new Map(rarities.map((r) => [r.name, r.id]));

    for (const sample of EXAMPLE_CARDS) {
      const deckId = deckByName.get(sample.deck);
      const rarityId = rarityByName.get(sample.rarity);
      if (!deckId || !rarityId) {
        continue;
      }

      await prisma.card.upsert({
        where: { name: sample.name },
        update: {
          deckId,
          rarityId,
          description: sample.description,
          imageUrl: sample.imageUrl,
          xpReward: sample.xpReward,
          dropRate: sample.dropRate
        },
        create: {
          name: sample.name,
          deckId,
          rarityId,
          description: sample.description,
          imageUrl: sample.imageUrl,
          xpReward: sample.xpReward,
          dropRate: sample.dropRate
        }
      });
    }

    await prisma.adminLog.create({
      data: {
        adminId: admin.id,
        action: "EXAMPLE_CARDS_UPSERTED",
        target: "admin/cards"
      }
    });

    revalidatePath("/admin/cards");
  }

  async function forceRandomSpawn(formData: FormData) {
    "use server";
    const admin = await requireAdmin();
    const guildIdRaw = String(formData.get("guildId") ?? "").trim();
    const forceSpawnGuildId = guildIdRaw || null;

    await prisma.appConfig.upsert({
      where: { id: "default" },
      update: { forceSpawnRequestedAt: new Date(), forceSpawnCardId: null, forceSpawnGuildId },
      create: {
        id: "default",
        spawnIntervalS: 300,
        captureCooldownS: 5,
        forceSpawnRequestedAt: new Date(),
        forceSpawnCardId: null,
        forceSpawnGuildId
      }
    });

    await prisma.adminLog.create({
      data: {
        adminId: admin.id,
        action: "CONFIG_FORCE_RANDOM_SPAWN_REQUESTED",
        target: forceSpawnGuildId ?? "default",
        metadata: { forceSpawnGuildId }
      }
    });

    revalidatePath("/admin/cards");
  }

  async function forceSpecificSpawn(formData: FormData) {
    "use server";
    const admin = await requireAdmin();
    const cardId = String(formData.get("cardId") ?? "").trim();
    const guildIdRaw = String(formData.get("guildId") ?? "").trim();
    const forceSpawnGuildId = guildIdRaw || null;
    if (!cardId) return;

    const card = await prisma.card.findUnique({ where: { id: cardId } });
    if (!card) return;

    await prisma.appConfig.upsert({
      where: { id: "default" },
      update: { forceSpawnRequestedAt: new Date(), forceSpawnCardId: cardId, forceSpawnGuildId },
      create: {
        id: "default",
        spawnIntervalS: 300,
        captureCooldownS: 5,
        forceSpawnRequestedAt: new Date(),
        forceSpawnCardId: cardId,
        forceSpawnGuildId
      }
    });

    await prisma.adminLog.create({
      data: {
        adminId: admin.id,
        action: "CONFIG_FORCE_TARGET_SPAWN_REQUESTED",
        target: cardId,
        metadata: { cardName: card.name, forceSpawnGuildId }
      }
    });

    revalidatePath("/admin/cards");
  }

  async function giveCardToUser(formData: FormData) {
    "use server";
    const admin = await requireAdmin();
    const cardId = String(formData.get("cardId") ?? "").trim();
    const username = String(formData.get("username") ?? "").trim();
    const quantityRaw = Number(formData.get("quantity") ?? 1);
    const quantity = Number.isFinite(quantityRaw) ? Math.max(1, Math.floor(quantityRaw)) : 1;

    if (!cardId || !username) return;

    const user = await prisma.user.findFirst({
      where: { username: { equals: username, mode: "insensitive" } }
    });
    if (!user) return;

    const card = await prisma.card.findUnique({ where: { id: cardId } });
    if (!card) return;

    await prisma.inventoryItem.upsert({
      where: { userId_cardId_variant: { userId: user.id, cardId, variant: "normal" } },
      update: { quantity: { increment: quantity } },
      create: { userId: user.id, cardId, variant: "normal", quantity }
    });

    await prisma.adminLog.create({
      data: {
        adminId: admin.id,
        action: "CARD_GRANTED_TO_USER",
        target: `${user.id}:${cardId}`,
        metadata: { username: user.username, cardName: card.name, quantity }
      }
    });

    revalidatePath("/admin/cards");
  }

  const sort = searchParams.sort ?? "name";
  const order = searchParams.order ?? "asc";
  const pageRaw = Number(searchParams.page ?? "1");
  const page = Number.isFinite(pageRaw) ? Math.max(1, Math.floor(pageRaw)) : 1;
  const pageSize = 100;

  const where = {
    where: {
      name: searchParams.q ? { contains: searchParams.q, mode: "insensitive" } : undefined,
      deck: searchParams.deck ? { name: searchParams.deck } : undefined,
      rarity: searchParams.rarity ? { name: searchParams.rarity } : undefined,
      category: searchParams.category ? searchParams.category : undefined
    }
  };

  const orderBy =
    sort === "rarity"
      ? [{ rarity: { weight: order } }, { name: "asc" as const }]
      : sort === "deck"
      ? [{ deck: { name: order } }, { name: "asc" as const }]
      : sort === "category"
      ? [{ category: order }, { name: "asc" as const }]
      : [{ name: order }];

  const totalCards = await prisma.card.count(where);
  const totalPages = Math.max(1, Math.ceil(totalCards / pageSize));
  const safePage = Math.min(page, totalPages);

  const cards = await prisma.card.findMany({
    ...where,
    include: { deck: true, rarity: true },
    orderBy,
    skip: (safePage - 1) * pageSize,
    take: pageSize
  });

  function buildPageHref(targetPage: number): string {
    const params = new URLSearchParams();
    if (searchParams.q) params.set("q", searchParams.q);
    if (searchParams.deck) params.set("deck", searchParams.deck);
    if (searchParams.rarity) params.set("rarity", searchParams.rarity);
    if (searchParams.category) params.set("category", searchParams.category);
    if (sort) params.set("sort", sort);
    if (order) params.set("order", order);
    params.set("page", String(targetPage));
    return `/admin/cards?${params.toString()}`;
  }

  const decks = await prisma.deck.findMany({ orderBy: { name: "asc" } });
  const guilds = await prisma.botGuildConfig.findMany({
    where: { isActive: true, spawnChannelId: { not: null } },
    orderBy: { guildName: "asc" }
  });
  const rarities = await prisma.rarity.findMany({ orderBy: { weight: "desc" } });
  const users = await prisma.user.findMany({ select: { username: true }, orderBy: { username: "asc" }, take: 250 });

  return (
    <section className="card">
      <h1>Admin Cards & Bibliotheques</h1>
      <p>Connecte en admin: {currentAdmin.username}</p>
      {flash === "card_updated" && (
        <p style={{ background: "#dcfce7", border: "1px solid #86efac", color: "#166534", padding: "8px 10px", borderRadius: "8px" }}>
          ✅ Carte mise à jour.
        </p>
      )}
      {flash === "card_created" && (
        <p style={{ background: "#dcfce7", border: "1px solid #86efac", color: "#166534", padding: "8px 10px", borderRadius: "8px" }}>
          ✅ Carte créée.
        </p>
      )}
      {flash === "duplicate_name" && (
        <p style={{ background: "#fee2e2", border: "1px solid #fca5a5", color: "#991b1b", padding: "8px 10px", borderRadius: "8px" }}>
          ❌ Ce nom existe déjà. Le nom de carte doit être unique.
        </p>
      )}

      <article className="card">
        <h2>Actions rapides</h2>
        <form action={forceRandomSpawn} style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center" }}>
          <select name="guildId" defaultValue="" style={{ minWidth: "220px" }}>
            <option value="">Tous les serveurs actifs</option>
            {guilds.map((guild) => (
              <option key={guild.guildId} value={guild.guildId}>{guild.guildName}</option>
            ))}
          </select>
          <button type="submit">Forcer un spawn aleatoire maintenant</button>
        </form>
        <p style={{ color: "var(--muted)", marginTop: "0.5rem" }}>
          Pour un spawn cible, utilise le bouton "Spawn cette carte" dans chaque carte.
        </p>
      </article>

      <article className="card">
        <h2>Filtres & tri</h2>
        <AdminCardsFiltersClient
          decks={decks.map((d) => ({ value: d.name, label: d.name }))}
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
      </article>

      <article className="card">
        <h2>Bibliotheques (Decks)</h2>
        <form action={createDeck} style={{ display: "flex", gap: "8px", marginBottom: "10px", flexWrap: "wrap" }}>
          <input name="name" type="text" placeholder="Nouveau deck" required />
          <button type="submit">Ajouter deck</button>
        </form>
        {decks.map((deck) => (
          <form key={deck.id} action={deleteDeck} style={{ display: "flex", gap: "8px", marginBottom: "6px", alignItems: "center" }}>
            <input type="hidden" name="deckId" value={deck.id} />
            <span>{deck.name}</span>
            <button type="submit">Supprimer</button>
          </form>
        ))}
      </article>

      <article className="card">
        <h2>Raretes</h2>
        {rarities.map((rarity) => (
          <form key={rarity.id} action={updateRarity} style={{ display: "flex", gap: "8px", marginBottom: "6px", alignItems: "center", flexWrap: "wrap" }}>
            <input type="hidden" name="rarityId" value={rarity.id} />
            <span style={{ minWidth: "120px", fontWeight: "bold" }}>{rarity.name}</span>
            <label style={{ display: "flex", alignItems: "center", gap: "4px" }}>
              Poids
              <input name="weight" type="number" min={1} defaultValue={rarity.weight} style={{ width: "70px" }} />
            </label>
            <label style={{ display: "flex", alignItems: "center", gap: "4px" }}>
              Taux de capture (0-1)
              <input name="catchRate" type="number" min={0} max={1} step="0.01" defaultValue={rarity.catchRate ?? 1} style={{ width: "80px" }} />
            </label>
            <button type="submit">Sauvegarder</button>
          </form>
        ))}
      </article>

      <article className="card">
        <h2>Ajouter une carte</h2>
        <form action={createCard} style={{ display: "grid", gap: "8px", maxWidth: "760px" }}>
          <input name="name" type="text" placeholder="Nom" required />
          <select name="deckId" defaultValue="" required>
            <option value="" disabled>Choisir un deck</option>
            {decks.map((deck) => (
              <option key={deck.id} value={deck.id}>{deck.name}</option>
            ))}
          </select>
          <select name="rarityId" defaultValue="" required>
            <option value="" disabled>Choisir une rarete</option>
            {rarities.map((rarity) => (
              <option key={rarity.id} value={rarity.id}>{rarity.name}</option>
            ))}
          </select>
          <select name="category" defaultValue="">
            <option value="">Sans categorie</option>
            {POP_CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>{c.label}</option>
            ))}
          </select>
          <input name="imageUrl" type="url" placeholder="Image URL (optionnel)" />
          <textarea name="description" placeholder="Description (optionnelle)" rows={2} />
          <input name="xpReward" type="number" min={0} defaultValue={20} required />
          <input name="dropRate" type="number" min={0.0001} step="0.0001" defaultValue={0.1} required />
          <button type="submit">Creer la carte</button>
        </form>

        <form action={addExampleCards} style={{ marginTop: "10px" }}>
          <button type="submit">Ajouter des cartes d'exemple</button>
        </form>
      </article>

      <p style={{ marginTop: "8px" }}>Gestion complete: decks, raretes, cartes, spawn force et dons utilisateurs.</p>

      <article className="card" style={{ marginTop: "1rem" }}>
        <h2>Pagination</h2>
        <p style={{ color: "var(--muted)" }}>
          {totalCards} cartes au total. Page {safePage} / {totalPages}.
        </p>
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
          {safePage > 1 ? (
            <a href={buildPageHref(safePage - 1)} style={{ padding: "6px 10px", borderRadius: "6px", border: "1px solid #d1d5db", textDecoration: "none" }}>
              ← Page precedente
            </a>
          ) : (
            <span style={{ padding: "6px 10px", borderRadius: "6px", border: "1px solid #e5e7eb", color: "#9ca3af" }}>← Page precedente</span>
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

      <datalist id="admin-usernames">
        {users.map((u) => (
          <option key={u.username} value={u.username} />
        ))}
      </datalist>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: "1rem", marginTop: "1.5rem" }}>
        {cards.map((card) => (
          <article key={card.id} style={{ background: "var(--card)", borderRadius: "10px", overflow: "hidden", boxShadow: "0 2px 8px rgba(0,0,0,0.08)", display: "flex", flexDirection: "column" }}>
            {/* Visual preview */}
            {card.imageUrl && (
              <img src={card.imageUrl} alt={card.name} style={{ width: "100%", height: "140px", objectFit: "cover" }} />
            )}
            <div style={{ padding: "0.8rem", display: "flex", flexDirection: "column", gap: "0.3rem", flex: 1 }}>
              <strong style={{ fontSize: "0.95rem" }}>{card.name}</strong>
              <span style={{ fontSize: "0.8rem", fontWeight: 600, color: rarityColor[card.rarity.name] ?? "#333" }}>
                {card.rarity.name}
              </span>
              <span style={{ fontSize: "0.8rem", color: "var(--muted)" }}>{card.deck.name}</span>
              {card.category ? (
                <span style={{ fontSize: "0.75rem", color: "var(--muted)" }}>Categorie: {card.category}</span>
              ) : null}

              <form action={forceSpecificSpawn} style={{ marginTop: "6px" }}>
                <input type="hidden" name="cardId" value={card.id} />
                <select name="guildId" defaultValue="" style={{ width: "100%", marginBottom: "6px", fontSize: "0.82rem", padding: "4px 6px" }}>
                  <option value="">Tous les serveurs actifs</option>
                  {guilds.map((guild) => (
                    <option key={guild.guildId} value={guild.guildId}>{guild.guildName}</option>
                  ))}
                </select>
                <button type="submit" style={{ width: "100%" }}>Spawn cette carte</button>
              </form>

              <form action={giveCardToUser} style={{ display: "grid", gap: "6px", marginTop: "6px" }}>
                <input type="hidden" name="cardId" value={card.id} />
                <input
                  name="username"
                  type="text"
                  list="admin-usernames"
                  placeholder="Username destinataire"
                  required
                  style={{ fontSize: "0.82rem", padding: "4px 6px" }}
                />
                <input name="quantity" type="number" min={1} defaultValue={1} style={{ fontSize: "0.82rem", padding: "4px 6px" }} />
                <button type="submit" style={{ fontSize: "0.82rem", padding: "4px 8px" }}>Donner la carte</button>
              </form>

              {/* Edit form */}
              <details style={{ marginTop: "0.5rem" }}>
                <summary style={{ cursor: "pointer", fontSize: "0.82rem", color: "var(--accent)" }}>Modifier</summary>
                <form action={updateCard} style={{ display: "grid", gap: "6px", marginTop: "8px" }}>
                  <input type="hidden" name="cardId" value={card.id} />
                  <input name="name" type="text" defaultValue={card.name} required style={{ fontSize: "0.82rem", padding: "4px 6px" }} />
                  <select name="deckId" defaultValue={card.deckId} required style={{ fontSize: "0.82rem", padding: "4px 6px" }}>
                    {decks.map((deck) => (
                      <option key={deck.id} value={deck.id}>{deck.name}</option>
                    ))}
                  </select>
                  <select name="rarityId" defaultValue={card.rarityId} required style={{ fontSize: "0.82rem", padding: "4px 6px" }}>
                    {rarities.map((rarity) => (
                      <option key={rarity.id} value={rarity.id}>{rarity.name}</option>
                    ))}
                  </select>
                  <select name="category" defaultValue={card.category ?? ""} style={{ fontSize: "0.82rem", padding: "4px 6px" }}>
                    <option value="">Sans categorie</option>
                    {POP_CATEGORIES.map((c) => (
                      <option key={c.value} value={c.value}>{c.label}</option>
                    ))}
                  </select>
                  <input name="imageUrl" type="url" defaultValue={card.imageUrl ?? ""} placeholder="Image URL" style={{ fontSize: "0.82rem", padding: "4px 6px" }} />
                  <textarea name="description" defaultValue={card.description ?? ""} rows={2} style={{ fontSize: "0.82rem", padding: "4px 6px" }} />
                  <input name="xpReward" type="number" min={0} defaultValue={card.xpReward} required style={{ fontSize: "0.82rem", padding: "4px 6px" }} />
                  <input name="dropRate" type="number" min={0.0001} step="0.0001" defaultValue={card.dropRate} required style={{ fontSize: "0.82rem", padding: "4px 6px" }} />
                  <button type="submit" style={{ fontSize: "0.82rem", padding: "4px 8px" }}>Sauvegarder</button>
                </form>
              </details>

              {/* Delete form */}
              <form action={deleteCard} style={{ marginTop: "4px" }}>
                <input type="hidden" name="cardId" value={card.id} />
                <button type="submit" style={{ fontSize: "0.78rem", padding: "3px 8px", background: "#e53935", color: "#fff", border: "none", borderRadius: "4px", cursor: "pointer" }}>
                  Supprimer
                </button>
              </form>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}


