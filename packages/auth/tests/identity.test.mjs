import assert from "node:assert/strict";
import test from "node:test";
import {
  isDiscordSnowflake,
  sessionMatchesPersistedIdentity
} from "../dist/identity.js";

test("Discord identities accept snowflakes, never usernames", () => {
  assert.equal(isDiscordSnowflake("1415044421103390865"), true);
  assert.equal(isDiscordSnowflake("1505371908621729954"), true);
  assert.equal(isDiscordSnowflake("maximoute"), false);
  assert.equal(isDiscordSnowflake("000000000000000001"), false);
  assert.equal(isDiscordSnowflake("1234567890123456"), false);
});

test("a session must match both the Discord snowflake and internal user id", () => {
  const persisted = {
    id: "2b85f871-4019-476c-8b37-2b77ba54f44e",
    discordId: "1505371908621729954",
    username: "maximoute"
  };

  assert.equal(sessionMatchesPersistedIdentity({
    id: persisted.id,
    discordId: persisted.discordId
  }, persisted), true);

  assert.equal(sessionMatchesPersistedIdentity({
    id: "38d17410-ec56-4bd1-a36a-e5783f8593d8",
    discordId: persisted.discordId
  }, persisted), false);

  assert.equal(sessionMatchesPersistedIdentity({
    id: persisted.id,
    discordId: "1415044421103390865"
  }, persisted), false);
});

test("copying an admin username cannot change the identity decision", () => {
  const persisted = {
    id: "2b85f871-4019-476c-8b37-2b77ba54f44e",
    discordId: "1505371908621729954",
    username: "copied-admin-name"
  };
  const attackerSession = {
    id: "38d17410-ec56-4bd1-a36a-e5783f8593d8",
    discordId: "1415044421103390865",
    username: "copied-admin-name"
  };

  assert.equal(sessionMatchesPersistedIdentity(attackerSession, persisted), false);
});
