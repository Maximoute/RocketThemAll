import assert from "node:assert/strict";
import test from "node:test";

import { encounterPublicationNonce } from "../dist/commands/encounter-publication.js";

test("encounter publication nonces preserve UUID uniqueness within Discord's limit", () => {
  const first = encounterPublicationNonce("ffffffff-ffff-4fff-bfff-ffffffffffff");
  const second = encounterPublicationNonce("ffffffff-ffff-4fff-bfff-fffffffffffe");

  assert.ok(first.length <= 25);
  assert.ok(second.length <= 25);
  assert.notEqual(first, second);
  assert.equal(first, encounterPublicationNonce("ffffffff-ffff-4fff-bfff-ffffffffffff"));
});

test("encounter publication nonces reject malformed identifiers", () => {
  assert.throws(() => encounterPublicationNonce("not-an-encounter-id"));
});
