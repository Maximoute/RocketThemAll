import Link from "next/link";
import { unstable_cache } from "next/cache";
import { prisma } from "@rta/database";
import PlayerLink from "../components/player-link";
import HomeExperience from "../components/home-experience";
import { DISCORD_BOT_INSTALL_URL } from "../lib/discord";

export const dynamic = "force-dynamic";

const getPublicCatalogPreview = unstable_cache(async () => {
  const featuredNames = ["Inoxtag", "ChatGPT", "Zen", "Cybermen", "Doge"];
  const [cardCount, worldCount, cards] = await Promise.all([
    prisma.card.count({ where: { status: "PUBLISHED", isActive: true } }).catch(() => 810),
    prisma.worldDefinition.count({ where: { status: "PUBLISHED" } }).catch(() => 9),
    prisma.card.findMany({ where: { status: "PUBLISHED", isActive: true, name: { in: featuredNames } }, select: { id: true, name: true, imageUrl: true, deck: { select: { name: true } }, rarity: { select: { name: true } } } }).catch(() => []),
  ]);
  return { cardCount: cardCount || 810, worldCount: worldCount || 9, cards: [...cards].sort((a, b) => featuredNames.indexOf(a.name) - featuredNames.indexOf(b.name)) };
}, ["home-public-catalog-preview-v4"], { revalidate: 300 });

export default async function HomePage() {
  const { cardCount, worldCount, cards } = await getPublicCatalogPreview();
  return (
    <div className="rta-home">
      {/* THESIS: collection launch room, refusing the generic gaming dashboard. OWN WORLD: near-black paper, launch orange, condensed display type, printed-card edges. STRUCTURE: immediate game promise, real catalog proof, then a three-beat player journey. MOTION: card orbit is the focal system. PROOF AND FALLBACKS: live catalog data, stacked mobile composition, static reduced-motion state. */}
      <HomeExperience cards={cards} cardCount={cardCount} worldCount={worldCount} />

      <section className="home-manifesto" aria-labelledby="manifesto-title">
        <div className="home-manifesto__rule" aria-hidden="true" />
        <p className="home-kicker">Le jeu vit sur Discord</p>
        <h2 id="manifesto-title">Une apparition. Une capture. Une carte qui devient vraiment la tienne.</h2>
        <p>Rocket Them All transforme ton serveur en terrain de chasse collectif. Les cartes apparaissent dans les salons, les joueurs les capturent, puis retrouvent ici leur collection, leurs compétences et leur progression.</p>
      </section>

      <section className="home-journey" aria-label="Le parcours du joueur">
        <article className="home-journey__beat home-journey__beat--signal">
          <div className="home-journey__index" aria-hidden="true">Signal reçu</div>
          <div><h2>Repère l’apparition.</h2><p>Une carte surgit dans un salon Discord. Tu n’as pas besoin de quitter la conversation pour entrer dans la partie.</p></div>
          <div className="signal-visual" aria-hidden="true"><span /><span /><span /></div>
        </article>
        <article className="home-journey__beat home-journey__beat--capture">
          <div className="home-journey__index" aria-hidden="true">Fenêtre ouverte</div>
          <div><h2>Sois le premier à capturer.</h2><p>Chaque apparition crée un instant de tension partagé. Ta collection se construit capture après capture, avec ses raretés et ses variantes.</p></div>
          <div className="capture-mark" aria-hidden="true"><span>RTA</span></div>
        </article>
        <article className="home-journey__beat home-journey__beat--grow">
          <div className="home-journey__index" aria-hidden="true">Trajectoire tracée</div>
          <div><h2>Fais évoluer ton jeu.</h2><p>Organise ton inventaire, débloque tes compétences, échange avec les autres joueurs et mesure ta progression dans les classements.</p></div>
          <nav className="journey-links" aria-label="Accès rapides joueur"><PlayerLink href="/profile">Mon profil</PlayerLink><Link href="/collection">Decks et cartes</Link><PlayerLink href="/inventory">Inventaire</PlayerLink><PlayerLink href="/shop">Boutique</PlayerLink><PlayerLink href="/skills">Compétences</PlayerLink><Link href="/leaderboards">Classements</Link></nav>
        </article>
      </section>

      <section className="home-shop" aria-labelledby="shop-title">
        <div className="home-shop__intro">
          <p className="home-kicker">Boutique RTA</p>
          <h2 id="shop-title">Prépare ta prochaine chasse.</h2>
          <p>Boosters, encens et artefacts utilisent les crédits gagnés en jeu. La boutique complète conserve le stock, les effets techniques et les achats sécurisés de ton compte.</p>
          <PlayerLink href="/shop" className="rta-button">Ouvrir la boutique</PlayerLink>
        </div>
        <div className="home-shop__shelf">
          <Link href="/shop" className="shop-product shop-product--booster"><img src="/showcase/booster-legendary.webp" alt="Booster légendaire" /><span>Booster légendaire</span></Link>
          <Link href="/shop" className="shop-product shop-product--incense"><img src="/showcase/encens-rare.webp" alt="Encens rare" /><span>Encens rare</span></Link>
          <Link href="/shop" className="shop-product shop-product--idol"><img src="/showcase/idole-du-collectionneur.webp" alt="Idole du collectionneur" /><span>Idole du collectionneur</span></Link>
        </div>
      </section>

      <section className="home-lore" aria-labelledby="lore-title">
        <div className="home-lore__media"><img src="/showcase/aurex.webp" alt="Aurex, le Souverain du Chaos" /><img src="/showcase/anomalie-zero.webp" alt="Anomalie Zéro" /></div>
        <div className="home-lore__copy"><p className="home-kicker">Boss communautaires</p><h2 id="lore-title">Certaines apparitions exigent tout un serveur.</h2><p>Les boss installent une menace commune dans le monde en cours. Les joueurs contribuent ensemble, suivent la jauge et récupèrent les récompenses avant la fin du cycle.</p><Link href="/community" className="rta-text-link">Découvrir la progression communautaire <span aria-hidden="true">↗</span></Link></div>
      </section>

      <section className="home-close" aria-labelledby="close-title">
        <p>Ta prochaine carte peut apparaître maintenant.</p>
        <h2 id="close-title">Le serveur est déjà en jeu.</h2>
        <div className="home-close__actions"><a href={DISCORD_BOT_INSTALL_URL} target="_blank" rel="noreferrer" className="rta-button rta-button--light">Ajouter RTA à votre serveur</a><Link href="/setup" className="rta-text-link">Configurer le salon <span aria-hidden="true">↗</span></Link><Link href="/play" className="rta-text-link">Voir comment jouer <span aria-hidden="true">↗</span></Link></div>
      </section>
    </div>
  );
}
