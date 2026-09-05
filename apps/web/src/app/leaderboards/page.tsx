export default function LeaderboardsPage() {
  return (
    <div>
      <header className="mb-8 max-w-3xl">
        <p className="text-xs font-black uppercase tracking-[0.28em] text-rta-gold">Classements</p>
        <h1 className="mt-3 text-4xl font-black tracking-tight sm:text-5xl">Les légendes RTA</h1>
        <p className="mt-4 text-lg leading-8 text-rta-muted">Cette nouvelle page prépare l’accueil des classements existants sans introduire de nouvelle mécanique de jeu.</p>
      </header>
      <section className="relative overflow-hidden rounded-2xl border border-rta-border bg-rta-surface p-8 sm:p-12">
        <div className="absolute -right-12 -top-12 h-52 w-52 rounded-full bg-rta-gold/10 blur-3xl" />
        <p className="text-sm font-bold text-rta-cta">En préparation sur RTA Web V2</p>
        <h2 className="mt-3 text-2xl font-black">Classements joueurs et serveurs</h2>
        <p className="mt-3 max-w-2xl leading-7 text-rta-muted">L’interface sera branchée sur les scores déjà calculés par les services RTA après validation de la présentation et des règles de confidentialité.</p>
      </section>
    </div>
  );
}
