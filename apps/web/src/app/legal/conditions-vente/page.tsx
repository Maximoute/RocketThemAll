import type { Metadata } from "next";
import {
  LegalConfigurationWarning,
  LegalPage,
  LegalSection
} from "../../../components/legal-page";
import { getLegalIdentity, publicEmailHref } from "../../../lib/legal";
import {
  discordMonetizationEnabled,
  formatEuro,
  MONETIZATION_PRODUCTS
} from "@rta/services";
import { paymentsEnabled } from "../../../lib/stripe";

export const metadata: Metadata = {
  title: "Conditions de vente · Rocket Them All",
  description:
    "Conditions applicables aux futurs abonnements et achats numériques Rocket Them All."
};

export default function TermsOfSalePage() {
  const identity = getLegalIdentity();
  const offersEnabled = paymentsEnabled() || discordMonetizationEnabled();
  const supportHref = publicEmailHref(
    identity.publisherEmail,
    "Achat ou abonnement RTA"
  );

  return (
    <LegalPage
      title="Conditions générales de vente"
      summary={
        offersEnabled
          ? "Conditions applicables aux abonnements et achats numériques Rocket Them All proposés via Stripe ou Discord Premium Apps."
          : "Le catalogue payant RTA est techniquement préparé mais reste désactivé tant que la configuration commerciale, légale et fiscale n’est pas terminée."
      }
    >
      <LegalConfigurationWarning missing={identity.missing} />

      <LegalSection title="1. Vendeur et champ d’application">
        <p>
          Le vendeur est {identity.publisherName}, {identity.publisherStatus},
          établi à {identity.publisherAddress}, BCE {identity.enterpriseNumber},
          TVA {identity.vatNumber}. Contact :{" "}
          {supportHref
            ? <a href={supportHref}>{identity.publisherEmail}</a>
            : identity.publisherEmail}
          , {identity.publisherPhone}.
        </p>
        <p>
          Les présentes conditions générales de vente (« CGV ») s’appliquent aux
          offres numériques RTA proposées aux consommateurs. Les caractéristiques,
          avantages, compatibilités, durée et prix propres à chaque offre sont
          affichés avant la commande et complètent ces CGV.
        </p>
      </LegalSection>

      <LegalSection title="2. Offres">
        <p>Le catalogue RTA comprend les offres suivantes :</p>
        <ul>
          <li>
            <strong>RTA VIP :</strong>{" "}
            {formatEuro(MONETIZATION_PRODUCTS.vip_monthly.priceCents)} par mois,
            badge VIP et une charge d’exploration maximale supplémentaire ;
          </li>
          <li>
            <strong>Fondateur RTA :</strong>{" "}
            {formatEuro(MONETIZATION_PRODUCTS.founder_monthly.priceCents)} par
            mois, mêmes avantages de jeu que VIP et badge Fondateur distinctif ;
          </li>
          <li>
            <strong>Pack 1 000 crédits :</strong>{" "}
            {formatEuro(MONETIZATION_PRODUCTS.credits_1000.priceCents)}, achat unique ;
          </li>
          <li>
            <strong>Pack 12 000 crédits :</strong>{" "}
            {formatEuro(MONETIZATION_PRODUCTS.credits_12000.priceCents)}, achat
            unique comprenant 10 000 crédits et 2 000 crédits offerts.
          </li>
        </ul>
        <p>
          Les packs créditent directement le solde normal du jeu : aucune
          monnaie premium intermédiaire n’est créée. Un achat n’accorde que le
          droit d’utiliser l’avantage décrit dans RTA. Les crédits et actifs
          virtuels ne sont ni convertibles en argent, ni transférables hors RTA.
        </p>
      </LegalSection>

      <LegalSection title="3. Prix et taxes">
        <p>
          Le prix total et les taxes applicables sont indiqués dans la devise
          affichée avant la validation. Aucun supplément non annoncé ne peut être
          ajouté par RTA après la confirmation.
        </p>
        <p>
          Pour un achat sur le site, Stripe gère le formulaire de paiement
          hébergé, le moyen de paiement et le reçu. Lorsque l’offre est achetée
          via Discord Premium Apps, Discord gère
          l’interface de paiement, la conversion locale, le reçu et son
          prestataire de paiement. Les éventuels frais propres à la plateforme
          ou au canal de distribution sont affichés avant la commande.
        </p>
        <p>
          Les prix RTA sont affichés en euros, toutes taxes comprises lorsque la
          taxe est applicable. Le montant final affiché par Stripe ou Discord
          avant la validation prévaut. Une différence de prix entre canaux peut
          résulter des paliers tarifaires ou taxes imposés par la plateforme.
        </p>
      </LegalSection>

      <LegalSection title="4. Commande et formation du contrat">
        <p>
          Avant de payer, le consommateur peut vérifier l’offre, le prix, la
          durée et le caractère récurrent éventuel. La commande devient ferme
          après l’action clairement identifiée comme entraînant une obligation
          de paiement et la confirmation par la plateforme.
        </p>
        <p>
          La confirmation et le reçu sont fournis sur un support durable par la
          plateforme de paiement. L’identifiant de commande doit être conservé
          pour toute demande de support.
        </p>
      </LegalSection>

      <LegalSection title="5. Abonnements">
        <p>
          Un abonnement est renouvelé selon la période et le prix affichés
          jusqu’à sa résiliation. L’utilisateur peut le gérer et le résilier
          dans le portail client Stripe ou dans les paramètres d’abonnements
          Discord, selon le canal d’achat. La résiliation met fin au
          renouvellement; sauf indication ou droit contraire, l’avantage reste
          accessible jusqu’à la fin de la période déjà payée.
        </p>
        <p>
          Une hausse de prix ne s’applique qu’après l’information et le
          consentement requis. Stripe ou Discord peut conserver l’ancien prix
          pour un abonnement existant selon les règles affichées dans son interface.
        </p>
      </LegalSection>

      <LegalSection title="6. Livraison et activation">
        <p>
          L’avantage numérique est activé sans retard injustifié après la
          confirmation d’un webhook Stripe signé ou la réception d’un
          entitlement Discord valide. Le simple retour du navigateur vers le
          site ne suffit jamais à attribuer un achat. En cas d’échec,
          l’utilisateur doit communiquer son identifiant Discord, le produit et
          l’identifiant de commande au support.
        </p>
        <p>
          La commande Stripe ou l’entitlement Discord vérifié côté serveur
          constitue la preuve technique de l’accès. Un achat remboursé, annulé,
          contesté ou frauduleux peut entraîner le retrait des crédits ou de
          l’avantage correspondant, sans affecter les droits légaux du consommateur.
        </p>
      </LegalSection>

      <LegalSection title="7. Droit de rétractation">
        <p>
          Le consommateur dispose en principe de 14 jours calendrier à compter
          de la conclusion du contrat à distance pour se rétracter sans devoir
          motiver sa décision.
        </p>
        <p>
          Une exception pour un contenu ou service numérique ne peut être
          invoquée que si toutes les conditions légales sont remplies, notamment
          l’accord préalable exprès pour commencer l’exécution et la
          reconnaissance de la conséquence sur le droit de rétractation lorsque
          la loi l’exige. À défaut, le droit légal demeure applicable. Le modèle
          et la procédure figurent sur la page Rétractation.
        </p>
      </LegalSection>

      <LegalSection title="8. Conformité et support">
        <p>
          Les contenus et services numériques bénéficient de la garantie légale
          de conformité applicable. Une défaillance doit être signalée au
          support avec les informations nécessaires. Les remèdes prévus par le
          droit belge ne sont pas limités par une garantie commerciale.
        </p>
      </LegalSection>

      <LegalSection title="9. Remboursements">
        <p>
          Pour Stripe, l’utilisateur contacte d’abord le support RTA avec son
          identifiant de commande. Pour Discord, les demandes relevant du
          paiement, d’une facturation en double ou du processus de remboursement
          doivent également utiliser les outils de support Discord. RTA traite
          les défauts d’activation et les droits relevant de l’offre.
        </p>
        <p>
          Aucune clause ne prive le consommateur d’un remboursement ou d’un
          autre remède obligatoire prévu par la loi.
        </p>
      </LegalSection>

      <LegalSection title="10. Mineurs">
        <p>
          Un utilisateur mineur ne peut acheter que s’il possède la capacité
          requise et l’autorisation de son représentant légal lorsque celle-ci
          est nécessaire. Le représentant légal est invité à contrôler les
          achats et abonnements associés au compte Discord du mineur.
        </p>
      </LegalSection>

      <LegalSection title="11. Réclamations et médiation">
        <p>
          Une réclamation doit d’abord être envoyée au vendeur. Sans solution
          amiable, le consommateur peut contacter le{" "}
          <a
            href="https://mediationconsommateur.be/"
            target="_blank"
            rel="noreferrer"
          >
            Service de Médiation pour le Consommateur
          </a>
          , Boulevard du Roi Albert II 8 bte 1, 1000 Bruxelles,
          contact@mediationconsommateur.be, +32 2 702 52 20.
        </p>
      </LegalSection>

      <LegalSection title="12. Droit applicable">
        <p>
          Le droit belge s’applique, sans priver le consommateur des dispositions
          impératives plus protectrices de son pays de résidence. Les tribunaux
          compétents sont déterminés par les règles impératives applicables.
        </p>
      </LegalSection>

      <LegalSection title="13. Règles Discord">
        <p>
          Les offres supportées par Premium Apps sont également proposées via
          la boutique Discord conformément à la politique développeur. Les
          conditions de paiement de Discord complètent les présentes CGV pour
          les opérations qu’il traite, sans remplacer les obligations propres
          du vendeur concernant le service RTA.
        </p>
      </LegalSection>

      <LegalSection title="14. Sécurité des paiements">
        <p>
          RTA ne reçoit ni ne conserve le numéro complet de carte, le
          cryptogramme ou les identifiants bancaires complets. Les clés secrètes
          Stripe restent exclusivement côté serveur. L’attribution est
          idempotente : un même paiement ou entitlement ne peut créditer le
          compte qu’une seule fois.
        </p>
      </LegalSection>
    </LegalPage>
  );
}
