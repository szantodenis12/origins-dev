#!/usr/bin/env node
/**
 * Create (or refresh) the three Origins loyalty classes in Google Wallet, then
 * report what the API says about them.
 *
 * Run once after the service account has been granted access in the Google Pay
 * & Wallet Console, and again whenever the class artwork or names change:
 *
 *   node scripts/google-wallet-setup.mjs
 *
 * It reads .env.local, so it needs no arguments. Nothing here touches members'
 * passes — only the shared class definitions they point at.
 */

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const ROOT = process.cwd();

function loadEnv() {
  for (const file of [".env.local", ".env"]) {
    const full = path.join(ROOT, file);
    if (!fs.existsSync(full)) continue;
    for (const line of fs.readFileSync(full, "utf8").split(/\r?\n/)) {
      if (!line || line.startsWith("#") || !line.includes("=")) continue;
      const i = line.indexOf("=");
      const key = line.slice(0, i).trim();
      // Next's own loader strips surrounding quotes; this one has to as well,
      // or the PEM arrives wrapped and node:crypto refuses to read it.
      const value = line
        .slice(i + 1)
        .trim()
        .replace(/^(['"])([\s\S]*)\1$/, "$2");
      if (!process.env[key]) process.env[key] = value;
    }
  }
}

loadEnv();

const ISSUER_ID = process.env.GOOGLE_WALLET_ISSUER_ID;
const CLIENT_EMAIL = process.env.GOOGLE_WALLET_SERVICE_ACCOUNT_EMAIL;
const PRIVATE_KEY = (process.env.GOOGLE_WALLET_PRIVATE_KEY || "").replace(
  /\\n/g,
  "\n",
);
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "";

if (!ISSUER_ID || !CLIENT_EMAIL || !PRIVATE_KEY) {
  console.error(
    "Missing GOOGLE_WALLET_ISSUER_ID, GOOGLE_WALLET_SERVICE_ACCOUNT_EMAIL or GOOGLE_WALLET_PRIVATE_KEY.",
  );
  process.exit(1);
}

const TIERS = {
  circle: { bg: "#d4d4b8", name: "Origins Circle", hero: "hero-circle-clean" },
  gold: { bg: "#be9c54", name: "Origins Gold Circle", hero: "hero-gold" },
  student: { bg: "#1a1b19", name: "Origins Student Circle", hero: "hero-student" },
};

const b64 = (v) => Buffer.from(v).toString("base64url");

async function accessToken() {
  const iat = Math.floor(Date.now() / 1000);
  const header = b64(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = b64(
    JSON.stringify({
      iss: CLIENT_EMAIL,
      scope: "https://www.googleapis.com/auth/wallet_object.issuer",
      aud: "https://oauth2.googleapis.com/token",
      iat,
      exp: iat + 3600,
    }),
  );
  const signer = crypto.createSign("RSA-SHA256");
  signer.update(`${header}.${claims}`);
  const assertion = `${header}.${claims}.${signer.sign(PRIVATE_KEY, "base64url")}`;

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });
  const body = await res.json();
  if (!res.ok) {
    throw new Error(
      `Token request failed (${res.status}): ${JSON.stringify(body)}\n` +
        "Most often this means the Google Wallet API is not enabled on the " +
        "project, or the service account has no issuer access yet.",
    );
  }
  return body.access_token;
}

const BASE = "https://walletobjects.googleapis.com/walletobjects/v1";

async function call(token, method, url, body) {
  const res = await fetch(`${BASE}/${url}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { ok: res.ok, status: res.status, text: await res.text() };
}

/**
 * `reviewStatus` is only ever sent when creating a class. Sending it on an
 * update pushes an already approved class back into review, which would undo
 * the approval the live classes hold.
 */
function classDefinition(tier, creating) {
  const t = TIERS[tier];
  const assets = `${SUPABASE_URL}/storage/v1/object/public/origins-photos/wallet`;
  return {
    id: `${ISSUER_ID}.origins_${tier}`,
    issuerName: "Origins Coffee & Drinks",
    programName: t.name,
    ...(creating ? { reviewStatus: "UNDER_REVIEW" } : {}),
    programLogo: { sourceUri: { uri: `${assets}/program-logo.png` } },
    heroImage: { sourceUri: { uri: `${assets}/${t.hero}.png` } },
    hexBackgroundColor: t.bg,
  };
}

const token = await accessToken();
console.log("Authenticated as", CLIENT_EMAIL);
console.log("Issuer", ISSUER_ID, "\n");

for (const tier of Object.keys(TIERS)) {
  const id = `${ISSUER_ID}.origins_${tier}`;

  const existing = await call(token, "GET", `loyaltyClass/${id}`);
  // PATCH, not PUT: a full replace would drop any field this script does not
  // know about, and an existing class keeps the review state it has earned.
  const res = existing.ok
    ? await call(token, "PATCH", `loyaltyClass/${id}`, classDefinition(tier, false))
    : await call(token, "POST", "loyaltyClass", classDefinition(tier, true));

  if (!res.ok) {
    console.log(`✗ ${tier.padEnd(8)} ${res.status}: ${res.text.slice(0, 400)}`);
    continue;
  }

  const parsed = JSON.parse(res.text);
  console.log(
    `✓ ${tier.padEnd(8)} ${existing.ok ? "updated" : "created"}  reviewStatus=${parsed.reviewStatus}`,
  );
}

console.log(
  "\nA newly created class stays UNDER_REVIEW until Google approves it. " +
    "An existing class keeps whatever state it already has — this script " +
    "never resubmits an approved class for review.",
);
