import crypto from "node:crypto";
import type { Member } from "../db";
import type { MemberCard } from "../card";

function base64UrlEncode(strOrBuffer: string | Buffer): string {
  const buf = typeof strOrBuffer === "string" ? Buffer.from(strOrBuffer) : strOrBuffer;
  return buf.toString("base64url");
}

export function getGoogleWalletSaveUrl(
  member: Member,
  card: MemberCard,
): string {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://app.originscafe.ro";
  const issuerId = process.env.GOOGLE_WALLET_ISSUER_ID || "3388000000023190590";
  const clientEmail =
    process.env.GOOGLE_WALLET_SERVICE_ACCOUNT_EMAIL ||
    "origins-wallet-service@origins-caffe.iam.gserviceaccount.com";
  const privateKeyRaw = process.env.GOOGLE_WALLET_PRIVATE_KEY;

  const tierKey = card.gold.isGold
    ? "gold"
    : member.isStudent
      ? "student"
      : "circle";

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://lovlncplhieojxgwkerg.supabase.co";
  const logoUrl = `${supabaseUrl}/storage/v1/object/public/origins-photos/wallet/program-logo.png`;

  // Dynamic hero image per member with real member name and live stamp progress
  const heroImageUrl = `${appUrl}/api/v1/passes/hero/${member.passSerial}.png`;

  const classColors: Record<string, { bg: string; name: string }> = {
    circle: { bg: "#d4d4b8", name: "Origins Circle" },
    gold: { bg: "#be9c54", name: "Origins Gold Circle" },
    student: { bg: "#1a1b19", name: "Origins Student Circle" },
  };

  const currentTier = classColors[tierKey];

  const header = {
    alg: "RS256",
    typ: "JWT",
  };

  const payload = {
    iss: clientEmail,
    aud: "google",
    typ: "savetogooglepay",
    iat: Math.floor(Date.now() / 1000),
    origins: [appUrl, "http://localhost:4319"],
    payload: {
      loyaltyClasses: [
        {
          id: `${issuerId}.origins_${tierKey}`,
          issuerName: "Origins Coffee & Drinks",
          programName: currentTier.name,
          reviewStatus: "UNDER_REVIEW",
          programLogo: {
            sourceUri: {
              uri: logoUrl,
            },
          },
          hexBackgroundColor: currentTier.bg,
        },
      ],
      loyaltyObjects: [
        {
          id: `${issuerId}.${member.id}`,
          classId: `${issuerId}.origins_${tierKey}`,
          state: member.blockedAt ? "COMPLETED" : "ACTIVE",
          accountId: member.passSerial,
          accountName: member.name,
          heroImage: {
            sourceUri: {
              uri: heroImageUrl,
            },
          },
          barcode: {
            type: "QR_CODE",
            value: member.passSerial,
            alternateText: member.passSerial,
          },
          loyaltyPoints: {
            label: "Ștampile",
            balance: {
              string: `${Math.min(card.progress, card.spec.cycleLength)} / ${card.spec.cycleLength}`,
            },
          },
        },
      ],
    },
  };

  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const message = `${encodedHeader}.${encodedPayload}`;

  if (!privateKeyRaw) {
    return `https://pay.google.com/gp/v/save/${encodeURIComponent(encodedPayload)}`;
  }

  try {
    const formattedPrivateKey = privateKeyRaw.replace(/\\n/g, "\n");
    const signer = crypto.createSign("RSA-SHA256");
    signer.update(message);
    const signature = signer.sign(formattedPrivateKey, "base64url");
    const jwt = `${message}.${signature}`;
    return `https://pay.google.com/gp/v/save/${jwt}`;
  } catch {
    return `https://pay.google.com/gp/v/save/${encodeURIComponent(encodedPayload)}`;
  }
}
