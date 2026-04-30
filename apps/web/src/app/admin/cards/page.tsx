import { prisma } from "@rta/database";
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

export default async function AdminCardsPage() {
  const currentAdmin = await requireAdmin();

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
    if (!rarityId) {
      return;
    }

    await prisma.rarity.update({
      where: { id: rarityId },
      data: { weight: safeWeight }
    });

    await prisma.adminLog.create({
      data: {
        adminId: admin.id,
        action: "RARITY_WEIGHT_UPDATED",
        target: rarityId,
        metadata: { weight: safeWeight }
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
    const description = String(formData.get("description") ?? "").trim() || null;
    const imageUrl = String(formData.get("imageUrl") ?? "").trim() || null;
    const xpReward = Number(formData.get("xpReward") ?? 10);
    const dropRate = Number(formData.get("dropRate") ?? 0.1);

    if (!name || !deckId || !rarityId) {
      return;
    }

    await prisma.card.create({
      data: {
        name,
        deckId,
        rarityId,
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

    revalidatePath("/admin/cards");
  }

  async function updateCard(formData: FormData) {
    "use server";
    const admin = await requireAdmin();
    const id = String(formData.get("cardId") ?? "");
    const name = String(formData.get("name") ?? "").trim();
    const deckId = String(formData.get("deckId") ?? "");
    const rarityId = String(formData.get("rarityId") ?? "");
    const description = String(formData.get("description") ?? "").trim() || null;
    const imageUrl = String(formData.get("imageUrl") ?? "").trim() || null;
    const xpReward = Number(formData.get("xpReward") ?? 10);
    const dropRate = Number(formData.get("dropRate") ?? 0.1);

    if (!id || !name || !deckId || !rarityId) {
      return;
    }

    await prisma.card.update({
      where: { id },
      data: {
        name,
        deckId,
        rarityId,
        description,
        imageUrl,
        xpReward: Number.isFinite(xpReward) ? Math.max(0, Math.floor(xpReward)) : 0,
        dropRate: Number.isFinite(dropRate) ? Math.max(0.0001, dropRate) : 0.1
      }
    });

    await prisma.adminLog.create({
      data: {
        adminId: admin.id,
        action: "CARD_UPDATED",
        target: id
      }
    });

    revalidatePath("/admin/cards");
  }

  async function deleteCard(formData: FormData) {
    "use server";
    const admin = await requireAdmin();
    const cardId = String(formData.get("cardId") ?? "");
    if (!cardId) {
      return;
    }

    await prisma.card.delete({ where: { id: cardId } });
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

  const cards = await prisma.card.findMany({
    include: { deck: true, rarity: true },
    orderBy: { name: "asc" }
  });
  const decks = await prisma.deck.findMany({ orderBy: { name: "asc" } });
  const rarities = await prisma.rarity.findMany({ orderBy: { weight: "desc" } });

  return (
    <section className="card">
      <h1>Admin Cards & Bibliotheques</h1>
      <p>Connecte en admin: {currentAdmin.username}</p>

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

      <p style={{ marginTop: "8px" }}>Gestion complete: decks, raretes, cartes et exemples.</p>

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


