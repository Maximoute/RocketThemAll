import type { Metadata } from "next";
import {
  LegalConfigurationWarning,
  LegalPage,
  LegalSection
} from "../../../components/legal-page";
import { getLegalIdentity, publicEmailHref } from "../../../lib/legal";

export const metadata: Metadata = {
  title: "Mentions légales · Rocket Them All",
  description: "Identification de l’éditeur et de l’hébergeur de Rocket Them All."
};

export default function LegalNoticesPage() {
  const identity = getLegalIdentity();
  const emailHref = publicEmailHref(
    identity.publisherEmail,
    "Contact légal — Rocket Them All"
  );

  return (
    <LegalPage
      title="Mentions légales"
      summary="Identification de l’éditeur du site, du bot Discord Rocket Them All et de leurs services associés."
    >
      <LegalConfigurationWarning missing={identity.missing} />

      <LegalSection title="1. Éditeur du service">
        <dl className="grid gap-2 sm:grid-cols-[13rem_1fr]">
          <dt className="font-bold text-rta-ink">Nom ou dénomination</dt>
          <dd>{identity.publisherName}</dd>
          <dt className="font-bold text-rta-ink">Forme ou qualité</dt>
          <dd>{identity.publisherStatus}</dd>
          <dt className="font-bold text-rta-ink">Adresse</dt>
          <dd>{identity.publisherAddress}</dd>
          <dt className="font-bold text-rta-ink">Numéro BCE</dt>
          <dd>{identity.enterpriseNumber}</dd>
          <dt className="font-bold text-rta-ink">TVA</dt>
          <dd>{identity.vatNumber}</dd>
          <dt className="font-bold text-rta-ink">Téléphone</dt>
          <dd>{identity.publisherPhone}</dd>
          <dt className="font-bold text-rta-ink">E-mail</dt>
          <dd>
            {emailHref
              ? <a href={emailHref}>{identity.publisherEmail}</a>
              : identity.publisherEmail}
          </dd>
          <dt className="font-bold text-rta-ink">Responsable de publication</dt>
          <dd>{identity.publicationDirector}</dd>
        </dl>
      </LegalSection>

      <LegalSection title="2. Hébergement">
        <p>
          Le service est hébergé par <strong>{identity.hostName}</strong>,
          établi à l’adresse suivante : {identity.hostAddress}.
        </p>
        <p>Site de l’hébergeur : {identity.hostWebsite}</p>
      </LegalSection>

      <LegalSection title="3. Service édité">
        <p>
          Rocket Them All (« RTA ») est un jeu communautaire de collection et
          de progression fourni sous la forme d’un bot Discord et d’un site web.
          Le service est exploité sous la responsabilité exclusive de son
          éditeur.
        </p>
        <p>
          Discord est une plateforme tierce. Rocket Them All n’est ni affilié,
          ni sponsorisé, ni approuvé par Discord Inc. « Discord » et ses signes
          distinctifs appartiennent à leurs titulaires respectifs.
        </p>
      </LegalSection>

      <LegalSection title="4. Propriété intellectuelle">
        <p>
          Le code, l’interface, la structure, les textes originaux, le nom et les
          éléments graphiques propres à RTA sont protégés dans la mesure permise
          par la loi. Toute reproduction ou exploitation non autorisée est
          interdite.
        </p>
        <p>
          Les marques, personnages, œuvres, vidéos, images et univers tiers
          éventuellement référencés restent la propriété de leurs ayants droit.
          Leur présence ne crée aucune affiliation. Un signalement concernant
          un droit de propriété intellectuelle peut être adressé à l’e-mail de
          l’éditeur avec l’identification de l’œuvre, du contenu contesté et du
          droit invoqué.
        </p>
      </LegalSection>

      <LegalSection title="5. Sources officielles">
        <p>
          Les informations d’identification requises pour un site d’entreprise
          belge sont présentées par le{" "}
          <a
            href="https://news.economie.fgov.be/203681-informations-obligatoires-sur-le-site-web-de-votre-entreprise/"
            target="_blank"
            rel="noreferrer"
          >
            SPF Économie
          </a>.
        </p>
      </LegalSection>
    </LegalPage>
  );
}
