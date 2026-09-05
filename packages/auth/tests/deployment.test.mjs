import assert from "node:assert/strict";
import test from "node:test";
import {
  developmentSessionCookieName,
  isPrivateDevelopmentEnvironment,
  RTA_DEVELOPMENT_SESSION_COOKIE,
} from "../dist/deployment.js";

test("private development is enabled only by the explicit environment", () => {
  assert.equal(isPrivateDevelopmentEnvironment("development"), true);
  assert.equal(isPrivateDevelopmentEnvironment(" DEVELOPMENT "), true);
  assert.equal(isPrivateDevelopmentEnvironment("production"), false);
  assert.equal(isPrivateDevelopmentEnvironment(undefined), false);
});

test("production keeps NextAuth defaults while development uses an isolated cookie", () => {
  assert.equal(
    developmentSessionCookieName("development"),
    RTA_DEVELOPMENT_SESSION_COOKIE,
  );
  assert.equal(developmentSessionCookieName("production"), undefined);
});
