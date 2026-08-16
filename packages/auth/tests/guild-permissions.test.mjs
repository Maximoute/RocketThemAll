import assert from "node:assert/strict";
import test from "node:test";

import { hasGuildManagementPermission } from "../dist/guild-permissions.js";

const base = {
  guildId: "1505371908621729954",
  discordUserId: "1415044421103390865",
  ownerId: "100000000000000001",
  memberRoleIds: ["200000000000000001"],
  roles: [
    { id: "1505371908621729954", permissions: "0" },
    { id: "200000000000000001", permissions: "0" }
  ]
};

test("guild owners can configure their own guild", () => {
  assert.equal(hasGuildManagementPermission({
    ...base,
    ownerId: base.discordUserId
  }), true);
});

test("Manage Guild and Administrator roles grant configuration access", () => {
  assert.equal(hasGuildManagementPermission({
    ...base,
    roles: [
      base.roles[0],
      { id: base.memberRoleIds[0], permissions: String(1n << 5n) }
    ]
  }), true);
  assert.equal(hasGuildManagementPermission({
    ...base,
    roles: [
      base.roles[0],
      { id: base.memberRoleIds[0], permissions: String(1n << 3n) }
    ]
  }), true);
});

test("unrelated roles and malformed permission values deny access", () => {
  assert.equal(hasGuildManagementPermission({
    ...base,
    roles: [
      { id: base.guildId, permissions: "not-a-number" },
      { id: "role-not-held", permissions: String(1n << 5n) }
    ]
  }), false);
});
