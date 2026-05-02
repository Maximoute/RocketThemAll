import { getServerSession } from "next-auth";
import { authOptions } from "../../lib/auth";
import { prisma } from "@rta/database";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

const BOOSTER_TYPES = ["basic", "rare", "epic", "legendary"] as const;
type BoosterType = (typeof BOOSTER_TYPES)[number];

function getBoosterPrice(config: {
  basicBoosterPrice: number;
  rareBoosterPrice: number;
  epicBoosterPrice: number;
  legendaryBoosterPrice: number;
}, type: BoosterType) {
  if (type === "basic") return config.basicBoosterPrice;
  if (type === "rare") return config.rareBoosterPrice;
  if (type === "epic") return config.epicBoosterPrice;
  return config.legendaryBoosterPrice;
}

export default async function ShopPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.name) {
    redirect("/login");
  }

  const user = await prisma.user.findFirst({ where: { username: session.user.name } });
  if (!user) {
    return <section className="card">Utilisateur introuvable</section>;
  }

  async function buyBooster(formData: FormData) {
    "use server";

    const actionSession = await getServerSession(authOptions);
    if (!actionSession?.user?.name) {
      redirect("/login");
    }

    const actionUser = await prisma.user.findFirst({ where: { username: actionSession.user.name } });
    if (!actionUser) {
      return;
    }

    const boosterType = String(formData.get("boosterType") ?? "") as BoosterType;
    if (!BOOSTER_TYPES.includes(boosterType)) {
      return;
    }

    const config = await prisma.appConfig.upsert({ where: { id: "default" }, update: {}, create: { id: "default" } });
    const price = getBoosterPrice(config, boosterType);

    if (actionUser.credits < price) {
      return;
    }

    await prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id: actionUser.id }, data: { credits: { decrement: price } } });
      await tx.userBooster.upsert({
        where: { userId_boosterType: { userId: actionUser.id, boosterType } },
        update: { quantity: { increment: 1 } },
        create: { userId: actionUser.id, boosterType, quantity: 1 }
      });
      await tx.transactionLog.create({
        data: {
          userId: actionUser.id,
          type: "booster",
          amount: -price,
          metadata: { action: "buy_web", boosterType }
        }
      });
      await tx.economyLog.create({
        data: {
          userId: actionUser.id,
          type: "buy_booster",
          amount: price,
          metadata: { source: "web_shop", boosterType }
        }
      });
    });

    revalidatePath("/shop");
    revalidatePath("/profile");
  }

  const [config, boosters] = await Promise.all([
    prisma.appConfig.upsert({ where: { id: "default" }, update: {}, create: { id: "default" } }),
    prisma.userBooster.findMany({ where: { userId: user.id } })
  ]);

  const stock = new Map(boosters.map((row) => [row.boosterType, row.quantity]));

  return (
    <section className="card">
      <h1>Boutique Boosters</h1>
      <p>Crédits disponibles: {user.credits}</p>
      <p style={{ color: "var(--muted)" }}>Achète ici puis ouvre tes boosters sur Discord avec /booster open.</p>

      <div style={{ display: "grid", gap: "0.8rem", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
        {BOOSTER_TYPES.map((type) => {
          const price = getBoosterPrice(config, type);
          const canBuy = user.credits >= price;
          return (
            <article key={type} style={{ background: "var(--card)", borderRadius: "10px", padding: "0.9rem", border: "1px solid rgba(0,0,0,0.08)" }}>
              <h2 style={{ marginTop: 0, textTransform: "capitalize" }}>{type} booster</h2>
              <p>Prix: {price} crédits</p>
              <p>Stock: {stock.get(type) ?? 0}</p>
              <form action={buyBooster}>
                <input type="hidden" name="boosterType" value={type} />
                <button type="submit" disabled={!canBuy}>{canBuy ? "Acheter" : "Crédits insuffisants"}</button>
              </form>
            </article>
          );
        })}
      </div>
    </section>
  );
}
