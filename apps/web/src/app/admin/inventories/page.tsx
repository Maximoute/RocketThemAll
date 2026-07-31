import { prisma } from "@rta/database";
import { requireAdmin } from "../../../lib/guard";

type SearchParams = {
  userId?: string;
  category?: string;
};

export default async function AdminInventoriesPage({
  searchParams: searchParamsPromise
}: {
  searchParams: Promise<SearchParams>;
}) {
  const searchParams = await searchParamsPromise;
  await requireAdmin();
  const [inventories, userItems, equippedArtifacts] = await Promise.all([
    prisma.inventoryItem.findMany({
      where: {
        userId: searchParams.userId || undefined,
        card: {
          category: searchParams.category || undefined
        }
      },
      include: {
        user: true,
        card: true
      },
      orderBy: { quantity: "desc" },
      take: 200
    }),
    prisma.userItem.findMany({
      where: {
        userId: searchParams.userId || undefined,
        quantity: { gt: 0 }
      },
      include: { user: true, item: true },
      orderBy: [{ userId: "asc" }, { quantity: "desc" }],
      take: 200
    }),
    prisma.equippedArtifact.findMany({
      where: { userId: searchParams.userId || undefined },
      include: { user: true, item: true },
      orderBy: [{ userId: "asc" }, { slot: "asc" }]
    })
  ]);

  return (
    <section className="card">
      <h1>Admin Inventories</h1>
      <form method="GET" style={{ display: "flex", gap: "0.5rem", alignItems: "center", marginBottom: "1rem", flexWrap: "wrap" }}>
        <input
          name="userId"
          defaultValue={searchParams.userId ?? ""}
          placeholder="Filtre userId"
          style={{ padding: "0.35rem 0.6rem", borderRadius: "6px", border: "1px solid #ccc" }}
        />
        <input
          name="category"
          defaultValue={searchParams.category ?? ""}
          placeholder="Filtre category (ex: body, wheels, unknown)"
          style={{ padding: "0.35rem 0.6rem", borderRadius: "6px", border: "1px solid #ccc", minWidth: "260px" }}
        />
        <button type="submit" style={{ padding: "0.35rem 0.8rem", borderRadius: "6px", border: "1px solid #ccc", cursor: "pointer" }}>
          Filtrer
        </button>
        <a href="/admin/inventories" style={{ padding: "0.35rem 0.8rem", borderRadius: "6px", border: "1px solid #ccc", textDecoration: "none", color: "inherit" }}>
          Reinitialiser
        </a>
      </form>

      {searchParams.userId || searchParams.category ? (
        <p>
          Filtres actifs:
          {searchParams.userId ? ` userId=${searchParams.userId}` : ""}
          {searchParams.category ? ` category=${searchParams.category}` : ""}
        </p>
      ) : <p>Affichage global.</p>}
      <h2>Objets et artefacts</h2>
      <p>{userItems.length} pile(s) d’objets · {equippedArtifacts.length} artefact(s) équipé(s)</p>
      {userItems.map((entry) => {
        const equipped = equippedArtifacts.find((artifact) =>
          artifact.userId === entry.userId && artifact.itemId === entry.itemId
        );
        return (
          <article key={entry.id} className="card">
            <p><strong>{entry.user.username}</strong> — {entry.item.name}</p>
            <p>Quantité : {entry.quantity} · Type : {entry.item.type}</p>
            <p>{equipped ? `Équipé dans le slot ${equipped.slot}` : "Non équipé"}</p>
          </article>
        );
      })}

      <h2>Cartes possédées</h2>
      {inventories.map((inv) => (
        <article key={inv.id} className="card">
          <p>{inv.user.username} - {inv.card.name}</p>
          <p>Quantite: {inv.quantity}</p>
          <p>Category: {inv.card.category ?? "unknown"}</p>
        </article>
      ))}
    </section>
  );
}


