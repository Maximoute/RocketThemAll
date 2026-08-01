import assert from "node:assert/strict";
import test from "node:test";
import {
  browserMutationGuard,
  resolveFrontendOrigin,
  securityHeaders
} from "../dist/middleware/security.js";
import { errorHandler } from "../dist/middleware/error-handler.js";
import { boundedPositiveInteger } from "../dist/routes/cards.routes.js";

function mockRequest({ method = "POST", headers = {}, contentType = "application/json" } = {}) {
  const normalized = Object.fromEntries(
    Object.entries(headers).map(([key, value]) => [key.toLowerCase(), value])
  );
  return {
    method,
    header(name) {
      return normalized[name.toLowerCase()];
    },
    is(expected) {
      if (expected === "application/json") return contentType.startsWith("application/json");
      if (expected === "application/*+json") return /^application\/.+\+json/.test(contentType);
      return false;
    }
  };
}

function mockResponse() {
  const headers = new Map();
  return {
    headers,
    statusCode: 200,
    payload: undefined,
    setHeader(name, value) {
      headers.set(name.toLowerCase(), value);
    },
    removeHeader(name) {
      headers.delete(name.toLowerCase());
    },
    status(value) {
      this.statusCode = value;
      return this;
    },
    json(value) {
      this.payload = value;
      return this;
    }
  };
}

test("frontend origin validation fails closed in production", () => {
  assert.throws(() => resolveFrontendOrigin(undefined, "production"));
  assert.throws(() => resolveFrontendOrigin("http://rta.example", "production"));
  assert.throws(() => resolveFrontendOrigin("https://rta.example/path", "production"));
  assert.equal(resolveFrontendOrigin("https://rta.example/", "production"), "https://rta.example");
  assert.equal(resolveFrontendOrigin("http://localhost:8080", "production"), "http://localhost:8080");
});

test("cross-site browser mutations are rejected before route execution", () => {
  const guard = browserMutationGuard("https://rta.example");
  const response = mockResponse();
  let nextCalled = false;
  guard(
    mockRequest({ headers: { origin: "https://evil.example", "sec-fetch-site": "cross-site" } }),
    response,
    () => { nextCalled = true; }
  );
  assert.equal(response.statusCode, 403);
  assert.equal(nextCalled, false);
});

test("same-origin JSON and server-to-server mutations remain accepted", () => {
  const guard = browserMutationGuard("https://rta.example");
  for (const headers of [{ origin: "https://rta.example" }, {}]) {
    const response = mockResponse();
    let nextCalled = false;
    guard(mockRequest({ headers }), response, () => { nextCalled = true; });
    assert.equal(response.statusCode, 200);
    assert.equal(nextCalled, true);
  }
});

test("non-JSON mutations are rejected", () => {
  const response = mockResponse();
  browserMutationGuard("https://rta.example")(
    mockRequest({ contentType: "text/plain" }),
    response,
    () => assert.fail("route should not run")
  );
  assert.equal(response.statusCode, 415);
});

test("API security headers remove framework disclosure and deny framing", () => {
  const response = mockResponse();
  response.headers.set("x-powered-by", "Express");
  let nextCalled = false;
  securityHeaders(mockRequest({ method: "GET" }), response, () => { nextCalled = true; });
  assert.equal(nextCalled, true);
  assert.equal(response.headers.has("x-powered-by"), false);
  assert.equal(response.headers.get("x-frame-options"), "DENY");
  assert.match(response.headers.get("content-security-policy"), /default-src 'none'/);
});

test("malformed and oversized JSON return safe client errors, never 500", () => {
  for (const [type, expectedStatus] of [
    ["entity.parse.failed", 400],
    ["entity.too.large", 413],
    ["encoding.unsupported", 415]
  ]) {
    const response = mockResponse();
    errorHandler(
      Object.assign(new SyntaxError("sensitive parser detail"), { type }),
      { path: "/trades" },
      response,
      () => assert.fail("error middleware must terminate the response")
    );
    assert.equal(response.statusCode, expectedStatus);
    assert.doesNotMatch(JSON.stringify(response.payload), /sensitive parser detail/);
  }
});

test("public catalog pagination rejects abusive offsets and page sizes", () => {
  assert.equal(boundedPositiveInteger(undefined, 50, 100), 50);
  assert.equal(boundedPositiveInteger("100", 50, 100), 100);
  for (const value of ["0", "-1", "1.5", "101", "999999999999999999999", ["1", "2"]]) {
    assert.equal(boundedPositiveInteger(value, 50, 100), null);
  }
});
