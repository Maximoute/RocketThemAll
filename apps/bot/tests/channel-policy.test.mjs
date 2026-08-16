import assert from "node:assert/strict";
import test from "node:test";

import { decideCommandChannel } from "../dist/commands/channel-policy.js";

const config = {
  gameChannelId: "game",
  hallOfFameChannelId: "hall",
  hallOfFameEnabled: true
};

test("explore is restricted to the configured game channel", () => {
  assert.equal(decideCommandChannel({
    commandName: "explore", channelId: "game", guildId: "guild", config
  }).allowed, true);
  const denied = decideCommandChannel({
    commandName: "explore", channelId: "general", guildId: "guild", config
  });
  assert.equal(denied.allowed, false);
  assert.match(denied.message, /<#game>/);
});

test("setup remains available everywhere and missing-channel help names both setup paths", () => {
  assert.equal(decideCommandChannel({
    commandName: "setup", channelId: "general", guildId: "guild", config: null
  }).allowed, true);
  assert.equal(decideCommandChannel({
    commandName: "setup", channelId: "hall", guildId: "guild", config
  }).allowed, true);
  const denied = decideCommandChannel({
    commandName: "explore", channelId: "general", guildId: "guild", config: null
  });
  assert.equal(denied.allowed, false);
  assert.match(denied.message, /\/setup salon:/);
});

test("the Hall of Fame accepts showcard and rejects every other RTA command", () => {
  assert.equal(decideCommandChannel({
    commandName: "showcard", channelId: "hall", guildId: "guild", config
  }).allowed, true);
  for (const commandName of ["explore", "profile", "boss", "cardinfo"]) {
    const denied = decideCommandChannel({
      commandName, channelId: "hall", guildId: "guild", config
    });
    assert.equal(denied.allowed, false);
    assert.match(denied.message, /seule commande RTA.*showcard/i);
  }
});

test("showcard cannot be used outside the configured Hall of Fame", () => {
  const denied = decideCommandChannel({
    commandName: "showcard", channelId: "game", guildId: "guild", config
  });
  assert.equal(denied.allowed, false);
  assert.match(denied.message, /<#hall>/);
});

test("a selected but disabled Hall channel behaves like a normal channel", () => {
  const disabledConfig = { ...config, hallOfFameEnabled: false };
  assert.equal(decideCommandChannel({
    commandName: "profile",
    channelId: "hall",
    guildId: "guild",
    config: disabledConfig
  }).allowed, true);
  assert.equal(decideCommandChannel({
    commandName: "showcard",
    channelId: "hall",
    guildId: "guild",
    config: disabledConfig
  }).allowed, false);
});
