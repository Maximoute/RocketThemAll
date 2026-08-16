import assert from "node:assert/strict";
import test from "node:test";
import { ChannelType, PermissionFlagsBits, PermissionsBitField } from "discord.js";

import { commandBuilders } from "../dist/commands/register.js";
import { canConfigureGuild } from "../dist/commands/handlers/setup.js";

test("setup is guild-only and defaults to Manage Guild", () => {
  const setup = commandBuilders.find((command) => command.name === "setup");
  assert.ok(setup);
  assert.equal(setup.dm_permission, false);
  assert.equal(setup.default_member_permissions, String(PermissionFlagsBits.ManageGuild));
  assert.equal(setup.options?.[0]?.required, true);
  assert.deepEqual(
    setup.options?.[0]?.channel_types,
    [ChannelType.GuildText, ChannelType.GuildAnnouncement]
  );
});

test("setup runtime authorization accepts only owners or Manage Guild", () => {
  assert.equal(canConfigureGuild(new PermissionsBitField(0n), true), true);
  assert.equal(
    canConfigureGuild(new PermissionsBitField(PermissionFlagsBits.ManageGuild), false),
    true
  );
  assert.equal(canConfigureGuild(new PermissionsBitField(0n), false), false);
  assert.equal(canConfigureGuild(null, false), false);
});
