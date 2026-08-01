import assert from "node:assert/strict";
import test from "node:test";

import { bossVictoryRewardDescription } from "../dist/commands/boss-victory.js";

test("boss victory clearly lists currency rewards and an empty conqueror roll", () => {
  assert.equal(
    bossVictoryRewardDescription({
      credits: 260,
      xp: 180,
      fragments: 3,
      conquerorDrops: []
    }),
    "💳 **260 crédits** · ⭐ **180 XP** · 🧩 **3 fragment(s)**\n" +
      "🎲 Objet de conquérant : **aucun sur ce jet**"
  );
});

test("boss victory names granted booster and chest tiers", () => {
  const description = bossVictoryRewardDescription({
    credits: 100,
    xp: 50,
    fragments: 1,
    conquerorDrops: [
      { type: "booster", itemKey: "booster.boss_choice.rare" },
      { type: "chest", itemKey: "chest.boss_reward.epic" }
    ]
  });

  assert.match(description, /Booster Rare/);
  assert.match(description, /Coffre Épique/);
});
