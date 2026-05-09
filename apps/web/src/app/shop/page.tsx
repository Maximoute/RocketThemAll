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

  const boosterConfig = [
    { type: "basic"     as const, emoji: "📦", name: "Booster Classique",  desc: "3 Common · 1 Uncommon · 1 Rare+",     featured: false, premium: false },
    { type: "rare"      as const, emoji: "🎰", name: "Booster Rare",       desc: "2 Uncommon · 2 Rare · 1 Import+",     featured: true,  premium: false },
    { type: "epic"      as const, emoji: "🔮", name: "Booster Épic",       desc: "1 Rare · 2 Import · 1 Exotic+",       featured: false, premium: false },
    { type: "legendary" as const, emoji: "👑", name: "Booster Légendaire", desc: "Garantit 1 Black Market · 4 Exotic",  featured: false, premium: true  },
  ] as const;

  return (
    <div>
      <div className="flex items-end justify-between gap-4 mb-6 flex-wrap">
        <div>
          <h1 className="text-3xl font-black tracking-tight">Boutique</h1>
          <p className="text-rta-muted text-sm mt-1">Dépense tes crédits pour ouvrir des boosters</p>
        </div>
        <div className="bg-rta-surface border border-rta-border rounded-xl px-5 py-3 text-right">
          <div className="text-[0.65rem] uppercase tracking-widest text-rta-muted">Ton solde</div>
          <div className="text-2xl font-black text-rta-gold">⚡ {user.credits.toLocaleString("fr-FR")} crédits</div>
        </div>
      </div>

      <p className="text-sm text-rta-muted mb-6">
        Achète ici puis ouvre tes boosters sur Discord avec <code className="bg-rta-surface2 px-1.5 py-0.5 rounded text-rta-ink text-xs">/booster open</code>.
      </p>

      <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))" }}>
        {boosterConfig.map(({ type, emoji, name, desc, featured, premium }) => {
          const price = getBoosterPrice(config, type);
          const canBuy = user.credits >= price;
          return (
            <article
              key={type}
              className={[
                "bg-rta-surface border rounded-xl overflow-hidden transition-transform duration-200 hover:-translate-y-1",
                premium  ? "border-rta-gold shadow-[0_0_18px_rgba(245,200,66,0.4)] animate-legendaryPulse" : "",
                featured && !premium ? "border-rta-cta shadow-[0_0_16px_rgba(242,130,65,0.35)]" : "",
                !featured && !premium ? "border-rta-border" : "",
              ].join(" ")}
            >
              <div className={[
                "aspect-[2/1] flex items-center justify-center text-5xl relative",
                premium  ? "bg-gradient-to-br from-rta-surface2 to-rta-gold/20" : "",
                featured ? "bg-gradient-to-br from-rta-surface2 to-rta-cta/15" : "",
                !featured && !premium ? "bg-gradient-to-b from-rta-surface2 to-rta-bg" : "",
              ].join(" ")}>
                {featured && <span className="absolute top-2 left-2 bg-rta-cta text-rta-bg text-[0.6rem] font-black uppercase px-2 py-0.5 rounded">🔥 Populaire</span>}
                {premium  && <span className="absolute top-2 left-2 bg-rta-gold text-rta-bg text-[0.6rem] font-black uppercase px-2 py-0.5 rounded">★ Premium</span>}
                {emoji}
              </div>
              <div className="p-4">
                <h2 className="font-bold text-rta-ink mb-1">{name}</h2>
                <p className="text-xs text-rta-muted mb-4">{desc}</p>
                <div className="flex items-center justify-between">
                  <span className={`text-lg font-black ${canBuy ? "text-rta-gold" : "text-rta-muted"}`}>
                    ⚡ {price.toLocaleString("fr-FR")}
                  </span>
                  <form action={buyBooster}>
                    <input type="hidden" name="boosterType" value={type} />
                    <button
                      type="submit"
                      disabled={!canBuy}
                      className={[
                        "px-4 py-1.5 rounded-lg text-sm font-bold transition-colors",
                        canBuy
                          ? "bg-rta-cta text-rta-bg hover:bg-rta-cta/90"
                          : "bg-rta-surface2 text-rta-muted cursor-not-allowed",
                      ].join(" ")}
                    >
                      {canBuy ? "Acheter" : "Insuffisant"}
                    </button>
                  </form>
                </div>
                <p className="text-xs text-rta-muted mt-2">En stock: {stock.get(type) ?? 0}</p>
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}
