"use client";

import { useMemo, useState } from "react";

type Mode = "DECK" | "TIER" | "BULK";

export type SacrificeCard = {
  id: string;
  name: string;
  deckId: string;
  deckName: string;
  rarityName: string;
  rarityWeight: number;
  variant: "normal" | "shiny" | "holo";
  quantity: number;
  imageUrl: string | null;
};

type Props = {
  inventory: SacrificeCard[];
  cost: number;
  tierNames: readonly string[];
};

const modeDetails: Record<Mode, { label: string; detail: string }> = {
  DECK: { label: "Deck", detail: "Uniquement des cartes du même deck" },
  TIER: { label: "Tier", detail: "Uniquement des cartes de la même rareté" },
  BULK: { label: "Vrac", detail: "Toutes tes cartes sont disponibles" }
};

function variantLabel(variant: SacrificeCard["variant"]) {
  return variant === "normal" ? "Normal" : variant === "shiny" ? "Shiny" : "Holo";
}

export default function CardSacrificeSelector({ inventory, cost, tierNames }: Props) {
  const deckOptions = useMemo(() => {
    const rows = new Map<string, { id: string; name: string; stock: number }>();
    for (const card of inventory) {
      const current = rows.get(card.deckId) ?? { id: card.deckId, name: card.deckName, stock: 0 };
      current.stock += card.quantity;
      rows.set(card.deckId, current);
    }
    return [...rows.values()]
      .filter((deck) => deck.stock >= cost)
      .sort((left, right) => left.name.localeCompare(right.name, "fr"));
  }, [cost, inventory]);

  const tierOptions = useMemo(() => tierNames
    .map((name) => ({
      name,
      stock: inventory
        .filter((card) => card.rarityName === name)
        .reduce((sum, card) => sum + card.quantity, 0)
    }))
    .filter((tier) => tier.stock >= cost), [cost, inventory, tierNames]);

  const [mode, setMode] = useState<Mode>("DECK");
  const [deckId, setDeckId] = useState(deckOptions[0]?.id ?? "");
  const [tierName, setTierName] = useState(tierOptions[0]?.name ?? "");
  const [selected, setSelected] = useState<string[]>([]);

  const visibleCards = useMemo(() => inventory
    .filter((card) => mode === "BULK"
      || (mode === "DECK" && card.deckId === deckId)
      || (mode === "TIER" && card.rarityName === tierName))
    .sort((left, right) => left.name.localeCompare(right.name, "fr")
      || left.variant.localeCompare(right.variant, "fr")), [deckId, inventory, mode, tierName]);

  function changeMode(nextMode: Mode) {
    setMode(nextMode);
    setSelected([]);
  }

  function selectedCount(id: string) {
    return selected.filter((selectedId) => selectedId === id).length;
  }

  function addCard(card: SacrificeCard) {
    if (selected.length >= cost || selectedCount(card.id) >= card.quantity) return;
    setSelected((current) => [...current, card.id]);
  }

  function removeSelection(index: number) {
    setSelected((current) => current.filter((_, selectedIndex) => selectedIndex !== index));
  }

  const ready = selected.length === cost;

  return (
    <div className="space-y-5">
      <input type="hidden" name="mode" value={mode} />
      {selected.map((id, index) => (
        <input key={`${id}-${index}`} type="hidden" name="sacrificeItemId" value={id} />
      ))}

      <div>
        <p className="mb-2 text-sm font-bold">Mode du Réacteur</p>
        <div className="grid gap-2 sm:grid-cols-3">
          {(Object.keys(modeDetails) as Mode[]).map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => changeMode(key)}
              aria-pressed={mode === key}
              className={[
                "rounded-xl border p-3 text-left transition-colors",
                mode === key
                  ? "border-rta-cta bg-rta-cta/15 text-rta-ink"
                  : "border-rta-border bg-rta-bg/50 text-rta-muted hover:border-rta-accentHi"
              ].join(" ")}
            >
              <strong className="block text-sm">{modeDetails[key].label}</strong>
              <span className="mt-1 block text-xs">{modeDetails[key].detail}</span>
            </button>
          ))}
        </div>
      </div>

      {mode === "DECK" && (
        <label className="block text-sm font-bold">
          Deck à utiliser
          <select
            value={deckId}
            onChange={(event) => { setDeckId(event.target.value); setSelected([]); }}
            className="mt-1 w-full rounded-lg border border-rta-border bg-rta-bg px-3 py-2 text-rta-ink"
          >
            {deckOptions.map((deck) => (
              <option key={deck.id} value={deck.id}>{deck.name} · {deck.stock} exemplaires disponibles</option>
            ))}
          </select>
        </label>
      )}

      {mode === "TIER" && (
        <label className="block text-sm font-bold">
          Tier à utiliser
          <select
            value={tierName}
            onChange={(event) => { setTierName(event.target.value); setSelected([]); }}
            className="mt-1 w-full rounded-lg border border-rta-border bg-rta-bg px-3 py-2 text-rta-ink"
          >
            {tierOptions.map((tier) => (
              <option key={tier.name} value={tier.name}>{tier.name} · {tier.stock} exemplaires disponibles</option>
            ))}
          </select>
        </label>
      )}

      <div>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="font-black">Choisis les cartes à sacrifier</h3>
            <p className="text-xs text-rta-muted">Triées par nom · clique sur une carte pour l’ajouter.</p>
          </div>
          <span className="rounded-full border border-rta-accentHi bg-rta-accentHi/15 px-3 py-1 text-sm font-black text-purple-200">
            {selected.length}/{cost}
          </span>
        </div>

        {visibleCards.length > 0 ? (
          <div className="grid max-h-[560px] grid-cols-2 gap-3 overflow-y-auto pr-1 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6">
            {visibleCards.map((card) => {
              const used = selectedCount(card.id);
              const unavailable = selected.length >= cost || used >= card.quantity;
              return (
                <button
                  key={card.id}
                  type="button"
                  disabled={unavailable}
                  onClick={() => addCard(card)}
                  className="group overflow-hidden rounded-xl border border-rta-border bg-rta-bg text-left transition hover:-translate-y-0.5 hover:border-rta-cta disabled:cursor-not-allowed disabled:opacity-45"
                >
                  <div className="relative aspect-[3/4] bg-rta-surface2">
                    {card.imageUrl ? (
                      <img src={card.imageUrl} alt={card.name} className="h-full w-full object-cover" />
                    ) : (
                      <div className="flex h-full items-center justify-center text-4xl opacity-30">🃏</div>
                    )}
                    <span className="absolute right-1.5 top-1.5 rounded-full bg-rta-bg/90 px-2 py-0.5 text-[0.65rem] font-black">
                      {card.quantity - used} dispo.
                    </span>
                  </div>
                  <div className="p-2.5">
                    <strong className="block truncate text-xs text-rta-ink">{card.name}</strong>
                    <span className="mt-1 block truncate text-[0.65rem] text-rta-muted">
                      {variantLabel(card.variant)} · {card.rarityName}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        ) : (
          <p className="rounded-xl border border-rta-border bg-rta-bg/50 p-4 text-sm text-rta-muted">
            Tu n’as pas encore cinq exemplaires compatibles avec ce mode.
          </p>
        )}
      </div>

      <div>
        <h3 className="mb-2 text-sm font-black">Sacrifices sélectionnés</h3>
        <div className="grid grid-cols-5 gap-2">
          {Array.from({ length: cost }, (_, index) => {
            const card = selected[index] ? inventory.find((row) => row.id === selected[index]) : null;
            return card ? (
              <button
                key={`${card.id}-${index}`}
                type="button"
                onClick={() => removeSelection(index)}
                title={`Retirer ${card.name}`}
                className="group relative aspect-[3/4] overflow-hidden rounded-lg border border-red-500/40 bg-rta-bg"
              >
                {card.imageUrl ? <img src={card.imageUrl} alt={card.name} className="h-full w-full object-cover" /> : null}
                <span className="absolute inset-x-0 bottom-0 bg-black/80 px-1 py-1 text-[0.6rem] font-bold text-white group-hover:bg-red-700/90">
                  Retirer
                </span>
              </button>
            ) : (
              <div key={index} className="flex aspect-[3/4] items-center justify-center rounded-lg border border-dashed border-rta-border bg-rta-bg/40 text-lg text-rta-muted">
                {index + 1}
              </div>
            );
          })}
        </div>
      </div>

      <label className="flex items-start gap-2 rounded-lg border border-red-500/30 bg-red-500/5 p-3 text-xs text-rta-muted">
        <input type="checkbox" required className="mt-0.5" />
        Je confirme la destruction définitive des cinq exemplaires sélectionnés en échange d’une seule récompense.
      </label>
      <button
        type="submit"
        disabled={!ready}
        className="w-full rounded-lg bg-rta-cta px-5 py-3 text-sm font-black text-rta-bg disabled:cursor-not-allowed disabled:opacity-40"
      >
        {ready ? "Lancer la transmutation" : `Sélectionne encore ${cost - selected.length} carte${cost - selected.length > 1 ? "s" : ""}`}
      </button>
    </div>
  );
}
