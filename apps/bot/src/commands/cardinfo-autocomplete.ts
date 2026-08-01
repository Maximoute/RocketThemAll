export type CardinfoAutocompleteCard = {
  name: string;
  contentKey: string | null;
  id: string;
  acceptedNames: unknown;
  deckName: string;
};

export type CardinfoAutocompleteChoice = {
  name: string;
  value: string;
};

function normalize(value: string) {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .trim()
    .replace(/\s+/g, " ")
    .toLocaleLowerCase("fr-FR");
}

function aliases(value: unknown) {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string")
    : [];
}

function truncateChoiceName(value: string) {
  return value.length <= 100 ? value : `${value.slice(0, 99)}…`;
}

function matchScore(card: CardinfoAutocompleteCard, query: string) {
  if (!query) return 0;
  const name = normalize(card.name);
  const contentKey = normalize(card.contentKey ?? "");
  const terms = [name, contentKey, ...aliases(card.acceptedNames).map(normalize)];

  if (name === query || contentKey === query) return 0;
  if (name.startsWith(query)) return 1;
  if (terms.some((term) => term.startsWith(query))) return 2;
  if (terms.some((term) => term.includes(query))) return 3;
  return Number.POSITIVE_INFINITY;
}

export function cardinfoNameChoices(
  cards: CardinfoAutocompleteCard[],
  input: string,
  deckInput?: string | null
): CardinfoAutocompleteChoice[] {
  const query = normalize(input);
  const deckQuery = deckInput ? normalize(deckInput) : null;
  const seenValues = new Set<string>();

  return cards
    .map((card) => ({ card, score: matchScore(card, query) }))
    .filter(({ card, score }) =>
      Number.isFinite(score) && (!deckQuery || normalize(card.deckName) === deckQuery)
    )
    .sort((left, right) =>
      left.score - right.score ||
      left.card.name.localeCompare(right.card.name, "fr") ||
      left.card.deckName.localeCompare(right.card.deckName, "fr")
    )
    .flatMap(({ card }) => {
      const value = card.contentKey ?? card.id;
      if (!value || value.length > 100 || seenValues.has(value)) return [];
      seenValues.add(value);
      return [{
        name: truncateChoiceName(`${card.name} — ${card.deckName}`),
        value
      }];
    })
    .slice(0, 25);
}

export function cardinfoDeckChoices(
  cards: CardinfoAutocompleteCard[],
  input: string
): CardinfoAutocompleteChoice[] {
  const query = normalize(input);
  const decks = [...new Set(cards.map((card) => card.deckName))]
    .filter((deck) => deck.length > 0 && deck.length <= 100);

  return decks
    .filter((deck) => normalize(deck).includes(query))
    .sort((left, right) => {
      const leftStarts = normalize(left).startsWith(query) ? 0 : 1;
      const rightStarts = normalize(right).startsWith(query) ? 0 : 1;
      return leftStarts - rightStarts || left.localeCompare(right, "fr");
    })
    .slice(0, 25)
    .map((deck) => ({ name: truncateChoiceName(deck), value: deck }));
}
