import assert from "node:assert/strict";
import test from "node:test";
import {
  createInteractionToken,
  parseInteractionToken
} from "../dist/commands/interaction-token.js";

const originalNextAuthSecret = process.env.NEXTAUTH_SECRET;
const originalDiscordToken = process.env.DISCORD_TOKEN;

test.afterEach(() => {
  if (originalNextAuthSecret === undefined) delete process.env.NEXTAUTH_SECRET;
  else process.env.NEXTAUTH_SECRET = originalNextAuthSecret;
  if (originalDiscordToken === undefined) delete process.env.DISCORD_TOKEN;
  else process.env.DISCORD_TOKEN = originalDiscordToken;
});

test("signed interaction tokens round-trip and reject tampering", () => {
  process.env.NEXTAUTH_SECRET = "test-secret-that-is-at-least-32-characters";
  const token = createInteractionToken("g", "profile");
  assert.deepEqual(parseInteractionToken(token), { action: "g", parts: ["profile"] });
  const tampered = token.replace("profile", "boss");
  assert.throws(() => parseInteractionToken(tampered));
});

test("interaction token input cannot inject delimiters", () => {
  process.env.NEXTAUTH_SECRET = "test-secret-that-is-at-least-32-characters";
  assert.throws(() => createInteractionToken("g|admin", "profile"));
  assert.throws(() => createInteractionToken("g", "profile|admin"));
  assert.throws(() => createInteractionToken("g", ""));
});

test("interaction signing fails closed without a strong secret", () => {
  delete process.env.NEXTAUTH_SECRET;
  delete process.env.DISCORD_TOKEN;
  assert.throws(() => createInteractionToken("g", "profile"));
  process.env.NEXTAUTH_SECRET = "too-short";
  assert.throws(() => createInteractionToken("g", "profile"));
});
