#!/usr/bin/env node
/**
 * Read-only check of the Google Wallet setup. Creates and changes nothing.
 *
 *   node scripts/google-wallet-check.mjs
 *
 * Run it after each setup step; it names the next thing that is missing
 * instead of a raw HTTP status.
 */

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

function loadEnv() {
  for (const file of [".env.local", ".env"]) {
    const full = path.join(process.cwd(), file);
    if (!fs.existsSync(full)) continue;
    for (const line of fs.readFileSync(full, "utf8").split(/\r?\n/)) {
      if (!line || line.startsWith("#") || !line.includes("=")) continue;
      const i = line.indexOf("=");
      const key = line.slice(0, i).trim();
      // Next's loader strips surrounding quotes; without this the PEM arrives
      // wrapped and node:crypto refuses to read it.
      const value = line
        .slice(i + 1)
        .trim()
        .replace(/^(['"])([\s\S]*)\1$/, "$2");
      if (process.env[key] === undefined) process.env[key] = value;
    }
  }
}

loadEnv();

const ISSUER = process.env.GOOGLE_WALLET_ISSUER_ID;
const EMAIL = process.env.GOOGLE_WALLET_SERVICE_ACCOUNT_EMAIL;
const KEY = (process.env.GOOGLE_WALLET_PRIVATE_KEY || "").replace(/\\n/g, "\n");

const ok = (m) => console.log(`  ok    ${m}`);
const bad = (m) => console.log(`  FAIL  ${m}`);

console.log("\n1. Credentials in the environment");
if (!ISSUER) bad("GOOGLE_WALLET_ISSUER_ID missing");
else ok(`issuer ${ISSUER}`);
if (!EMAIL) bad("GOOGLE_WALLET_SERVICE_ACCOUNT_EMAIL missing");
else ok(`service account ${EMAIL}`);
if (!KEY.includes("BEGIN")) bad("GOOGLE_WALLET_PRIVATE_KEY missing or malformed");
else if (!KEY.includes("\n")) bad("private key has no newlines — check the \\n escaping");
else ok("private key parses");
if (!ISSUER || !EMAIL || !KEY.includes("BEGIN")) process.exit(1);

console.log("\n2. Service account can obtain a token");
const b64 = (v) => Buffer.from(v).toString("base64url");
const iat = Math.floor(Date.now() / 1000);
const header = b64(JSON.stringify({ alg: "RS256", typ: "JWT" }));
const claims = b64(
  JSON.stringify({
    iss: EMAIL,
    scope: "https://www.googleapis.com/auth/wallet_object.issuer",
    aud: "https://oauth2.googleapis.com/token",
    iat,
    exp: iat + 3600,
  }),
);

let token;
try {
  const signer = crypto.createSign("RSA-SHA256");
  signer.update(`${header}.${claims}`);
  const assertion = `${header}.${claims}.${signer.sign(KEY, "base64url")}`;
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
    bad(`token refused (${res.status}): ${JSON.stringify(body)}`);
    process.exit(1);
  }
  token = body.access_token;
  ok("token obtained");
} catch (err) {
  bad(`could not sign the assertion: ${err.message}`);
  process.exit(1);
}

const BASE = "https://walletobjects.googleapis.com/walletobjects/v1";
const get = async (u) => {
  const r = await fetch(`${BASE}/${u}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return { status: r.status, text: await r.text() };
};

console.log("\n3. Wallet API reachable, service account authorised");
const list = await get(`loyaltyClass?issuerId=${ISSUER}`);

if (list.status === 403 && /has not been used in project|is disabled/i.test(list.text)) {
  const project = list.text.match(/project (\d+)/)?.[1];
  bad("the Google Wallet API is not enabled on the Cloud project");
  console.log(
    `        Enable it: https://console.developers.google.com/apis/api/walletobjects.googleapis.com/overview${project ? `?project=${project}` : ""}`,
  );
  process.exit(1);
}

if (list.status === 403 || list.status === 401) {
  bad("authorised for the API, but not for this issuer");
  console.log(
    "        In the Google Pay & Wallet Console -> Google Wallet API -> Users,",
  );
  console.log(`        invite ${EMAIL} with access level "Developer".`);
  console.log(`        Response: ${list.text.slice(0, 300)}`);
  process.exit(1);
}

if (list.status !== 200) {
  bad(`unexpected HTTP ${list.status}: ${list.text.slice(0, 300)}`);
  process.exit(1);
}
ok("API enabled and issuer access granted");

console.log("\n4. Classes");
const classes = JSON.parse(list.text).resources || [];
if (classes.length === 0) {
  bad("no classes yet — run: node scripts/google-wallet-setup.mjs");
} else {
  for (const c of classes) {
    const objs = await get(`loyaltyObject?classId=${c.id}`);
    const count =
      objs.status === 200 ? (JSON.parse(objs.text).resources || []).length : "?";
    ok(`${c.id}  review=${c.reviewStatus}  saved passes=${count}`);
  }
}

console.log("\nDone.\n");
