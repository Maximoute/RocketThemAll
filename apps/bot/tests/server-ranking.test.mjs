import assert from "node:assert/strict";
import test from "node:test";

import {
  rankServerEntries,
  serverProgressBar,
  serverProgressPercent
} from "../dist/server-ranking.js";

test("server ranking prioritizes unlocked worlds then current progress", () => {
  const ranked = rankServerEntries([
    { name: "Monde 1", unlockedWorldCount: 1, mastery: 200, masteryTarget: 250 },
    { name: "Monde 3", unlockedWorldCount: 3, mastery: 70, masteryTarget: 700 },
    { name: "Monde 2", unlockedWorldCount: 2, mastery: 450, masteryTarget: 500 }
  ]);

  assert.deepEqual(ranked.map((entry) => entry.name), ["Monde 3", "Monde 2", "Monde 1"]);
  assert.deepEqual(ranked.map((entry) => entry.rank), [1, 2, 3]);
  assert.deepEqual(ranked.map((entry) => entry.score), [210, 190, 80]);
});

test("server progress is capped and rendered as a compact bar", () => {
  assert.equal(serverProgressPercent(155, 250), 62);
  assert.equal(serverProgressPercent(300, 250), 100);
  assert.equal(serverProgressPercent(10, 0), 0);
  assert.equal(serverProgressBar(62), "██████░░░░ 62 %");
});
