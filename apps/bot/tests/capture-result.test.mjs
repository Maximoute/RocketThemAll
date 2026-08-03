import assert from "node:assert/strict";
import test from "node:test";

import { captureResultColor } from "../dist/commands/capture-result.js";

test("capture result colors distinguish every obtained variant", () => {
  assert.equal(captureResultColor(true, "normal"), 0x2ecc71);
  assert.equal(captureResultColor(true, "shiny"), 0x00d2d3);
  assert.equal(captureResultColor(true, "holo"), 0xffb300);
  assert.equal(captureResultColor(false, "holo"), 0xe74c3c);
});
