import type { Metadata } from "next";
import {
  LegalConfigurationWarning,
  LegalPage,
  LegalSection
} from "../../../components/legal-page";
import { getLegalIdentity } from "../../../lib/legal";

export const metadata: Metadata = {
  title: "Conditions d’utilisation · Rocket Them All",
  description: "Conditions applicables au site et au bot Discord Rocket Them All."
};

export default function TermsOfUsePage() {
  const identity = getLegalIdentity();
  return (
    <LegalPage
      title="Conditions générales d’utilisation"
      summary="Ces conditions régissent l’accès au site, au bot Discord et aux fonctionnalités de jeu Rocket Them All."
    >
      <LegalConfigurationWarning missing={identity.missing} />

      <LegalSection title="1. Objet et acceptation">
        <p>
          Les présentes conditions générales d’utilisation (« CGU ») constituent
          l’accord entre l’utilisateur et {identity.publisherName} concernant
          Rocket Them All. L’utilisation d’une commande du bot, la connexion au
          site ou la poursuite de l’utilisation après affichage des CGU vaut
          acceptation de celles-ci.
        </p>
        <p>
          Les conditions de Discord restent applicables séparément. En cas de
          contradiction relative à l’utilisation de la plateforme Discord, les
          conditions de Discord prévalent.
        </p>
      </LegalSection>

      <LegalSection title="2. Accès et âge minimum">
        <p>
          L’accès nécessite un compte Discord valide et le respect de l’âge
          minimum imposé par Discord et par la loi du pays de l’utilisateur. En
          Belgique, Discord est accessible à partir de 13 ans. Un mineur ne peut
          conclure un achat ou un abonnement que dans les limites de sa capacité
          juridique et avec l’autorisation de son représentant légal lorsqu’elle
          est requise.
        </p>
        <p>
          L’utilisateur est responsable de la sécurité de son compte Discord et
          de toute activité effectuée avec celui-ci.
        </p>
      </LegalSection>

      <LegalSection title="3. Fonctionnement du service">
        <p>
          RTA permet notamment d’explorer des mondes, capturer et collectionner
          des cartes, utiliser des objets, accomplir des quêtes, participer à
          des boss, développer des compétences et consulter sa progression.
          Certaines fonctions dépendent de la configuration du serveur Discord.
        </p>
        <p>
          Les probabilités, coûts et règles applicables sont ceux affichés ou
          documentés au moment de l’action. Les corrections nécessaires à
          l’équilibre, à la sécurité ou à la conformité peuvent modifier le
          service pour l’avenir, sans retirer arbitrairement un avantage payant
          déjà dû pendant sa période de validité.
        </p>
      </LegalSection>

      <LegalSection title="4. Actifs virtuels">
        <p>
          Les cartes, crédits, fragments, objets, boosters, titres, niveaux et
          autres éléments de jeu sont des droits d’utilisation virtuels limités
          au service. Ils n’ont aucune valeur monétaire, ne constituent ni une
          monnaie électronique ni un droit de propriété sur les œuvres
          représentées, et ne peuvent être vendus contre de l’argent réel.
        </p>
        <p>
          Les échanges prévus par RTA doivent utiliser les mécanismes officiels
          du jeu. La vente de comptes, d’actifs virtuels ou de services de
          triche est interdite.
        </p>
      </LegalSection>

      <LegalSection title="5. Comportements interdits">
        <ul>
          <li>tricher, automatiser les commandes ou exploiter volontairement une faille ;</li>
          <li>contourner un cooldown, une limite, une sanction ou un contrôle d’accès ;</li>
          <li>tenter d’accéder aux données ou comptes d’un tiers ;</li>
          <li>perturber le bot, le site, Discord ou l’infrastructure ;</li>
          <li>harceler, frauder ou publier un contenu illégal ou portant atteinte aux droits d’un tiers ;</li>
          <li>revendre un avantage, un compte ou un actif RTA contre une valeur réelle.</li>
        </ul>
        <p>
          Une faille doit être signalée confidentiellement à l’éditeur et ne
          doit pas être exploitée au-delà de ce qui est strictement nécessaire
          pour la décrire.
        </p>
      </LegalSection>

      <LegalSection title="6. Modération et suspension">
        <p>
          En cas de violation, l’éditeur peut limiter, suspendre ou fermer
          l’accès, annuler une opération obtenue frauduleusement et préserver
          les preuves nécessaires. Lorsque les circonstances le permettent,
          l’utilisateur reçoit le motif et peut contester la décision auprès de
          l’éditeur.
        </p>
      </LegalSection>

      <LegalSection title="7. Disponibilité et responsabilité">
        <p>
          L’éditeur met en œuvre des moyens raisonnables pour assurer la
          disponibilité et la sécurité du service, sans garantir une absence
          permanente d’interruption. Des maintenances, incidents Discord,
          indisponibilités de réseau ou événements de force majeure peuvent
          affecter RTA.
        </p>
        <p>
          Aucune clause des présentes ne limite un droit impératif du
          consommateur belge ni une responsabilité qui ne peut être exclue par
          la loi. Sous cette réserve, l’éditeur n’est pas responsable d’un
          dommage indirect, d’un usage contraire aux CGU ou d’un service tiers.
        </p>
      </LegalSection>

      <LegalSection title="8. Fin de l’utilisation et suppression">
        <p>
          L’utilisateur peut cesser d’utiliser RTA à tout moment, se déconnecter
          du site et demander la suppression de ses données selon la politique
          de confidentialité. Une suppression est irréversible pour la
          collection et la progression, sous réserve des données qui doivent
          être conservées pour une obligation légale ou un litige.
        </p>
      </LegalSection>

      <LegalSection title="9. Modification des CGU">
        <p>
          La version et la date de mise à jour figurent en tête du document. Une
          modification substantielle est portée à la connaissance des
          utilisateurs par un moyen raisonnable avant son entrée en vigueur.
          Les avantages payants en cours restent soumis aux engagements annoncés
          lors de l’achat, sauf changement légal ou de sécurité indispensable.
        </p>
      </LegalSection>

      <LegalSection title="10. Droit applicable et règlement des litiges">
        <p>
          Les CGU sont régies par le droit belge, sans priver un consommateur
          résidant dans un autre État des protections impératives dont il
          bénéficie. L’utilisateur est invité à contacter d’abord l’éditeur.
        </p>
        <p>
          À défaut d’accord, un consommateur peut s’adresser au{" "}
          <a
            href="https://mediationconsommateur.be/"
            target="_blank"
            rel="noreferrer"
          >
            Service de Médiation pour le Consommateur
          </a>
          , Boulevard du Roi Albert II 8 bte 1, 1000 Bruxelles. Les juridictions
          compétentes sont déterminées par les règles impératives applicables.
        </p>
      </LegalSection>
    </LegalPage>
  );
}
