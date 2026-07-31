import type { Metadata } from "next";
import {
  LegalConfigurationWarning,
  LegalPage,
  LegalSection
} from "../../../components/legal-page";
import { getLegalIdentity, publicEmailHref } from "../../../lib/legal";

export const metadata: Metadata = {
  title: "Rétractation · Rocket Them All",
  description: "Procédure et modèle de rétractation pour un achat Rocket Them All."
};

export default function WithdrawalPage() {
  const identity = getLegalIdentity();
  const withdrawalHref = publicEmailHref(
    identity.publisherEmail,
    "Rétractation — achat Rocket Them All"
  );

  return (
    <LegalPage
      title="Rétractation"
      summary="Procédure prévue pour exercer le droit de rétractation applicable à un futur achat ou abonnement RTA conclu à distance."
    >
      <LegalConfigurationWarning missing={identity.missing} />

      <LegalSection title="1. Délai">
        <p>
          Le consommateur dispose en principe de 14 jours calendrier à compter
          de la conclusion du contrat de service numérique pour communiquer sa
          décision, sans justification.
        </p>
        <p>
          Ce droit et ses éventuelles exceptions dépendent des conditions
          légales rappelées dans les conditions de vente. Le simple fait qu’un
          produit soit numérique ne supprime pas automatiquement le droit de
          rétractation.
        </p>
      </LegalSection>

      <LegalSection title="2. Envoyer la demande">
        <p>
          La demande peut être envoyée par une déclaration claire à{" "}
          {withdrawalHref
            ? <a href={withdrawalHref}>{identity.publisherEmail}</a>
            : identity.publisherEmail}
          , ou à l’adresse {identity.publisherAddress}. Conservez une preuve de
          l’envoi.
        </p>
        <p>
          Pour accélérer le traitement, indiquez l’identifiant Discord, le nom
          de l’offre, la date, le prix, le canal de paiement et l’identifiant de
          commande Stripe ou Discord. Ne transmettez jamais de numéro complet
          de carte bancaire.
        </p>
      </LegalSection>

      <LegalSection title="3. Modèle de formulaire">
        <div className="whitespace-pre-wrap rounded-lg border border-rta-border bg-rta-bg p-4 font-mono text-xs leading-6 text-rta-ink">
{`À l’attention de :
${identity.publisherName}
${identity.publisherAddress}
${identity.publisherEmail}

Je vous notifie par la présente ma rétractation du contrat portant sur :
[nom de l’abonnement ou de l’achat RTA]

Commandé le : [date]
Canal de paiement : [Stripe ou Discord]
Identifiant de commande : [identifiant]
Identifiant Discord : [identifiant numérique]
Nom du consommateur : [nom]
Adresse du consommateur : [adresse]

Date :
Signature, uniquement en cas d’envoi papier :`}
        </div>
      </LegalSection>

      <LegalSection title="4. Effets">
        <p>
          Lorsque la rétractation est valable, les sommes dues sont remboursées
          selon le moyen et les délais légaux applicables. L’avantage numérique
          correspondant peut être retiré. Stripe ou Discord peut devoir
          intervenir pour exécuter techniquement le remboursement, selon le
          canal d’achat.
        </p>
      </LegalSection>

      <LegalSection title="5. Livraison numérique immédiate">
        <p>
          Avant un achat sur le site, RTA demande séparément au consommateur de
          solliciter la livraison ou l’activation immédiate et de reconnaître
          la conséquence légale sur son droit de rétractation. Pour un pack de
          crédits, l’exécution est pleinement réalisée lorsque les crédits ont
          été ajoutés au solde. Si les conditions légales de l’exception ne sont
          pas toutes réunies, le droit de rétractation demeure applicable.
        </p>
      </LegalSection>

      <LegalSection title="6. Aide officielle">
        <p>
          Le SPF Économie fournit des informations et un modèle concernant les{" "}
          <a
            href="https://economie.fgov.be/fr/themes/ventes/reglementation/delais-de-retractation"
            target="_blank"
            rel="noreferrer"
          >
            délais de rétractation
          </a>.
        </p>
      </LegalSection>
    </LegalPage>
  );
}
