import Link from "next/link";

const destinations = [
  { href: "/collection", eyebrow: "Découvrir", title: "Collection", description: "Parcours les cartes et les univers disponibles." },
  { href: "/inventory", eyebrow: "Tes cartes", title: "Inventaire", description: "Retrouve chaque carte obtenue sur Discord." },
  { href: "/skills", eyebrow: "Progression", title: "Compétences", description: "Consulte tes arbres et tes choix de spécialisation." },
  { href: "/collection/reactor", eyebrow: "Atelier", title: "Réacteur", description: "Prépare tes transformations depuis ton espace de jeu." },
] as const;

export default function PlayPage() {
  return (
    <div>
      <header className="mb-8 max-w-3xl">
        <p className="text-xs font-black uppercase tracking-[0.28em] text-rta-cta">Centre de jeu</p>
        <h1 className="mt-3 text-4xl font-black tracking-tight sm:text-5xl">Jouer à Rocket Them All</h1>
        <p className="mt-4 text-lg leading-8 text-rta-muted">Le gameplay reste sur Discord. Le web rassemble ici ta collection, ta progression et tes outils.</p>
      </header>
      <div className="grid gap-4 md:grid-cols-2">
        {destinations.map((item, index) => (
          <Link key={item.href} href={item.href} className="group relative overflow-hidden rounded-2xl border border-rta-border bg-rta-surface p-6 transition hover:-translate-y-1 hover:border-rta-accentHi">
            <span className="absolute right-5 top-4 text-5xl font-black text-white/[0.04]">0{index + 1}</span>
            <p className="text-[0.65rem] font-black uppercase tracking-[0.22em] text-rta-cta">{item.eyebrow}</p>
            <h2 className="mt-3 text-2xl font-black text-rta-ink group-hover:text-rta-cta">{item.title}</h2>
            <p className="mt-2 max-w-md text-sm leading-6 text-rta-muted">{item.description}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
