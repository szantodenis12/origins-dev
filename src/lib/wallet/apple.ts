import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { zipSync } from "fflate";
import type { Member } from "../db";
import type { LoyaltyConfig } from "../loyalty";
import type { MemberCard } from "../card";

interface ApplePassColors {
  background: string;
  foreground: string;
  label: string;
  logo: string;
  strip: string;
}

const TIER_CONFIGS = {
  circle: {
    background: "rgb(212, 212, 184)",
    foreground: "rgb(42, 59, 31)",
    label: "rgb(92, 107, 74)",
    logo: "logo-forest",
    strip: "strip-circle",
    logoText: "Circle",
  },
  gold: {
    background: "rgb(190, 156, 84)",
    foreground: "rgb(58, 49, 19)",
    label: "rgb(110, 88, 38)",
    logo: "logo-forest",
    strip: "strip-gold",
    logoText: "Gold Circle",
  },
  student: {
    background: "rgb(26, 27, 25)",
    foreground: "rgb(207, 213, 173)",
    label: "rgb(143, 154, 112)",
    logo: "logo-pale",
    strip: "strip-student",
    logoText: "Student Circle",
  },
};

const ORIGINS_LOCATIONS = [
  {
    latitude: 47.0425,
    longitude: 21.9056,
    relevantText: "Ești la Origins ERA Shopping Park. Scanează cardul la casă!",
  },
  {
    latitude: 47.0708,
    longitude: 21.9167,
    relevantText: "Ești la Origins Rogerius. Scanează cardul la casă!",
  },
  {
    latitude: 47.0512,
    longitude: 21.9284,
    relevantText: "Ești la Origins Orășelul Copiilor. Scanează cardul la casă!",
  },
  {
    latitude: 47.0655,
    longitude: 21.9361,
    relevantText: "Ești la Origins Gara Mare. Scanează cardul la casă!",
  },
  {
    latitude: 47.056,
    longitude: 21.9348,
    relevantText: "Ești la Origins Str. Aurel Lazăr. Scanează cardul la casă!",
  },
];

export async function buildApplePass(
  member: Member,
  card: MemberCard,
  config: LoyaltyConfig,
): Promise<Uint8Array> {
  const tierKey = card.gold.isGold
    ? "gold"
    : member.isStudent
      ? "student"
      : "circle";
  const tier = TIER_CONFIGS[tierKey];

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://app.originscafe.ro";
  const passTypeId =
    process.env.APPLE_PASS_TYPE_ID || "pass.ro.originscafe.circle";
  const teamId = process.env.APPLE_TEAM_ID || "TEAM_ID_APPLE";

  const stampsCount = Math.min(card.progress, card.spec.cycleLength);
  const totalStamps = card.spec.cycleLength;

  const monthYear = new Date(member.createdAt).toLocaleDateString("ro-RO", {
    month: "long",
    year: "numeric",
  });

  const passJson: Record<string, any> = {
    formatVersion: 1,
    passTypeIdentifier: passTypeId,
    teamIdentifier: teamId,
    organizationName: "Origins Cafe",
    description: `Origins ${tier.logoText}`,
    serialNumber: member.passSerial,
    logoText: tier.logoText,
    webServiceURL: `${appUrl}/api/v1/passes/v1/`,
    authenticationToken: crypto
      .createHash("sha256")
      .update(`${member.id}-${member.passSerial}-secret`)
      .digest("hex")
      .substring(0, 32),

    backgroundColor: tier.background,
    foregroundColor: tier.foreground,
    labelColor: tier.label,
    sharingProhibited: true,

    storeCard: {
      headerFields: [
        {
          key: "stamps",
          label: "ȘTAMPILE",
          value: `${stampsCount} / ${totalStamps}`,
        },
      ],
      primaryFields: [],
      secondaryFields: [
        {
          key: "reward",
          label: "RECOMPENSĂ",
          value:
            stampsCount >= totalStamps
              ? "Card complet! Ai o cafea gratuită din partea casei"
              : `Mai ai ${totalStamps - stampsCount} ștampile până la cafeaua gratuită`,
        },
      ],
      auxiliaryFields: [
        { key: "since", label: "MEMBRU DIN", value: monthYear },
        { key: "serial", label: "CARD", value: member.passSerial },
      ],
      backFields: [
        {
          key: "cum",
          label: "Cum funcționează",
          value:
            "Arată codul la casă la fiecare comandă. La 5 ștampile, a șasea cafea e din partea casei.",
        },
        {
          key: "regulament",
          label: "Regulament",
          value: `${appUrl}/regulament`,
        },
        {
          key: "confidentialitate",
          label: "Confidențialitate",
          value: `${appUrl}/confidentialitate`,
        },
        {
          key: "card_web",
          label: "Cardul în browser",
          value: `${appUrl}/card/${member.id}`,
        },
      ],
    },

    barcodes: [
      {
        format: "PKBarcodeFormatQR",
        message: member.passSerial,
        messageEncoding: "iso-8859-1",
        altText: member.passSerial,
      },
    ],

    locations: ORIGINS_LOCATIONS,
  };

  const files: Record<string, Uint8Array> = {};

  files["pass.json"] = Buffer.from(JSON.stringify(passJson, null, 2));

  const walletDir = path.join(process.cwd(), "public", "wallet", "apple");

  const readAsset = (filename: string): Uint8Array | null => {
    try {
      const p = path.join(walletDir, filename);
      if (fs.existsSync(p)) return fs.readFileSync(p);
    } catch {}
    return null;
  };

  // Add icons
  for (const name of ["icon.png", "icon@2x.png", "icon@3x.png"]) {
    const data = readAsset(name);
    if (data) files[name] = data;
  }

  // Add logos
  const logoMap: Record<string, string> = {
    [`${tier.logo}.png`]: "logo.png",
    [`${tier.logo}@2x.png`]: "logo@2x.png",
    [`${tier.logo}@3x.png`]: "logo@3x.png",
  };

  for (const [srcName, destName] of Object.entries(logoMap)) {
    const data = readAsset(srcName);
    if (data) files[destName] = data;
  }

  // Add strips
  const stripMap: Record<string, string> = {
    [`${tier.strip}.png`]: "strip.png",
    [`${tier.strip}@2x.png`]: "strip@2x.png",
    [`${tier.strip}@3x.png`]: "strip@3x.png",
  };

  for (const [srcName, destName] of Object.entries(stripMap)) {
    const data = readAsset(srcName);
    if (data) files[destName] = data;
  }

  // Build manifest.json
  const manifest: Record<string, string> = {};
  for (const [filename, content] of Object.entries(files)) {
    const hash = crypto.createHash("sha1").update(content).digest("hex");
    manifest[filename] = hash;
  }

  files["manifest.json"] = Buffer.from(JSON.stringify(manifest, null, 2));

  // Placeholder PKCS#7 signature or real certificate signature if configured
  files["signature"] = Buffer.from("DEVELOPMENT_UNSIGNED_PASS_MANIFEST");

  return zipSync(files);
}
