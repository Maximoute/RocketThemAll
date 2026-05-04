import { prisma } from "@rta/database";
import { requireAdmin } from "../../../lib/guard";

type SearchParams = {
  userId?: string;
  category?: string;
};

export default async function AdminInventoriesPage({ searchParams }: { searchParams: SearchParams }) {
  await requireAdmin();
  const inventories = await prisma.inventoryItem.findMany({
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
  });

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


