import assert from "node:assert/strict";
import test from "node:test";

import {
  bossProgressBar,
  bossProgressPercent
} from "../dist/commands/boss-progress.js";

test("boss progress exposes an exact, capped percentage", () => {
  assert.equal(bossProgressPercent(25, 100), 25);
  assert.equal(bossProgressPercent(150, 100), 100);
  assert.equal(bossProgressPercent(-10, 100), 0);
  assert.equal(bossProgressPercent(10, 0), 0);
});

test("boss progress renders a compact visual bar", () => {
  assert.equal(bossProgressBar(25, 100), "███░░░░░░░░░ 25 %");
  assert.equal(bossProgressBar(100, 100), "████████████ 100 %");
  assert.equal(bossProgressBar(0, 0), "░░░░░░░░░░░░ 0 %");
});
