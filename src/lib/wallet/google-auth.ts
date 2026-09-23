import crypto from "node:crypto";

/**
 * Service-account access tokens for the Google Wallet REST API.
 *
 * The save-to-wallet JWT (lib/wallet/google.ts) is signed locally and needs no
 * network call, but anything that *changes* a pass already on someone's phone
 * goes through walletobjects.googleapis.com, which wants a real OAuth token.
 * We mint one with the JWT-bearer grant so the only secret on the server stays
 * the same service-account key that already signs the save links.
 */

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const SCOPE = "https://www.googleapis.com/auth/wallet_object.issuer";
/** Refresh a minute early so a token never expires mid-request. */
const EXPIRY_SKEW_MS = 60_000;

export interface GoogleServiceAccount {
  email: string;
  privateKey: string;
}

let cachedToken: { token: string; expiresAt: number } | null = null;

function base64Url(input: string | Buffer): string {
  return (typeof input === "string" ? Buffer.from(input) : input).toString(
    "base64url",
  );
}

/**
 * The private key arrives from the environment with literal "\n" sequences
 * (Vercel stores it on one line), which node:crypto will not parse.
 */
export function googleServiceAccount(): GoogleServiceAccount | null {
  const email = process.env.GOOGLE_WALLET_SERVICE_ACCOUNT_EMAIL;
  const privateKeyRaw = process.env.GOOGLE_WALLET_PRIVATE_KEY;
  if (!email || !privateKeyRaw) return null;
  return { email, privateKey: privateKeyRaw.replace(/\\n/g, "\n") };
}

export function googleIssuerId(): string | null {
  return process.env.GOOGLE_WALLET_ISSUER_ID || null;
}

/** True when the server is configured to talk to the Wallet REST API. */
export function googleWalletConfigured(): boolean {
  return googleServiceAccount() !== null && googleIssuerId() !== null;
}

/**
 * A bearer token for walletobjects.googleapis.com, or null when the service
 * account is missing or Google refused the assertion. Cached in module scope:
 * a warm serverless instance stamping several cards reuses one token.
 */
export async function getWalletAccessToken(): Promise<string | null> {
  const now = Date.now();
  if (cachedToken && cachedToken.expiresAt > now + EXPIRY_SKEW_MS) {
    return cachedToken.token;
  }

  const account = googleServiceAccount();
  if (!account) return null;

  const issuedAt = Math.floor(now / 1000);
  const header = base64Url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = base64Url(
    JSON.stringify({
      iss: account.email,
      scope: SCOPE,
      aud: TOKEN_URL,
      iat: issuedAt,
      exp: issuedAt + 3600,
    }),
  );

  let assertion: string;
  try {
    const signer = crypto.createSign("RSA-SHA256");
    signer.update(`${header}.${claims}`);
    assertion = `${header}.${claims}.${signer.sign(account.privateKey, "base64url")}`;
  } catch (err) {
    console.error("[google-wallet] cannot sign token assertion:", err);
    return null;
  }

  try {
    const res = await fetch(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
        assertion,
      }),
      signal: AbortSignal.timeout(10_000),
    });

    if (!res.ok) {
      console.error(
        `[google-wallet] token request failed ${res.status}: ${(await res.text()).slice(0, 300)}`,
      );
      return null;
    }

    const body = (await res.json()) as {
      access_token?: string;
      expires_in?: number;
    };
    if (!body.access_token) return null;

    cachedToken = {
      token: body.access_token,
      expiresAt: now + (body.expires_in ?? 3600) * 1000,
    };
    return cachedToken.token;
  } catch (err) {
    console.error("[google-wallet] token request error:", err);
    return null;
  }
}
