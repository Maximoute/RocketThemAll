import Link from "next/link";

export const metadata = {
  title: "403 — Accès administrateur requis",
  robots: { index: false, follow: false, noarchive: true },
};

export default function ForbiddenPage() {
  return (
    <section className="mx-auto flex min-h-[60vh] max-w-2xl items-center px-4 py-16">
      <div className="relative w-full overflow-hidden rounded-2xl border border-rta-border bg-rta-surface p-8 shadow-[0_0_60px_rgba(72,28,166,0.3)] sm:p-12">
        <div className="absolute -right-16 -top-16 h-48 w-48 rounded-full bg-rta-cta/10 blur-3xl" />
        <p className="mb-3 text-xs font-black uppercase tracking-[0.28em] text-rta-cta">
          Environnement privé
        </p>
        <h1 className="text-4xl font-black tracking-tight text-rta-ink sm:text-5xl">
          403
        </h1>
        <h2 className="mt-3 text-xl font-bold text-rta-ink sm:text-2xl">
          Accès réservé aux administrateurs RTA
        </h2>
        <p className="mt-4 max-w-xl leading-7 text-rta-muted">
          Votre compte Discord est connecté, mais il ne dispose pas des droits
          nécessaires pour consulter la version de développement.
        </p>
        <Link
          href="https://rocketthemall.com"
          className="mt-8 inline-flex rounded-lg bg-rta-cta px-5 py-3 text-sm font-black text-rta-bg transition-transform hover:-translate-y-0.5"
        >
          Retourner sur Rocket Them All
        </Link>
      </div>
    </section>
  );
}
