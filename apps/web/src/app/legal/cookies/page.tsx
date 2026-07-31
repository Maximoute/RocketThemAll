import type { Metadata } from "next";
import { LegalPage, LegalSection } from "../../../components/legal-page";

export const metadata: Metadata = {
  title: "Politique de cookies · Rocket Them All",
  description: "Cookies utilisés par le site Rocket Them All."
};

export default function CookiesPage() {
  return (
    <LegalPage
      title="Politique de cookies"
      summary="Le site utilise uniquement les cookies nécessaires à la connexion et à la sécurité. Aucun cookie publicitaire ou analytique n’est actuellement installé."
    >
      <LegalSection title="1. Définition">
        <p>
          Un cookie est une petite information conservée par le navigateur et
          renvoyée au site lors de requêtes ultérieures. Des technologies
          analogues peuvent être soumises aux mêmes règles.
        </p>
      </LegalSection>

      <LegalSection title="2. Cookies strictement nécessaires">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[44rem] border-collapse text-left">
            <thead>
              <tr>
                <th>Cookie ou famille</th>
                <th>Finalité</th>
                <th>Durée maximale</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td><code>next-auth.session-token</code> ou variante sécurisée</td>
                <td>Maintenir la session authentifiée avec Discord</td>
                <td>30 jours ou déconnexion</td>
              </tr>
              <tr>
                <td><code>next-auth.csrf-token</code> ou variante sécurisée</td>
                <td>Protéger les actions de connexion contre les requêtes forgées</td>
                <td>Session ou durée technique limitée</td>
              </tr>
              <tr>
                <td><code>next-auth.callback-url</code></td>
                <td>Revenir à la page demandée après la connexion</td>
                <td>Durée technique limitée</td>
              </tr>
              <tr>
                <td>Cookies temporaires OAuth2 <code>state</code> et <code>pkce</code></td>
                <td>Sécuriser l’échange d’authentification Discord</td>
                <td>Environ 15 minutes</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p>
          Ces cookies sont indispensables au service expressément demandé et à
          sa sécurité. Le droit belge permet leur utilisation sans consentement
          préalable, sous réserve d’une information transparente.
        </p>
      </LegalSection>

      <LegalSection title="3. Cookies non essentiels">
        <p>
          RTA n’utilise actuellement aucun cookie de mesure d’audience, de
          personnalisation publicitaire, de réseau social ou de profilage. En
          conséquence, aucun bandeau d’acceptation n’est affiché.
        </p>
        <p>
          Si un outil non essentiel est ajouté, il restera bloqué jusqu’au
          consentement libre, spécifique et révocable de l’utilisateur. Refuser
          ne bloquera pas l’accès aux fonctions gratuites essentielles.
        </p>
      </LegalSection>

      <LegalSection title="4. Discord">
        <p>
          En cliquant sur « Connexion », l’utilisateur est redirigé vers le
          domaine de Discord. Discord peut alors utiliser ses propres cookies
          selon sa{" "}
          <a
            href="https://discord.com/privacy"
            target="_blank"
            rel="noreferrer"
          >
            politique de confidentialité
          </a>
          . RTA ne contrôle pas les cookies déposés sur les domaines de Discord.
        </p>
      </LegalSection>

      <LegalSection title="5. Stripe">
        <p>
          Un clic sur « Acheter avec Stripe » redirige vers une page sécurisée
          hébergée sur le domaine de Stripe. Stripe peut y utiliser ses propres
          cookies strictement nécessaires, de sécurité ou de prévention de la
          fraude conformément à sa{" "}
          <a href="https://stripe.com/privacy" target="_blank" rel="noreferrer">
            politique de confidentialité
          </a>
          . Ces cookies ne sont pas déposés par le domaine RTA avant cette
          redirection.
        </p>
      </LegalSection>

      <LegalSection title="6. Suppression et contrôle">
        <p>
          La déconnexion supprime ou invalide l’accès de session RTA. Vous pouvez
          également supprimer les cookies dans les paramètres de votre
          navigateur. Le blocage de tous les cookies peut empêcher la connexion
          et les pages nécessitant un profil.
        </p>
      </LegalSection>

      <LegalSection title="7. Référence belge">
        <p>
          L’Autorité de protection des données belge explique les règles
          applicables aux{" "}
          <a
            href="https://www.autoriteprotectiondonnees.be/professionnel/themes/internet/cookies"
            target="_blank"
            rel="noreferrer"
          >
            cookies et autres traceurs
          </a>.
        </p>
      </LegalSection>
    </LegalPage>
  );
}
