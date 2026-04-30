import { getServerSession } from "next-auth";
import { authOptions } from "../../lib/auth";
import { prisma } from "@rta/database";
import { redirect } from "next/navigation";

export default async function TradesPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.name) {
    redirect("/login");
  }

  const user = await prisma.user.findFirst({ where: { username: session.user.name } });
  if (!user) {
    return <section className="card">Utilisateur introuvable</section>;
  }

  const trades = await prisma.trade.findMany({
    where: {
      OR: [{ user1Id: user.id }, { user2Id: user.id }]
    },
    include: { items: true },
    orderBy: { createdAt: "desc" }
  });

  return (
    <section className="card">
      <h1>Trades</h1>
      {trades.map((trade) => (
        <article key={trade.id} className="card">
          <p>ID: {trade.id}</p>
          <p>Status: {trade.status}</p>
          <p>Items: {trade.items.length}</p>
        </article>
      ))}
    </section>
  );
}


