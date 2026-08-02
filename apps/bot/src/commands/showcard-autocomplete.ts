export type OwnedCardAutocompleteItem = {
  id: string;
  name: string;
  contentKey: string | null;
  deckName: string;
  rarityWeight: number;
  variant: "normal" | "shiny" | "holo";
  quantity: number;
};

function normalizeSearch(value: string) {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .trim()
    .replace(/\s+/g, " ")
    .toLocaleLowerCase("fr-FR");
}

function truncate(value: string, maximum: number) {
  if (value.length <= maximum) return value;
  return `${value.slice(0, maximum - 1)}…`;
}

const variantRank = { normal: 0, shiny: 1, holo: 2 } as const;
const variantLabel = { normal: "NORMAL", shiny: "✨ SHINY", holo: "🌌 HOLO" } as const;

export function showcardAutocompleteChoices(
  items: OwnedCardAutocompleteItem[],
  query: string
) {
  const normalizedQuery = normalizeSearch(query);
  return items
    .filter((item) => {
      if (!normalizedQuery) return true;
      return [item.name, item.contentKey ?? "", item.deckName, item.variant]
        .map(normalizeSearch)
        .some((term) => term.includes(normalizedQuery));
    })
    .sort((left, right) =>
      variantRank[right.variant] - variantRank[left.variant] ||
      right.rarityWeight - left.rarityWeight ||
      left.name.localeCompare(right.name, "fr")
    )
    .slice(0, 20)
    .map((item) => ({
      name: truncate(
        `${item.name} — ${item.deckName} — ${variantLabel[item.variant]} ×${item.quantity}`,
        100
      ),
      value: item.id
    }));
}
