import assert from "node:assert/strict";
import test from "node:test";

import { commandBuilders } from "../dist/commands/register.js";

test("fusion requires explicit autocompleted sacrifices and exposes history without a rarity", () => {
  const fusion = commandBuilders.find((command) => command.name === "fusion");
  const rarity = fusion?.options?.find((option) => option.name === "rarity");
  const sacrificeOptions = fusion?.options?.filter((option) =>
    option.name.startsWith("carte_")
  ) ?? [];

  assert.equal(rarity?.required, false);
  assert.equal(sacrificeOptions.length, 6);
  assert.ok(sacrificeOptions.every((option) => option.autocomplete === true));
  assert.ok(sacrificeOptions.every((option) => option.required === false));
});
