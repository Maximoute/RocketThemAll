"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";

type Card = { id: string; name: string; imageUrl: string | null; deck: { name: string }; rarity: { name: string } };

export default function HomeExperience({ cards, cardCount, worldCount }: { cards: Card[]; cardCount: number; worldCount: number }) {
  const sceneRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const move = (event: PointerEvent) => {
      const rect = scene.getBoundingClientRect();
      scene.style.setProperty("--pointer-x", String((event.clientX - rect.left) / rect.width - 0.5));
      scene.style.setProperty("--pointer-y", String((event.clientY - rect.top) / rect.height - 0.5));
    };
    scene.addEventListener("pointermove", move, { passive: true });
    return () => scene.removeEventListener("pointermove", move);
  }, []);

  const featured = [
    { id: "inoxtag", name: "Inoxtag", imageUrl: "/showcase/inoxtag.webp", deck: { name: "Streamers français" }, rarity: { name: "Import" } },
    { id: "chatgpt", name: "ChatGPT", imageUrl: "/showcase/chatgpt.webp", deck: { name: "AI Icons" }, rarity: { name: "Black Market" } },
    { id: "zen", name: "Zen", imageUrl: "/showcase/zen.webp", deck: { name: "Rocket League Esports" }, rarity: { name: "Import" } },
    { id: "cybermen", name: "Cybermen", imageUrl: "/showcase/cybermen.webp", deck: { name: "Doctor Who" }, rarity: { name: "Exotic" } },
    { id: "doge", name: "Doge", imageUrl: "/showcase/doge.webp", deck: { name: "Classic Internet Memes" }, rarity: { name: "Exotic" } },
  ];
  const cardsByName = new Map(cards.map((card) => [card.name.toLocaleLowerCase("fr"), card]));
  const displayCards = featured.map((fallback) => cardsByName.get(fallback.name.toLocaleLowerCase("fr")) ?? fallback);
  return (
    <section className="home-hero" aria-labelledby="home-title">
      <div className="home-hero__copy">
        <p className="home-kicker">Jeu de collection communautaire</p>
        <h1 id="home-title"><span>Ton serveur.</span><span>Ta chasse.</span><span>Ta collection.</span></h1>
        <p className="home-hero__lede">Des cartes apparaissent sur Discord. Capture-les avant les autres et construis une collection qui raconte vraiment ton parcours.</p>
        <div className="home-hero__actions"><Link href="/setup" className="rta-button">Ajouter RTA à votre serveur</Link><Link href="/collection" className="rta-text-link">Explorer les decks <span aria-hidden="true">↗</span></Link></div>
        <dl className="home-facts"><div><dt>Cartes publiées</dt><dd>{cardCount.toLocaleString("fr-FR")}</dd></div><div><dt>Mondes à explorer</dt><dd>{worldCount.toLocaleString("fr-FR")}</dd></div><div><dt>Terrain de jeu</dt><dd>Discord</dd></div></dl>
      </div>
      <div ref={sceneRef} className="card-orbit" aria-label="Aperçu de cartes de la collection">
        <div className="card-orbit__halo" aria-hidden="true" /><div className="card-orbit__core" aria-hidden="true"><span>R</span></div>
        {displayCards.map((card, index) => <Link href="/collection" key={card.id} className={`orbit-card orbit-card--${index + 1}`} aria-label={`${card.name}, ${card.rarity.name}`}><div className="orbit-card__image">{card.imageUrl ? <img src={card.imageUrl} alt="" /> : <span aria-hidden="true">RTA</span>}</div><div className="orbit-card__meta"><span>{card.deck.name}</span><strong>{card.name}</strong><em>{card.rarity.name}</em></div></Link>)}
      </div>
    </section>
  );
}
