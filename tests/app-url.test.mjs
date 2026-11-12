import assert from "node:assert/strict";
import test from "node:test";

// The origin the counter QR is built on: get it wrong and the member scans a
// link to localhost, or to whatever host a request claimed to be.
import { appOrigin, cardUrl } from "../src/lib/app-url.ts";
import { isMemberId } from "../src/lib/member-cookie.ts";

/** Headers-like stub: only `get` is used. */
function headers(map) {
  return { get: (name) => map[name.toLowerCase()] ?? null };
}

test("the forwarded host wins over the direct one", () => {
  const origin = appOrigin(
    headers({
      "x-forwarded-host": "app.originscafe.ro",
      "x-forwarded-proto": "https",
      host: "origins-platform.vercel.app",
    }),
  );
  assert.equal(origin, "https://app.originscafe.ro");
});

test("a proxy chain contributes only its first entry", () => {
  const origin = appOrigin(
    headers({
      "x-forwarded-host": "app.originscafe.ro, internal.vercel",
      "x-forwarded-proto": "https,http",
    }),
  );
  assert.equal(origin, "https://app.originscafe.ro");
});

test("dev has no forwarded headers and stays on http", () => {
  const origin = appOrigin(headers({ host: "localhost:3000" }), undefined, false);
  assert.equal(origin, "http://localhost:3000");
});

test("production without a proto header still assumes https", () => {
  const origin = appOrigin(headers({ host: "app.originscafe.ro" }), undefined, true);
  assert.equal(origin, "https://app.originscafe.ro");
});

test("APP_URL overrides the request and loses its trailing slash", () => {
  const origin = appOrigin(
    headers({ host: "origins-platform.vercel.app" }),
    "https://app.originscafe.ro/",
  );
  assert.equal(origin, "https://app.originscafe.ro");
  // An empty env var is not a configuration.
  assert.equal(
    appOrigin(headers({ host: "app.originscafe.ro" }), "   "),
    "https://app.originscafe.ro",
  );
});

test("a host that is not a hostname produces no origin", () => {
  assert.equal(appOrigin(headers({})), null);
  assert.equal(appOrigin(headers({ host: "" })), null);
  // Header injection attempts never reach a printed QR.
  assert.equal(appOrigin(headers({ host: "evil.ro/path" })), null);
  assert.equal(appOrigin(headers({ host: "evil.ro?x=1" })), null);
  assert.equal(appOrigin(headers({ host: "a b" })), null);
});

test("only a proto we know is honoured", () => {
  assert.equal(
    appOrigin(headers({ host: "app.originscafe.ro", "x-forwarded-proto": "javascript" })),
    "https://app.originscafe.ro",
  );
  assert.equal(
    appOrigin(headers({ host: "localhost:3000", "x-forwarded-proto": "http" })),
    "http://localhost:3000",
  );
});

test("cardUrl points at the member's web card", () => {
  assert.equal(
    cardUrl("https://app.originscafe.ro", "9f1c2f1e-0a3b-4c5d-8e7f-101112131415"),
    "https://app.originscafe.ro/card/9f1c2f1e-0a3b-4c5d-8e7f-101112131415",
  );
});

test("isMemberId accepts the ids the app issues and nothing exotic", () => {
  assert.equal(isMemberId("9f1c2f1e-0a3b-4c5d-8e7f-101112131415"), true);
  assert.equal(isMemberId("demo-7"), true);
  assert.equal(isMemberId(""), false);
  assert.equal(isMemberId("../admin"), false);
  assert.equal(isMemberId("demo 7"), false);
  assert.equal(isMemberId("a".repeat(65)), false);
});
