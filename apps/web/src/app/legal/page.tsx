import type { Metadata } from "next";
import Link from "next/link";
import {
  LegalConfigurationWarning,
  LegalPage
} from "../../components/legal-page";
import { getLegalIdentity } from "../../lib/legal";

export const metadata: Metadata = {
  title: "Centre légal · Rocket Them All",
  description:
    "Mentions légales, conditions, confidentialité, cookies et informations consommateurs de Rocket Them All."
};

const documents = [
  {
    href: "/legal/mentions-legales",
    icon: "🏢",
    title: "Mentions légales",
    description: "Identité de l’éditeur, hébergement, propriété intellectuelle et contact."
  },
  {
    href: "/legal/conditions-utilisation",
    icon: "📜",
    title: "Conditions d’utilisation",
    description: "Règles d’accès à RTA, comptes Discord, conduite et actifs virtuels."
  },
  {
    href: "/legal/confidentialite",
    icon: "🛡️",
    title: "Confidentialité et RGPD",
    description: "Données traitées, finalités, durées, destinataires et droits."
  },
  {
    href: "/legal/cookies",
    icon: "🍪",
    title: "Politique de cookies",
    description: "Cookies techniques de connexion et absence actuelle de traçage publicitaire."
  },
  {
    href: "/legal/conditions-vente",
    icon: "🧾",
    title: "Conditions de vente",
    description: "Cadre belge prévu pour les futurs abonnements et achats Premium Apps."
  },
  {
    href: "/legal/retractation",
    icon: "↩️",
    title: "Rétractation",
    description: "Délai, procédure et modèle de demande pour les achats à distance."
  }
] as const;

export default function LegalHubPage() {
  const identity = getLegalIdentity();
  return (
    <LegalPage
      title="Centre légal"
      summary="Les documents publics nécessaires à l’utilisation de Rocket Them All via le web et Discord sont regroupés ici."
    >
      <LegalConfigurationWarning missing={identity.missing} />
      <div className="grid gap-4 sm:grid-cols-2">
        {documents.map((document) => (
          <Link
            key={document.href}
            href={document.href}
            className="group rounded-xl border border-rta-border bg-rta-surface p-5 transition-colors hover:border-rta-cta hover:bg-rta-surface2"
          >
            <span className="text-2xl" aria-hidden="true">{document.icon}</span>
            <h2 className="mt-3 font-black text-rta-ink group-hover:text-rta-cta">
              {document.title}
            </h2>
            <p className="mt-2 text-sm leading-6 text-rta-muted">
              {document.description}
            </p>
          </Link>
        ))}
      </div>
      <aside className="rounded-xl border border-rta-border bg-rta-bg p-5 text-sm leading-6 text-rta-muted">
        Ces documents ont été structurés d’après les exigences de Discord, du
        RGPD et du droit belge du commerce électronique. Ils doivent être relus
        par un professionnel du droit avant le lancement d’une offre payante.
      </aside>
    </LegalPage>
  );
}
