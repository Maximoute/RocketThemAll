import assert from "node:assert/strict";
import test from "node:test";

import {
  hallOfFameAnnouncementCopy,
  isHallOfFameVariant
} from "../dist/commands/hall-of-fame.js";

test("only shiny and holo captures qualify for the Hall of Fame", () => {
  assert.equal(isHallOfFameVariant("shiny"), true);
  assert.equal(isHallOfFameVariant("holo"), true);
  assert.equal(isHallOfFameVariant("normal"), false);
  assert.equal(isHallOfFameVariant(null), false);
});

test("partner discoveries identify both the player and source server", () => {
  const copy = hallOfFameAnnouncementCopy({
    playerDiscordId: "1415044421103390865",
    playerDisplayName: "Monsieur X",
    cardName: "Carte cosmique",
    sourceGuildName: "CarDex",
    variant: "shiny"
  });

  assert.match(copy.content, /Monsieur X/);
  assert.match(copy.content, /CarDex/);
  assert.match(copy.description, /<@1415044421103390865>/);
  assert.match(copy.description, /Carte cosmique/);
  assert.match(copy.description, /SHINY/);
  assert.match(copy.description, /serveur partenaire \*\*CarDex\*\*/);
});
