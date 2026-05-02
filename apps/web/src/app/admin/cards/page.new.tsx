import { prisma } from "@rta/database";
import { RARITIES, DECKS } from "@rta/shared";
import { requireAdmin } from "../../../lib/guard";
import { revalidatePath } from "next/cache";

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
  { value: "manual", label: "Manuel" }
];

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

type SearchParams = {
  q?: string;
  deck?: string;
  rarity?: string;
  category?: string;
  sort?: "name" | "rarity" | "deck" | "category";
  order?: "asc" | "desc";
  rarityFocus?: string;
};

export default async function AdminCardsPage({ searchParams }: { searchParams: SearchParams }) {
  const currentAdmin = await requireAdmin();

  async function createDeck(formData: FormData) {
    "use server";
    const admin = await requireAdmin();
    const name = String(formData.get("name") ?? "").trim();
    if (!name) return;

    await prisma.deck.upsert({ where: { name }, update: {}, create: { name } });
    await prisma.adminLog.create({ data: { adminId: admin.id, action: "DECK_UPSERTED", target: name } });
    revalidatePath("/admin/cards");
  }

  async function deleteDeck(formData: FormData) {
    "use server";
    const admin = await requireAdmin();
    const id = String(formData.get("deckId") ?? "");
    if (!id) return;

    await prisma.deck.delete({ where: { id } });
    await prisma.adminLog.create({ data: { adminId: admin.id, action: "DECK_DELETED", target: id } });
    revalidatePath("/admin/cards");
  }

  async function updateRarity(formData: FormData) {
    "use server";
    const admin = await requireAdmin();
    const rarityId = String(formData.get("rarityId") ?? "");
    const weight = Number(formData.get("weight") ?? 1);
    const catchRate = Number(formData.get("catchRate") ?? 1);
    const safeWeight = Number.isFinite(weight) ? Math.max(1, Math.floor(weight)) : 1;
    const safeCatchRate = Number.isFinite(catchRate) ? Math.min(1, Math.max(0, catchRate)) : 1;
    if (!rarityId) return;

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

    if (!name || !deckId || !rarityId) return;

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

    await prisma.adminLog.create({ data: { adminId: admin.id, action: "CARD_CREATED", target: name } });
    revalidatePath("/admin/cards");
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

    if (!id || !name || !deckId || !rarityId) return;

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

    await prisma.adminLog.create({ data: { adminId: admin.id, action: "CARD_UPDATED", target: id } });
    revalidatePath("/admin/cards");
  }

  async function deleteCard(formData: FormData) {
    "use server";
    const admin = await requireAdmin();
    const cardId = String(formData.get("cardId") ?? "");
    if (!cardId) return;

    await prisma.$transaction(async (tx) => {
      await tx.inventoryItem.deleteMany({ where: { cardId } });
      await tx.tradeItem.deleteMany({ where: { cardId } });
      await tx.captureLog.deleteMany({ where: { cardId } });
      await tx.card.delete({ where: { id: cardId } });
    });

    await prisma.adminLog.create({ data: { adminId: admin.id, action: "CARD_DELETED", target: cardId } });
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
      if (!deckId || !rarityId) continue;

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

    await prisma.adminLog.create({ data: { adminId: admin.id, action: "EXAMPLE_CARDS_UPSERTED", target: "admin/cards" } });
    revalidatePath("/admin/cards");
  }

  async function forceRandomSpawn() {
    "use server";
    const admin = await requireAdmin();

    await prisma.appConfig.upsert({
      where: { id: "default" },
      update: { forceSpawnRequestedAt: new Date(), forceSpawnCardId: null },
      create: {
        id: "default",
        spawnIntervalS: 300,
        captureCooldownS: 5,
        forceSpawnRequestedAt: new Date(),
        forceSpawnCardId: null
      }
    });

    await prisma.adminLog.create({
      data: {
        adminId: admin.id,
        action: "CONFIG_FORCE_RANDOM_SPAWN_REQUESTED",
        target: "default"
      }
    });

    revalidatePath("/admin/cards");
  }

  async function forceSpecificSpawn(formData: FormData) {
    "use server";
    const admin = await requireAdmin();
    const cardId = String(formData.get("cardId") ?? "").trim();
    if (!cardId) return;

    const card = await prisma.card.findUnique({ where: { id: cardId } });
    if (!card) return;

    await prisma.appConfig.upsert({
      where: { id: "default" },
      update: { forceSpawnRequestedAt: new Date(), forceSpawnCardId: cardId },
      create: {
        id: "default",
        spawnIntervalS: 300,
        captureCooldownS: 5,
        forceSpawnRequestedAt: new Date(),
        forceSpawnCardId: cardId
      }
    });

    await prisma.adminLog.create({
      data: {
        adminId: admin.id,
        action: "CONFIG_FORCE_TARGET_SPAWN_REQUESTED",
        target: cardId,
        metadata: { cardName: card.name }
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
  const rarityFocus = (searchParams.rarityFocus ?? "").trim();

  const cardsRaw = await prisma.card.findMany({
    where: {
      name: searchParams.q ? { contains: searchParams.q, mode: "insensitive" } : undefined,
      deck: searchParams.deck ? { name: searchParams.deck } : undefined,
      rarity: searchParams.rarity ? { name: searchParams.rarity } : undefined,
      category: searchParams.category ? searchParams.category : undefined
    },
    include: { deck: true, rarity: true }
  });

  const cards = [...cardsRaw].sort((a, b) => {
    const dir = order === "asc" ? 1 : -1;

    if (sort === "rarity") {
      if (rarityFocus) {
        const aFocus = a.rarity.name === rarityFocus ? 0 : 1;
        const bFocus = b.rarity.name === rarityFocus ? 0 : 1;
        if (aFocus !== bFocus) return aFocus - bFocus;
      }
      const byWeight = (a.rarity.weight - b.rarity.weight) * dir;
      if (byWeight !== 0) return byWeight;
      return a.name.localeCompare(b.name);
    }

    if (sort === "deck") {
      const byDeck = a.deck.name.localeCompare(b.deck.name) * dir;
      if (byDeck !== 0) return byDeck;
      return a.name.localeCompare(b.name);
    }

    if (sort === "category") {
      const byCategory = (a.category ?? "").localeCompare(b.category ?? "") * dir;
      if (byCategory !== 0) return byCategory;
      return a.name.localeCompare(b.name);
    }

    return a.name.localeCompare(b.name) * dir;
  });

  const decks = await prisma.deck.findMany({ orderBy: { name: "asc" } });
  const rarities = await prisma.rarity.findMany({ orderBy: { weight: "desc" } });
  const users = await prisma.user.findMany({ select: { username: true }, orderBy: { username: "asc" }, take: 250 });

  return (
    <section className="card">
      <h1>Admin Cards & Bibliotheques</h1>
      <p>Connecte en admin: {currentAdmin.username}</p>

      <article className="card">
        <h2>Actions rapides</h2>
        <form action={forceRandomSpawn}>
          <button type="submit">Forcer un spawn aleatoire maintenant</button>
        </form>
        <p style={{ color: "var(--muted)", marginTop: "0.5rem" }}>Pour un spawn cible, utilise le bouton dans chaque carte.</p>
      </article>

      <article className="card">
        <h2>Filtres & tri</h2>
        <form method="GET" style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", alignItems: "center" }}>
          <input name="q" defaultValue={searchParams.q ?? ""} placeholder="Rechercher une carte..." />
          <select name="deck" defaultValue={searchParams.deck ?? ""}>
            <option value="">Tous les decks</option>
            {DECKS.map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
          <select name="rarity" defaultValue={searchParams.rarity ?? ""}>
            <option value="">Toutes raretes (filtre)</option>
            {RARITIES.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
          <select name="category" defaultValue={searchParams.category ?? ""}>
            <option value="">Toutes categories</option>
            {POP_CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
          </select>
          <select name="sort" defaultValue={sort}>
            <option value="name">Tri: nom</option>
            <option value="rarity">Tri: rarete</option>
            <option value="deck">Tri: deck</option>
            <option value="category">Tri: categorie</option>
          </select>
          <select name="order" defaultValue={order}>
            <option value="asc">Croissant</option>
            <option value="desc">Decroissant</option>
          </select>
          <select name="rarityFocus" defaultValue={rarityFocus}>
            <option value="">Priorite rarete: aucune</option>
            {RARITIES.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
          <button type="submit">Appliquer</button>
          <a href="/admin/cards">Reinitialiser</a>
        </form>
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
            <span>{rarity.name}</span>
            <input name="weight" type="number" min={1} defaultValue={rarity.weight} />
            <input name="catchRate" type="number" min={0} max={1} step="0.01" defaultValue={rarity.catchRate ?? 1} />
            <button type="submit">Mettre a jour</button>
          </form>
        ))}
      </article>

      <article className="card">
        <h2>Ajouter une carte</h2>
        <form action={createCard} style={{ display: "grid", gap: "8px", maxWidth: "760px" }}>
          <input name="name" type="text" placeholder="Nom" required />
          <select name="deckId" defaultValue="" required>
            <option value="" disabled>Choisir un deck</option>
            {decks.map((deck) => (<option key={deck.id} value={deck.id}>{deck.name}</option>))}
          </select>
          <select name="rarityId" defaultValue="" required>
            <option value="" disabled>Choisir une rarete</option>
            {rarities.map((rarity) => (<option key={rarity.id} value={rarity.id}>{rarity.name}</option>))}
          </select>
          <select name="category" defaultValue="">
            <option value="">Sans categorie</option>
            {POP_CATEGORIES.map((c) => (<option key={c.value} value={c.value}>{c.label}</option>))}
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

      <datalist id="admin-usernames">
        {users.map((u) => (<option key={u.username} value={u.username} />))}
      </datalist>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: "1rem", marginTop: "1.5rem" }}>
        {cards.map((card) => (
          <article key={card.id} style={{ background: "var(--card)", borderRadius: "10px", overflow: "hidden", boxShadow: "0 2px 8px rgba(0,0,0,0.08)", display: "flex", flexDirection: "column" }}>
            {card.imageUrl && <img src={card.imageUrl} alt={card.name} style={{ width: "100%", height: "140px", objectFit: "cover" }} />}
            <div style={{ padding: "0.8rem", display: "flex", flexDirection: "column", gap: "0.3rem", flex: 1 }}>
              <strong style={{ fontSize: "0.95rem" }}>{card.name}</strong>
              <span style={{ fontSize: "0.8rem", fontWeight: 600, color: rarityColor[card.rarity.name] ?? "#333" }}>{card.rarity.name}</span>
              <span style={{ fontSize: "0.8rem", color: "var(--muted)" }}>{card.deck.name}</span>

              <form action={forceSpecificSpawn} style={{ marginTop: "6px" }}>
                <input type="hidden" name="cardId" value={card.id} />
                <button type="submit" style={{ width: "100%" }}>Spawn cette carte</button>
              </form>

              <form action={giveCardToUser} style={{ display: "grid", gap: "6px", marginTop: "6px" }}>
                <input type="hidden" name="cardId" value={card.id} />
                <input name="username" type="text" list="admin-usernames" placeholder="Username destinataire" required style={{ fontSize: "0.82rem", padding: "4px 6px" }} />
                <input name="quantity" type="number" min={1} defaultValue={1} style={{ fontSize: "0.82rem", padding: "4px 6px" }} />
                <button type="submit" style={{ fontSize: "0.82rem", padding: "4px 8px" }}>Donner la carte</button>
              </form>

              <details style={{ marginTop: "0.5rem" }}>
                <summary style={{ cursor: "pointer", fontSize: "0.82rem", color: "var(--accent)" }}>Modifier</summary>
                <form action={updateCard} style={{ display: "grid", gap: "6px", marginTop: "8px" }}>
                  <input type="hidden" name="cardId" value={card.id} />
                  <input name="name" type="text" defaultValue={card.name} required style={{ fontSize: "0.82rem", padding: "4px 6px" }} />
                  <select name="deckId" defaultValue={card.deckId} required style={{ fontSize: "0.82rem", padding: "4px 6px" }}>
                    {decks.map((deck) => (<option key={deck.id} value={deck.id}>{deck.name}</option>))}
                  </select>
                  <select name="rarityId" defaultValue={card.rarityId} required style={{ fontSize: "0.82rem", padding: "4px 6px" }}>
                    {rarities.map((rarity) => (<option key={rarity.id} value={rarity.id}>{rarity.name}</option>))}
                  </select>
                  <select name="category" defaultValue={card.category ?? ""} style={{ fontSize: "0.82rem", padding: "4px 6px" }}>
                    <option value="">Sans categorie</option>
                    {POP_CATEGORIES.map((c) => (<option key={c.value} value={c.value}>{c.label}</option>))}
                  </select>
                  <input name="imageUrl" type="url" defaultValue={card.imageUrl ?? ""} placeholder="Image URL" style={{ fontSize: "0.82rem", padding: "4px 6px" }} />
                  <textarea name="description" defaultValue={card.description ?? ""} rows={2} style={{ fontSize: "0.82rem", padding: "4px 6px" }} />
                  <input name="xpReward" type="number" min={0} defaultValue={card.xpReward} required style={{ fontSize: "0.82rem", padding: "4px 6px" }} />
                  <input name="dropRate" type="number" min={0.0001} step="0.0001" defaultValue={card.dropRate} required style={{ fontSize: "0.82rem", padding: "4px 6px" }} />
                  <button type="submit" style={{ fontSize: "0.82rem", padding: "4px 8px" }}>Sauvegarder</button>
                </form>
              </details>

              <form action={deleteCard} style={{ marginTop: "4px" }}>
                <input type="hidden" name="cardId" value={card.id} />
                <button type="submit" style={{ fontSize: "0.78rem", padding: "3px 8px", background: "#e53935", color: "#fff", border: "none", borderRadius: "4px", cursor: "pointer" }}>Supprimer</button>
              </form>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
