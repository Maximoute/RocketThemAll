import { prisma } from "@rta/database";
import { requireAdmin } from "../../../lib/guard";

type SearchParams = {
  userId?: string;
};

export default async function AdminInventoriesPage({ searchParams }: { searchParams: SearchParams }) {
  await requireAdmin();
  const inventories = await prisma.inventoryItem.findMany({
    where: {
      userId: searchParams.userId || undefined
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
      {searchParams.userId ? <p>Filtre utilisateur actif: {searchParams.userId}</p> : <p>Affichage global.</p>}
      {inventories.map((inv) => (
        <article key={inv.id} className="card">
          <p>{inv.user.username} - {inv.card.name}</p>
          <p>Quantite: {inv.quantity}</p>
        </article>
      ))}
    </section>
  );
}


