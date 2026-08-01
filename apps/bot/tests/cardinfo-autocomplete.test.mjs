import assert from "node:assert/strict";
import test from "node:test";

import {
  cardinfoDeckChoices,
  cardinfoNameChoices
} from "../dist/commands/cardinfo-autocomplete.js";
import { commandBuilders } from "../dist/commands/register.js";

const cards = [
  {
    id: "one",
    name: "Fenêtre sur Paris",
    contentKey: "world-1.deck-a.001",
    acceptedNames: ["Fenetre Paris"],
    deckName: "Culture Web"
  },
  {
    id: "two",
    name: "Fenrir",
    contentKey: "world-2.deck-b.002",
    acceptedNames: [],
    deckName: "Mythologie"
  },
  {
    id: "three",
    name: "Autre carte",
    contentKey: "world-1.deck-a.003",
    acceptedNames: [],
    deckName: "Culture Web"
  }
];

test("cardinfo name autocomplete is accent-insensitive and returns stable Vault ids", () => {
  const choices = cardinfoNameChoices(cards, "fenetre");
  assert.deepEqual(choices, [
    { name: "Fenêtre sur Paris — Culture Web", value: "world-1.deck-a.001" }
  ]);
});

test("cardinfo autocomplete can be narrowed by deck and never exceeds Discord's limit", () => {
  const manyCards = Array.from({ length: 40 }, (_, index) => ({
    id: `id-${index}`,
    name: `Carte ${index.toString().padStart(2, "0")}`,
    contentKey: `vault.${index}`,
    acceptedNames: [],
    deckName: index % 2 === 0 ? "Culture Web" : "Mythologie"
  }));
  const choices = cardinfoNameChoices(manyCards, "carte", "Culture Web");
  assert.equal(choices.length, 20);
  assert.ok(choices.every((choice) => choice.name.endsWith("Culture Web")));
  assert.ok(choices.every((choice) => choice.name.length <= 100));
});

test("cardinfo deck autocomplete deduplicates and filters deck names", () => {
  assert.deepEqual(cardinfoDeckChoices(cards, "cult"), [
    { name: "Culture Web", value: "Culture Web" }
  ]);
});

test("the registered cardinfo command enables autocomplete for card and deck", () => {
  const cardinfo = commandBuilders.find((command) => command.name === "cardinfo");
  const option = (name) => cardinfo?.options?.find((entry) => entry.name === name);

  assert.equal(option("nom")?.autocomplete, true);
  assert.equal(option("deck")?.autocomplete, true);
  assert.equal(option("variant")?.autocomplete, undefined);
});
