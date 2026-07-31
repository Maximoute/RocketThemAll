"use client";

import { useState } from "react";
import { cardVariantImageUrl } from "../../../lib/card-variant";

const variants = [
  { key: "normal", label: "Normal", accent: "text-rta-ink" },
  { key: "shiny", label: "Shiny", accent: "text-cyan-300" },
  { key: "holo", label: "Holo", accent: "text-rta-gold" }
] as const;

export default function VariantCarousel({
  cardName,
  normalImageUrl
}: {
  cardName: string;
  normalImageUrl: string | null;
}) {
  const [index, setIndex] = useState(0);
  const variant = variants[index]!;
  const imageUrl = cardVariantImageUrl(normalImageUrl, variant.key);

  function move(direction: -1 | 1) {
    setIndex((current) => (current + direction + variants.length) % variants.length);
  }

  return (
    <figure className="bg-rta-surface2">
      <div className="aspect-[3/4]">
        {imageUrl ? (
          <img
            src={imageUrl}
            alt={`${cardName}, variante ${variant.label}`}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full grid place-items-center text-6xl opacity-30">🃏</div>
        )}
      </div>

      <figcaption className="border-t border-rta-border p-3">
        <div className="grid grid-cols-[42px_1fr_42px] items-center gap-2">
          <button
            type="button"
            onClick={() => move(-1)}
            aria-label="Voir la variante précédente"
            className="h-10 rounded-lg border border-rta-border bg-rta-bg text-xl font-black hover:border-rta-cta hover:text-rta-cta transition-colors"
          >
            ←
          </button>
          <div className="text-center">
            <p className={`font-black ${variant.accent}`}>Variante {variant.label}</p>
            <p className="text-[0.68rem] text-rta-muted">Normal · Shiny · Holo</p>
          </div>
          <button
            type="button"
            onClick={() => move(1)}
            aria-label="Voir la variante suivante"
            className="h-10 rounded-lg border border-rta-border bg-rta-bg text-xl font-black hover:border-rta-cta hover:text-rta-cta transition-colors"
          >
            →
          </button>
        </div>

        <div className="flex justify-center gap-2 mt-3" aria-label="Choix de la variante">
          {variants.map((entry, position) => (
            <button
              key={entry.key}
              type="button"
              onClick={() => setIndex(position)}
              aria-label={`Afficher la variante ${entry.label}`}
              aria-pressed={position === index}
              className={[
                "h-2 rounded-full transition-all",
                position === index ? "w-7 bg-rta-cta" : "w-2 bg-rta-border hover:bg-rta-muted"
              ].join(" ")}
            />
          ))}
        </div>
      </figcaption>
    </figure>
  );
}
