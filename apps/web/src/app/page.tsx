import Link from "next/link";
import { prisma } from "@rta/database";

export default async function HomePage() {
  const [cardCount, userCount] = await Promise.all([
    prisma.inventoryItem.aggregate({ _sum: { quantity: true } }).catch(() => ({ _sum: { quantity: 0 } })),
    prisma.user.count().catch(() => 0),
  ]);

  const totalCards = cardCount._sum.quantity ?? 0;

  return (
    <div>
      {/* Hero */}
      <section className="relative bg-gradient-to-br from-rta-surface via-rta-surface2 to-rta-bg border border-rta-border rounded-2xl p-12 text-center mb-6 overflow-hidden">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-80 h-80 bg-rta-accent/20 rounded-full blur-3xl pointer-events-none" />
        <div className="relative z-10">
          <p className="text-6xl mb-4">🚀</p>
          <h1 className="text-4xl font-black tracking-tight mb-2">
            Rocket <span className="text-rta-cta">Them All</span>
          </h1>
          <p className="text-rta-muted text-base mb-7">
            Collectionne des cartes sur Discord · Suis ta progression sur le web
          </p>
          <div className="flex gap-3 justify-center flex-wrap">
            <Link href="/inventory" className="px-5 py-2.5 bg-rta-cta text-rta-bg font-bold rounded-lg hover:bg-rta-cta/90 transition-colors">
              Voir mon inventaire →
            </Link>
            <Link href="/shop" className="px-5 py-2.5 border border-rta-success text-rta-success font-bold rounded-lg hover:bg-rta-success/10 transition-colors">
              Boutique
            </Link>
          </div>
        </div>
      </section>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        {[
          { value: totalCards.toLocaleString("fr-FR"), label: "Cartes collectées", color: "text-rta-success" },
          { value: userCount.toLocaleString("fr-FR"), label: "Joueurs inscrits",    color: "text-rta-cta"    },
          { value: "Multi-univers",                    label: "Univers disponibles", color: "text-rta-gold"  },
        ].map(({ value, label, color }) => (
          <div key={label} className="bg-rta-surface border border-rta-border rounded-xl p-4 text-center">
            <div className={`text-2xl font-black ${color}`}>{value}</div>
            <div className="text-[0.68rem] uppercase tracking-widest text-rta-muted mt-1">{label}</div>
          </div>
        ))}
      </div>

      {/* Quick links */}
      <div className="grid grid-cols-2 gap-4">
        {[
          { href: "/profile",   emoji: "👤", title: "Profil",     desc: "Niveau, XP, historique" },
          { href: "/inventory", emoji: "🃏", title: "Inventaire", desc: "Tes cartes collectées"  },
          { href: "/shop",      emoji: "🛒", title: "Boutique",   desc: "Achète des boosters"    },
          { href: "/trades",    emoji: "🔄", title: "Trades",     desc: "Échange avec d'autres"  },
        ].map(({ href, emoji, title, desc }) => (
          <Link key={href} href={href} className="bg-rta-surface border border-rta-border rounded-xl p-5 flex items-center gap-4 hover:border-rta-accentHi hover:bg-rta-surface2 transition-colors group">
            <span className="text-3xl">{emoji}</span>
            <div>
              <div className="font-bold text-rta-ink group-hover:text-rta-cta transition-colors">{title}</div>
              <div className="text-xs text-rta-muted mt-0.5">{desc}</div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
