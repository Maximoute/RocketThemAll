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
    include: { items: { include: { card: true } }, user1: true, user2: true },
    orderBy: { createdAt: "desc" }
  });

  return (
    <section className="card">
      <h1>Trades</h1>
      {trades.map((trade) => (
        <article key={trade.id} className="card">
          <p>ID: {trade.id}</p>
          <p>Status: {trade.status}</p>
          <p>{trade.user1.username} ↔ {trade.user2.username}</p>
          <p>Crédits proposés: {trade.user1.username} {trade.user1Credits} | {trade.user2.username} {trade.user2Credits}</p>
          <p>Items: {trade.items.length}</p>
          {trade.items.length > 0 && (
            <ul>
              {trade.items.map((item) => (
                <li key={item.id}>
                  {item.userId === trade.user1Id ? trade.user1.username : trade.user2.username} propose {item.quantity}x {item.card.name}
                </li>
              ))}
            </ul>
          )}
        </article>
      ))}
    </section>
  );
}


