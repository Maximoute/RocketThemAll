import Link from "next/link";

export default function CommunityPage() {
  return (
    <div className="grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
      <section className="rounded-2xl border border-rta-border bg-gradient-to-br from-rta-surface via-rta-surface to-[#13101b] p-7 sm:p-10">
        <p className="text-xs font-black uppercase tracking-[0.28em] text-rta-success">Communauté</p>
        <h1 className="mt-4 max-w-2xl text-4xl font-black tracking-tight sm:text-5xl">Une collection qui se construit ensemble.</h1>
        <p className="mt-5 max-w-2xl text-lg leading-8 text-rta-muted">Configure ton serveur, échange avec les autres joueurs et suis les accomplissements de la communauté RTA.</p>
      </section>
      <div className="grid gap-4">
        <Link href="/trades" className="rounded-2xl border border-rta-border bg-rta-surface p-6 hover:border-rta-cta"><h2 className="text-xl font-black">Échanges</h2><p className="mt-2 text-sm text-rta-muted">Proposer et confirmer des échanges sécurisés.</p></Link>
        <Link href="/setup" className="rounded-2xl border border-rta-border bg-rta-surface p-6 hover:border-rta-cta"><h2 className="text-xl font-black">Ajouter RTA</h2><p className="mt-2 text-sm text-rta-muted">Configurer Rocket Them All sur un serveur autorisé.</p></Link>
        <Link href="/achievements" className="rounded-2xl border border-rta-border bg-rta-surface p-6 hover:border-rta-cta"><h2 className="text-xl font-black">Achievements</h2><p className="mt-2 text-sm text-rta-muted">Découvrir les objectifs et la progression.</p></Link>
      </div>
    </div>
  );
}
