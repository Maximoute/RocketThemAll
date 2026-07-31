import type { ReactNode } from "react";
import { LEGAL_LAST_UPDATED, LEGAL_VERSION } from "../lib/legal";

export function LegalPage({
  title,
  summary,
  children
}: {
  title: string;
  summary: string;
  children: ReactNode;
}) {
  return (
    <article className="mx-auto max-w-4xl">
      <header className="mb-7 rounded-2xl border border-rta-border bg-gradient-to-br from-rta-surface to-rta-bg p-6 sm:p-8">
        <p className="mb-2 text-xs font-bold uppercase tracking-[0.2em] text-rta-cta">
          Informations légales
        </p>
        <h1 className="text-3xl font-black tracking-tight sm:text-4xl">{title}</h1>
        <p className="mt-3 max-w-3xl leading-7 text-rta-muted">{summary}</p>
        <p className="mt-4 text-xs text-rta-muted">
          Version {LEGAL_VERSION} · Dernière mise à jour : {LEGAL_LAST_UPDATED}
        </p>
      </header>
      <div className="legal-content space-y-7">{children}</div>
    </article>
  );
}
export function LegalSection({
  title,
  children,
  id
}: {
  title: string;
  children: ReactNode;
  id?: string;
}) {
  return (
    <section
      id={id}
      className="scroll-mt-28 rounded-xl border border-rta-border bg-rta-surface/65 p-5 sm:p-6"
    >
      <h2 className="mb-3 text-xl font-black text-rta-ink">{title}</h2>
      <div className="space-y-3 text-sm leading-7 text-rta-muted">{children}</div>
    </section>
  );
}

export function LegalConfigurationWarning({ missing }: { missing: string[] }) {
  if (missing.length === 0) return null;
  return (
    <aside className="mb-7 rounded-xl border border-rta-gold/60 bg-rta-gold/10 p-5">
      <h2 className="font-black text-rta-gold">
        Coordonnées de l’éditeur à compléter avant la mise en production
      </h2>
      <p className="mt-2 text-sm leading-6 text-rta-ink">
        Les textes sont en place, mais une page légale belge ne peut pas inventer
        l’identité ou l’adresse de son éditeur. Variables manquantes :
      </p>
      <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-rta-muted">
        {missing.map((label) => <li key={label}>{label}</li>)}
      </ul>
    </aside>
  );
}
