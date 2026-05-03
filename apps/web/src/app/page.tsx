export default function HomePage() {
  return (
    <div className="hero">
      <h1>Rocket Them All</h1>
      <p>
        Collecte des cartes Rocket League sur Discord et suis ta progression sur le web.
      </p>
      <div className="hero-cta">
        <a href="/collection" className="btn-primary">Voir la collection</a>
        <a href="/profile" className="btn-secondary">Mon profil</a>
      </div>
    </div>
  );
}
