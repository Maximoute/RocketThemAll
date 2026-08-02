import assert from "node:assert/strict";
import test from "node:test";

import { commandBuilders } from "../dist/commands/register.js";
import { showcardAutocompleteChoices } from "../dist/commands/showcard-autocomplete.js";

const ownedCards = [
  { id: "normal-owned", name: "Alpha", contentKey: "a", deckName: "Deck A", rarityWeight: 1, variant: "normal", quantity: 2 },
  { id: "shiny-owned", name: "Beta", contentKey: "b", deckName: "Deck B", rarityWeight: 2, variant: "shiny", quantity: 1 },
  { id: "holo-owned", name: "Gamma", contentKey: "g", deckName: "Deck C", rarityWeight: 1, variant: "holo", quantity: 1 }
];

test("showcard autocomplete exposes only supplied owned inventory ids", () => {
  const choices = showcardAutocompleteChoices(ownedCards, "");
  assert.deepEqual(choices.map((choice) => choice.value), [
    "holo-owned", "shiny-owned", "normal-owned"
  ]);
  assert.ok(choices.every((choice) => choice.name.includes("×")));
});

test("showcard autocomplete searches deck, Vault id and variant", () => {
  assert.deepEqual(
    showcardAutocompleteChoices(ownedCards, "shiny").map((choice) => choice.value),
    ["shiny-owned"]
  );
  assert.deepEqual(
    showcardAutocompleteChoices(ownedCards, "deck c").map((choice) => choice.value),
    ["holo-owned"]
  );
});

test("the registered showcard command requires an autocompleted card", () => {
  const showcard = commandBuilders.find((command) => command.name === "showcard");
  const card = showcard?.options?.find((option) => option.name === "carte");
  assert.equal(card?.required, true);
  assert.equal(card?.autocomplete, true);
});
