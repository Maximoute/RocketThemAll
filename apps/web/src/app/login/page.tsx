import AuthButton from "../../components/auth-button";
import Image from "next/image";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string | string[] }>;
}) {
  const requestedCallback = (await searchParams).callbackUrl;
  const callbackUrl = typeof requestedCallback === "string" && requestedCallback.startsWith("/")
    ? requestedCallback
    : "/";

  return (
    <section className="rta-login bg-rta-surface border border-rta-border">
      <div className="rta-login__visual" aria-hidden="true">
        <Image src="/showcase/doge.webp" alt="" fill sizes="(max-width: 768px) 100vw, 42vw" />
        <span>TA COLLECTION T’ATTEND.</span>
      </div>
      <div className="rta-login__copy">
        <p className="home-kicker">Espace joueur</p>
        <h1>Connexion</h1>
        <p>Retrouve tes captures, tes decks, ta progression et la boutique avec ton identité Discord.</p>
        <AuthButton connectLabel="Se connecter avec Discord" logoutLabel="Se déconnecter" callbackUrl={callbackUrl} />
        <small>RTA utilise Discord uniquement pour reconnaître ton compte et tes serveurs autorisés.</small>
      </div>
    </section>
  );
}
