import Link from "next/link";
import { unstable_cache } from "next/cache";
import { prisma } from "@rta/database";
import PlayerLink from "../components/player-link";

export const dynamic = "force-dynamic";

const getPublicCatalogPreview = unstable_cache(
  async () => {
    const [cardCount, worldCount, cards] = await Promise.all([
      prisma.card.count({ where: { status: "PUBLISHED", isActive: true } }).catch(() => 0),
      prisma.worldDefinition.count({ where: { status: "PUBLISHED" } }).catch(() => 0),
      prisma.card.findMany({
        where: { status: "PUBLISHED", isActive: true },
        orderBy: { name: "asc" },
        take: 4,
        select: {
          id: true,
          name: true,
          imageUrl: true,
          deck: { select: { name: true } },
          rarity: { select: { name: true } },
        },
      }).catch(() => []),
    ]);

    return { cardCount, worldCount, cards };
  },
  ["home-public-catalog-preview"],
  { revalidate: 300 }
);

const FEATURE_LINKS = [
  { href: "/profile", eyebrow: "Progression", title: "Ton profil", desc: "Niveau, expérience et historique de collection.", icon: "✦" },
  { href: "/inventory", eyebrow: "Collection", title: "Ton inventaire", desc: "Retrouve les cartes capturées depuis Discord.", icon: "◈" },
  { href: "/skills", eyebrow: "Évolution", title: "Tes compétences", desc: "Parcours tes arbres et prépare ta prochaine étape.", icon: "⌁" },
] as const;

export default async function HomePage() {
  // Public landing data only: never touch a player's account or inventory here.
  const { cardCount, worldCount, cards } = await getPublicCatalogPreview();

  return (
    <div className="space-y-8 pb-10">
      <section className="relative isolate overflow-hidden rounded-[2rem] border border-white/10 bg-[#100b1d] px-6 py-16 shadow-2xl shadow-black/30 sm:px-12 sm:py-24 lg:px-16">
        <div className="absolute -left-20 top-10 h-72 w-72 rounded-full bg-rta-accent/30 blur-[100px]" />
        <div className="absolute -right-24 bottom-0 h-80 w-80 rounded-full bg-rta-cta/20 blur-[110px]" />
        <div className="absolute inset-0 opacity-40 [background-image:linear-gradient(rgba(255,255,255,.04)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.04)_1px,transparent_1px)] [background-size:42px_42px]" />

        <div className="relative z-10 max-w-3xl">
          <span className="inline-flex items-center gap-2 rounded-full border border-rta-cta/30 bg-rta-cta/10 px-3 py-1 text-[0.68rem] font-black uppercase tracking-[0.24em] text-rta-cta">
            <span className="h-1.5 w-1.5 rounded-full bg-rta-cta shadow-[0_0_12px_currentColor]" />
            L&apos;aventure communautaire
          </span>
          <h1 className="mt-6 text-4xl font-black leading-[0.95] tracking-[-0.045em] text-white sm:text-6xl lg:text-7xl">
            Capture. Collectionne.
            <span className="mt-2 block bg-gradient-to-r from-rta-cta via-[#ffb176] to-rta-gold bg-clip-text text-transparent">
              Rocket Them All.
            </span>
          </h1>
          <p className="mt-6 max-w-2xl text-base leading-7 text-rta-muted sm:text-lg">
            Un univers de cartes connecté à Discord. Découvre les collections, suis ta progression et retrouve la communauté au même endroit.
          </p>
          <div className="mt-9 flex flex-wrap gap-3">
            <PlayerLink href="/inventory" className="rounded-xl bg-rta-cta px-6 py-3 text-sm font-black text-[#170d08] shadow-lg shadow-rta-cta/20 transition hover:-translate-y-0.5 hover:bg-[#ff9d64]">
              Explorer mon inventaire →
            </PlayerLink>
            <Link href="/collection" className="rounded-xl border border-white/15 bg-white/5 px-6 py-3 text-sm font-bold text-white backdrop-blur transition hover:border-rta-cta/50 hover:bg-white/10">
              Voir les collections
            </Link>
          </div>
        </div>

        <div className="relative z-10 mt-14 grid max-w-3xl grid-cols-3 gap-3 border-t border-white/10 pt-7">
          {[
            { value: cardCount.toLocaleString("fr-FR"), label: "Cartes" },
            { value: worldCount.toLocaleString("fr-FR"), label: "Mondes" },
            { value: "24/7", label: "Sur Discord" },
          ].map(({ value, label }) => (
            <div key={label}>
              <div className="text-xl font-black text-white sm:text-2xl">{value}</div>
              <div className="mt-1 text-[0.62rem] font-bold uppercase tracking-[0.18em] text-rta-muted">{label}</div>
            </div>
          ))}
        </div>
      </section>

      <section>
        <div className="mb-4 flex items-end justify-between gap-4">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.24em] text-rta-cta">Marketplace</p>
            <h2 className="mt-2 text-2xl font-black tracking-tight text-white sm:text-3xl">Cartes à découvrir</h2>
          </div>
          <Link href="/collection" className="text-sm font-bold text-rta-muted transition hover:text-rta-cta">Tout explorer →</Link>
        </div>

        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {cards.length > 0 ? cards.map((card) => (
            <Link key={card.id} href="/collection" className="group overflow-hidden rounded-2xl border border-rta-border bg-rta-surface transition hover:-translate-y-1 hover:border-rta-accentHi hover:shadow-xl hover:shadow-rta-accent/10">
              <div className="aspect-[4/5] overflow-hidden bg-gradient-to-br from-rta-surface2 to-rta-bg">
                {card.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={card.imageUrl} alt="" className="h-full w-full object-cover transition duration-500 group-hover:scale-105" />
                ) : (
                  <div className="flex h-full items-center justify-center text-5xl text-rta-accentHi">◈</div>
                )}
              </div>
              <div className="p-4">
                <div className="truncate text-sm font-black text-white">{card.name}</div>
                <div className="mt-2 flex items-center justify-between gap-2 text-[0.65rem] font-bold uppercase tracking-wider text-rta-muted">
                  <span className="truncate">{card.deck.name}</span>
                  <span className="text-rta-cta">{card.rarity.name}</span>
                </div>
              </div>
            </Link>
          )) : Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="overflow-hidden rounded-2xl border border-rta-border bg-rta-surface">
              <div className="flex aspect-[4/5] items-center justify-center bg-gradient-to-br from-rta-surface2 to-rta-bg text-5xl text-rta-accentHi">◈</div>
              <div className="p-4 text-sm font-bold text-rta-muted">Collection à venir</div>
            </div>
          ))}
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        {FEATURE_LINKS.map(({ href, eyebrow, title, desc, icon }) => (
          <PlayerLink key={href} href={href} className="group rounded-2xl border border-rta-border bg-rta-surface p-6 transition hover:border-rta-accentHi hover:bg-rta-surface2">
            <div className="flex items-center justify-between">
              <span className="text-[0.65rem] font-black uppercase tracking-[0.2em] text-rta-cta">{eyebrow}</span>
              <span className="text-2xl text-rta-accentHi transition group-hover:rotate-12 group-hover:scale-110">{icon}</span>
            </div>
            <h3 className="mt-8 text-xl font-black text-white">{title}</h3>
            <p className="mt-2 text-sm leading-6 text-rta-muted">{desc}</p>
          </PlayerLink>
        ))}
      </section>

      <section className="relative overflow-hidden rounded-2xl border border-rta-cta/25 bg-gradient-to-r from-rta-accent/25 via-rta-surface to-rta-cta/10 p-7 sm:p-10">
        <div className="relative z-10 max-w-2xl">
          <p className="text-xs font-black uppercase tracking-[0.22em] text-rta-cta">Prêt à jouer ?</p>
          <h2 className="mt-3 text-2xl font-black text-white sm:text-3xl">Rejoins Rocket Them All sur Discord</h2>
          <p className="mt-3 text-sm leading-6 text-rta-muted">Le jeu reste sur Discord ; ce site devient ton portail pour consulter, comprendre et piloter ta progression.</p>
          <Link href="/play" className="mt-6 inline-flex rounded-xl bg-white px-5 py-2.5 text-sm font-black text-rta-bg transition hover:bg-rta-cta">Comment jouer →</Link>
        </div>
      </section>
    </div>
  );
}
