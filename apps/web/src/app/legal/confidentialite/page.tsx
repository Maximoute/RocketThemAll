import type { Metadata } from "next";
import {
  LegalConfigurationWarning,
  LegalPage,
  LegalSection
} from "../../../components/legal-page";
import { getLegalIdentity, publicEmailHref } from "../../../lib/legal";

export const metadata: Metadata = {
  title: "Confidentialité et RGPD · Rocket Them All",
  description:
    "Politique de confidentialité du site et du bot Discord Rocket Them All."
};

export default function PrivacyPage() {
  const identity = getLegalIdentity();
  const privacyHref = publicEmailHref(
    identity.privacyEmail,
    "Demande RGPD — Rocket Them All"
  );

  return (
    <LegalPage
      title="Politique de confidentialité"
      summary="Cette politique décrit les données traitées par Rocket Them All, leur utilisation et les moyens d’exercer vos droits."
    >
      <LegalConfigurationWarning missing={identity.missing} />

      <LegalSection title="1. Responsable du traitement">
        <p>
          Le responsable du traitement est <strong>{identity.dataControllerName}</strong>,
          établi à {identity.publisherAddress}.
        </p>
        <p>
          Contact vie privée :{" "}
          {privacyHref
            ? <a href={privacyHref}>{identity.privacyEmail}</a>
            : identity.privacyEmail}
          . Aucun délégué à la protection des données n’est désigné à ce jour;
          ce contact centralise les demandes.
        </p>
      </LegalSection>

      <LegalSection title="2. Données traitées et origine">
        <ul>
          <li>
            <strong>Données Discord :</strong> identifiant Discord, nom
            d’utilisateur, avatar, identifiants des serveurs, salons et messages
            nécessaires au fonctionnement du bot, rôles d’administration et
            interactions avec les commandes.
          </li>
          <li>
            <strong>Authentification :</strong> RTA demande à Discord uniquement
            le scope OAuth2 <code>identify</code>. L’e-mail Discord n’est pas
            demandé ni enregistré pour créer le profil.
          </li>
          <li>
            <strong>Données de jeu :</strong> collection, variantes, inventaire,
            crédits, fragments, niveau, XP, compétences, quêtes, achievements,
            badges d&apos;achievements sélectionnés, tranche de niveau synchronisée,
            identifiants des rôles Discord
            correspondants, échanges, contrats, explorations, captures,
            contributions aux boss, cooldowns et historique économique.
          </li>
          <li>
            <strong>Données techniques :</strong> horodatages, identifiants
            d’opération, journaux de sécurité, erreurs, adresse IP et
            informations de requête lorsqu’elles sont nécessaires à la
            protection, au diagnostic ou à la limitation des abus.
          </li>
          <li>
            <strong>Support et obligations commerciales :</strong> contenu des
            demandes adressées au support, identifiants de produit, commande,
            client et abonnement Stripe, ainsi que les identifiants de SKU et
            d’entitlement fournis par Discord. RTA conserve également le statut,
            le montant, la devise, le canal et la date d’attribution. Les
            données complètes de carte bancaire ne sont jamais reçues par RTA.
          </li>
        </ul>
        <p>
          Ces données proviennent de Discord, de vos actions, des administrateurs
          autorisés de vos serveurs et des événements générés par le service.
        </p>
      </LegalSection>

      <LegalSection title="3. Finalités et bases juridiques">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[42rem] border-collapse text-left">
            <thead>
              <tr>
                <th>Finalité</th>
                <th>Base juridique principale</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Authentifier le joueur et exécuter les fonctions de jeu</td>
                <td>Exécution des CGU et du service demandé</td>
              </tr>
              <tr>
                <td>Gérer une offre, un achat ou un abonnement futur</td>
                <td>Exécution du contrat et obligations légales</td>
              </tr>
              <tr>
                <td>Sécuriser RTA, empêcher la fraude et corriger les incidents</td>
                <td>Intérêt légitime de sécurisation du service</td>
              </tr>
              <tr>
                <td>Conserver les preuves comptables ou répondre aux autorités</td>
                <td>Obligation légale</td>
              </tr>
              <tr>
                <td>Installer un futur traceur optionnel ou envoyer une communication commerciale</td>
                <td>Consentement préalable, lorsqu’il est requis</td>
              </tr>
            </tbody>
          </table>
        </div>
      </LegalSection>

      <LegalSection title="4. Destinataires et sous-traitants">
        <p>Les données sont accessibles uniquement dans la mesure nécessaire :</p>
        <ul>
          <li>à l’éditeur et aux personnes autorisées chargées de l’exploitation ;</li>
          <li>
            à Discord pour l’authentification, les interactions, l’hébergement
            des messages et, le cas échéant, les paiements Premium Apps ;
          </li>
          <li>
            à Stripe pour le formulaire de paiement hébergé, la facturation, les
            abonnements, la prévention de la fraude et les remboursements ;
          </li>
          <li>
            à l’hébergeur indiqué dans les mentions légales et aux fournisseurs
            techniques liés par leurs obligations contractuelles ;
          </li>
          <li>aux autorités lorsqu’une obligation légale l’impose.</li>
        </ul>
        <p>
          RTA ne vend pas les données personnelles et ne les utilise pas pour de
          la publicité comportementale.
        </p>
      </LegalSection>

      <LegalSection title="5. Transferts internationaux">
        <p>
          Discord est un prestataire distinct susceptible de traiter des données
          en dehors de l’Espace économique européen selon sa propre politique et
          les garanties qu’il décrit. L’utilisateur peut consulter la{" "}
          <a
            href="https://discord.com/privacy"
            target="_blank"
            rel="noreferrer"
          >
            politique de confidentialité de Discord
          </a>.
        </p>
        <p>
          Stripe est susceptible de traiter des données en dehors de l’Espace
          économique européen selon les garanties décrites dans sa{" "}
          <a
            href="https://stripe.com/privacy"
            target="_blank"
            rel="noreferrer"
          >
            politique de confidentialité
          </a>
          . RTA ne transmet à Stripe que l’identifiant interne nécessaire au
          rapprochement de la commande. L’e-mail Discord n’est pas demandé par
          RTA. Stripe collecte directement les coordonnées de facturation
          nécessaires dans sa page hébergée; RTA n’enregistre pas les données
          complètes du moyen de paiement.
        </p>
        <p>
          L’emplacement de l’hébergeur RTA doit être renseigné dans les mentions
          légales. Tout nouveau transfert hors EEE devra reposer sur un mécanisme
          prévu par le RGPD.
        </p>
      </LegalSection>

      <LegalSection title="6. Durées de conservation">
        <ul>
          <li>
            <strong>Session web :</strong> jusqu’à 30 jours au maximum ou
            jusqu’à la déconnexion; les paramètres temporaires OAuth expirent
            plus rapidement.
          </li>
          <li>
            <strong>Profil et progression :</strong> pendant l’utilisation du
            service, puis jusqu’à la demande de suppression. Aucun profil
            inactif n’est actuellement supprimé automatiquement.
          </li>
          <li>
            <strong>Journaux de sécurité :</strong> pendant la durée nécessaire
            à l’analyse de l’incident et à la prévention des abus, avec une
            revue régulière de leur nécessité.
          </li>
          <li>
            <strong>Historique économique et achats :</strong> pendant la durée
            nécessaire au service, puis pendant les délais légaux comptables,
            fiscaux, de garantie ou de contestation applicables.
          </li>
          <li>
            <strong>Support :</strong> jusqu’à la résolution de la demande puis
            pendant le délai raisonnablement nécessaire à sa preuve.
          </li>
        </ul>
        <p>
          Une donnée est supprimée ou anonymisée lorsqu’elle n’est plus
          nécessaire, sauf obligation légale ou nécessité de défense d’un droit.
        </p>
      </LegalSection>

      <LegalSection title="7. Vos droits" id="droits">
        <p>
          Selon les conditions du RGPD, vous pouvez demander l’accès, la
          rectification, l’effacement, la limitation, la portabilité ou vous
          opposer à un traitement. Vous pouvez retirer un consentement à tout
          moment, sans affecter les opérations antérieures.
        </p>
        <p>
          Envoyez la demande au contact vie privée en indiquant votre identifiant
          Discord et le droit exercé. Une preuve proportionnée d’identité peut
          être demandée si nécessaire. La demande de suppression entraîne la
          perte irréversible de la collection et de la progression après les
          vérifications et délais légalement applicables.
        </p>
        <p>
          Vous pouvez également introduire une réclamation auprès de l’{" "}
          <a
            href="https://www.autoriteprotectiondonnees.be/"
            target="_blank"
            rel="noreferrer"
          >
            Autorité de protection des données belge
          </a>
          , Rue de la Presse 35, 1000 Bruxelles.
        </p>
      </LegalSection>

      <LegalSection title="8. Décisions automatisées et probabilités">
        <p>
          RTA utilise des tirages et règles automatisés pour les rencontres,
          captures, variantes, objets et récompenses. Ces décisions relèvent du
          fonctionnement ludique, sont journalisées lorsque nécessaire et ne
          produisent pas d’effet juridique ou analogue significatif au sens de
          l’article 22 du RGPD.
        </p>
      </LegalSection>

      <LegalSection title="9. Sécurité et mineurs">
        <p>
          RTA applique notamment une séparation des secrets, des contrôles
          d’accès, des transactions atomiques, des journaux d’audit et des
          sauvegardes adaptées. Aucun système n’offre cependant une sécurité
          absolue.
        </p>
        <p>
          RTA ne demande pas la date de naissance et s’appuie sur les conditions
          d’âge de Discord. Les données d’un mineur reçoivent la protection
          particulière prévue par le droit belge et le RGPD.
        </p>
      </LegalSection>

      <LegalSection title="10. Mise à jour">
        <p>
          Une évolution substantielle de cette politique ou des usages de
          données est annoncée par un moyen approprié. La version antérieure
          reste applicable aux traitements réalisés avant la modification
          lorsque la loi l’exige.
        </p>
      </LegalSection>
    </LegalPage>
  );
}
