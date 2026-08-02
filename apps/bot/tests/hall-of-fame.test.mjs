import assert from "node:assert/strict";
import test from "node:test";

import { isHallOfFameVariant } from "../dist/commands/hall-of-fame.js";

test("only shiny and holo captures qualify for the Hall of Fame", () => {
  assert.equal(isHallOfFameVariant("shiny"), true);
  assert.equal(isHallOfFameVariant("holo"), true);
  assert.equal(isHallOfFameVariant("normal"), false);
  assert.equal(isHallOfFameVariant(null), false);
});
