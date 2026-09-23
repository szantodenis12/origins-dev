import crypto from "node:crypto";
import type { Member } from "../db";
import type { MemberCard } from "../card";
import { googleIssuerId, googleServiceAccount } from "./google-auth.ts";

/**
 * Google Wallet pass shape, in one place.
 *
 * Both paths use these builders: the save link the web card hands out, and
 * the REST update that runs when a stamp lands (lib/wallet/google-api.ts).
 * They have to agree, or a card would change shape the first time it is
 * updated.
 */

export type TierKey = "circle" | "gold" | "student";

const DEFAULT_ISSUER_ID = "3388000000023190590";

export function tierKeyFor(member: Member, card: MemberCard): TierKey {
  if (card.gold.isGold) return "gold";
  if (member.isStudent) return "student";
  return "circle";
}

export const TIER_CLASS: Record<TierKey, { bg: string; name: string }> = {
  circle: { bg: "#d4d4b8", name: "Origins Circle" },
  gold: { bg: "#be9c54", name: "Origins Gold Circle" },
  student: { bg: "#1a1b19", name: "Origins Student Circle" },
};

function issuerId(): string {
  return googleIssuerId() || DEFAULT_ISSUER_ID;
}

export function loyaltyClassId(tier: TierKey): string {
  return `${issuerId()}.origins_${tier}`;
}

/**
 * Stable for the life of the member — deliberately free of the tier.
 *
 * The tier used to be baked in here (`<id>_circle`), which meant a member who
 * reached Gold pointed at an object id that had never been saved: their phone
 * kept showing the Circle object forever and no update could reach it. The
 * object now outlives the tier, and the tier moves by repointing classId.
 */
export function loyaltyObjectId(member: Member): string {
  return `${issuerId()}.${member.id}`;
}

/**
 * Ids handed out before the tier was removed from the object id. Cards saved
 * back then still live under one of these, so an update looks here when the
 * stable id turns up missing.
 */
export function legacyLoyaltyObjectIds(member: Member): string[] {
  return (["circle", "gold", "student"] as TierKey[]).map(
    (tier) => `${issuerId()}.${member.id}_${tier}`,
  );
}

function assetUrls(tier: TierKey): { logo: string; hero: string } {
  const supabaseUrl =
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    "https://lovlncplhieojxgwkerg.supabase.co";
  const base = `${supabaseUrl}/storage/v1/object/public/origins-photos/wallet`;
  const heroes: Record<TierKey, string> = {
    circle: `${base}/hero-circle-clean.png`,
    gold: `${base}/hero-gold.png`,
    student: `${base}/hero-student.png`,
  };
  return { logo: `${base}/program-logo.png`, hero: heroes[tier] };
}

export function appUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL || "https://app.originscafe.ro";
}

/**
 * The class carries everything shared by a tier: colours, programme name and
 * the hero art. Members move between tiers by changing which class their
 * object points at, so there is one class per tier and they are created once
 * (see scripts/google-wallet-setup.mjs), not on every save.
 */
export function buildLoyaltyClass(
  tier: TierKey,
  /**
   * Only ever set this when creating a class. Sending it on an update of an
   * approved class pushes it back into review, which would strip the live
   * classes of their approved state.
   */
  reviewStatus?: "UNDER_REVIEW",
): Record<string, unknown> {
  const { logo, hero } = assetUrls(tier);
  return {
    id: loyaltyClassId(tier),
    issuerName: "Origins Coffee & Drinks",
    programName: TIER_CLASS[tier].name,
    ...(reviewStatus ? { reviewStatus } : {}),
    programLogo: { sourceUri: { uri: logo } },
    heroImage: { sourceUri: { uri: hero } },
    hexBackgroundColor: TIER_CLASS[tier].bg,
  };
}

export function stampBalance(card: MemberCard): string {
  return `${Math.min(card.progress, card.spec.cycleLength)} / ${card.spec.cycleLength}`;
}

/**
 * The per-member object. `heroImage` is repeated at object level on purpose:
 * it is the one visual the tier owns that a member keeps even if the class
 * swap itself is refused.
 */
export function buildLoyaltyObject(
  member: Member,
  card: MemberCard,
  tier: TierKey = tierKeyFor(member, card),
): Record<string, unknown> {
  const { hero } = assetUrls(tier);
  return {
    id: loyaltyObjectId(member),
    classId: loyaltyClassId(tier),
    state: member.blockedAt ? "COMPLETED" : "ACTIVE",
    accountId: member.passSerial,
    accountName: member.name,
    heroImage: { sourceUri: { uri: hero } },
    barcode: {
      type: "QR_CODE",
      value: member.passSerial,
      alternateText: member.passSerial,
    },
    loyaltyPoints: {
      label: "Ștampile",
      balance: { string: stampBalance(card) },
    },
    textModulesData: [
      { id: "tier", header: "Nivel", body: TIER_CLASS[tier].name },
      {
        id: "reward",
        header: "Recompensă",
        body:
          card.remaining === 0
            ? "Card complet! Cafea gratuită"
            : `Mai ai ${card.remaining} ștampile`,
      },
    ],
  };
}

function base64UrlEncode(strOrBuffer: string | Buffer): string {
  const buf =
    typeof strOrBuffer === "string" ? Buffer.from(strOrBuffer) : strOrBuffer;
  return buf.toString("base64url");
}

export function getGoogleWalletSaveUrl(
  member: Member,
  card: MemberCard,
): string {
  const account = googleServiceAccount();
  const tier = tierKeyFor(member, card);

  const payload = {
    iss: account?.email ?? "",
    aud: "google",
    typ: "savetogooglepay",
    iat: Math.floor(Date.now() / 1000),
    origins: [appUrl(), "http://localhost:4319"],
    payload: {
      // Google creates the class from this only if it does not exist yet, so
      // the review status here is the one a first-ever save would get.
      loyaltyClasses: [buildLoyaltyClass(tier, "UNDER_REVIEW")],
      loyaltyObjects: [buildLoyaltyObject(member, card, tier)],
    },
  };

  const encodedHeader = base64UrlEncode(
    JSON.stringify({ alg: "RS256", typ: "JWT" }),
  );
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const message = `${encodedHeader}.${encodedPayload}`;

  if (!account) {
    return `https://pay.google.com/gp/v/save/${encodeURIComponent(encodedPayload)}`;
  }

  try {
    const signer = crypto.createSign("RSA-SHA256");
    signer.update(message);
    const signature = signer.sign(account.privateKey, "base64url");
    return `https://pay.google.com/gp/v/save/${message}.${signature}`;
  } catch {
    return `https://pay.google.com/gp/v/save/${encodeURIComponent(encodedPayload)}`;
  }
}
