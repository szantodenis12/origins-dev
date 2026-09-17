import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { zipSync } from "fflate";
import forge from "node-forge";
import { ImageResponse } from "next/og";
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

const TIER_CONFIGS: Record<string, ApplePassColors> = {
  circle: {
    background: "rgb(212, 212, 184)",
    foreground: "rgb(42, 59, 31)",
    label: "rgb(92, 107, 74)",
    logo: "logo-forest",
    strip: "strip-circle",
  },
  gold: {
    background: "rgb(190, 156, 84)",
    foreground: "rgb(58, 49, 19)",
    label: "rgb(110, 88, 38)",
    logo: "logo-forest",
    strip: "strip-gold",
  },
  student: {
    background: "rgb(26, 27, 25)",
    foreground: "rgb(207, 213, 173)",
    label: "rgb(143, 154, 112)",
    logo: "logo-pale",
    strip: "strip-student",
  },
};

const ORIGINS_LOCATIONS = [
  {
    latitude: 47.0425,
    longitude: 21.9056,
    relevantText:
      "Ești la Origins ERA Shopping Park. Scanează cardul la casă!",
  },
  {
    latitude: 47.0708,
    longitude: 21.9167,
    relevantText: "Ești la Origins Rogerius. Scanează cardul la casă!",
  },
  {
    latitude: 47.0512,
    longitude: 21.9284,
    relevantText:
      "Ești la Origins Orășelul Copiilor. Scanează cardul la casă!",
  },
  {
    latitude: 47.0655,
    longitude: 21.9361,
    relevantText: "Ești la Origins Gara Mare. Scanează cardul la casă!",
  },
  {
    latitude: 47.056,
    longitude: 21.9348,
    relevantText:
      "Ești la Origins Str. Aurel Lazăr. Scanează cardul la casă!",
  },
];

/* ---------- load font helper ---------- */

async function loadFont(walletDir: string): Promise<ArrayBuffer> {
  const fontPath = path.join(walletDir, "Cormorant.ttf");
  if (fs.existsSync(fontPath)) {
    const buf = fs.readFileSync(fontPath);
    // Return a proper ArrayBuffer (avoid Node Buffer pool aliasing)
    return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  }
  // Fallback: fetch from public URL (Vercel CDN)
  const appUrl =
    process.env.NEXT_PUBLIC_APP_URL || "https://app.originscafe.ro";
  const res = await fetch(`${appUrl}/wallet/apple/Cormorant.ttf`);
  return res.arrayBuffer();
}

/* ---------- render strip with member name ---------- */

async function renderStripWithName(
  memberName: string,
  tierKey: string,
): Promise<Buffer | null> {
  try {
    const walletDir = path.join(process.cwd(), "public", "wallet", "apple");
    const tier = TIER_CONFIGS[tierKey];
    const fontData = await loadFont(walletDir);

    // Load base texture strip image as data-URI background
    const stripPath = path.join(walletDir, `${tier.strip}@3x.png`);
    let bgCss: Record<string, string>;
    if (fs.existsSync(stripPath)) {
      const base64 = fs.readFileSync(stripPath).toString("base64");
      bgCss = {
        backgroundImage: `url(data:image/png;base64,${base64})`,
        backgroundSize: "1125px 369px",
      };
    } else {
      bgCss = { backgroundColor: tier.background };
    }

    // Build the VDOM element (Satori accepts React-like objects)
    const element = {
      type: "div",
      props: {
        style: {
          display: "flex",
          width: "100%",
          height: "100%",
          alignItems: "center",
          justifyContent: "center",
          ...bgCss,
        },
        children: {
          type: "span",
          props: {
            style: {
              fontFamily: "Cormorant",
              fontSize: 54,
              color: tier.foreground,
              letterSpacing: "0.06em",
            },
            children: memberName,
          },
        },
      },
    };

    const response = new ImageResponse(element as React.ReactElement, {
      width: 1125,
      height: 369,
      fonts: [
        {
          name: "Cormorant",
          data: fontData,
          style: "normal" as const,
          weight: 400 as const,
        },
      ],
    });

    return Buffer.from(await response.arrayBuffer());
  } catch (err) {
    console.error("[apple-wallet] strip render error:", err);
    return null;
  }
}

/* ---------- PKCS#7 signing ---------- */

function signManifest(manifestJson: string): Buffer {
  const p12Base64 = process.env.APPLE_CERT_P12_BASE64;
  const p12Password = process.env.APPLE_CERT_PASSWORD ?? "origins2024";
  const wwdrPath = path.join(
    process.cwd(),
    "public",
    "wallet",
    "apple",
    "wwdr.pem",
  );

  if (!p12Base64) {
    return Buffer.from("UNSIGNED_PLACEHOLDER");
  }

  try {
    const p12Der = Buffer.from(p12Base64, "base64");
    const p12Asn1 = forge.asn1.fromDer(
      forge.util.binary.raw.encode(new Uint8Array(p12Der)),
    );
    const p12 = forge.pkcs12.pkcs12FromAsn1(p12Asn1, p12Password);

    const certBags = p12.getBags({ bagType: forge.pki.oids.certBag });
    const keyBags = p12.getBags({
      bagType: forge.pki.oids.pkcs8ShroudedKeyBag,
    });

    const certBag = certBags[forge.pki.oids.certBag]?.[0];
    const keyBag = keyBags[forge.pki.oids.pkcs8ShroudedKeyBag]?.[0];

    if (!certBag?.cert || !keyBag?.key) {
      throw new Error("Could not extract cert/key from p12");
    }

    const cert = certBag.cert;
    const privateKey = keyBag.key;

    const wwdrPem = fs.readFileSync(wwdrPath, "utf8");
    const wwdrCert = forge.pki.certificateFromPem(wwdrPem);

    const p7 = forge.pkcs7.createSignedData();
    p7.content = forge.util.createBuffer(manifestJson, "utf8");
    p7.addCertificate(cert);
    p7.addCertificate(wwdrCert);
    p7.addSigner({
      key: privateKey as forge.pki.rsa.PrivateKey,
      certificate: cert,
      digestAlgorithm: forge.pki.oids.sha256,
      authenticatedAttributes: [
        {
          type: forge.pki.oids.contentType,
          value: forge.pki.oids.data,
        },
        { type: forge.pki.oids.messageDigest },
        { type: forge.pki.oids.signingTime, value: new Date().toUTCString() },
      ],
    });
    p7.sign({ detached: true });

    const derBytes = forge.asn1.toDer(p7.toAsn1()).getBytes();
    return Buffer.from(derBytes, "binary");
  } catch (err) {
    console.error("[apple-wallet] signing error:", err);
    return Buffer.from("SIGNING_ERROR_PLACEHOLDER");
  }
}

/* ---------- build .pkpass ---------- */

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

  const appUrl =
    process.env.NEXT_PUBLIC_APP_URL || "https://app.originscafe.ro";
  const passTypeId =
    process.env.APPLE_PASS_TYPE_ID || "pass.ro.originscafe.circle";
  const teamId = process.env.APPLE_TEAM_ID || "B6WGU5CX63";

  const stampsCount = Math.min(card.progress, card.spec.cycleLength);
  const totalStamps = card.spec.cycleLength;

  const monthYear = new Date(member.createdAt).toLocaleDateString("ro-RO", {
    month: "long",
    year: "numeric",
  });

  // Try rendering strip image with member name in Cormorant font
  const stripPng = await renderStripWithName(member.name, tierKey);
  const hasStrip = stripPng !== null;

  const passJson: Record<string, any> = {
    formatVersion: 1,
    passTypeIdentifier: passTypeId,
    teamIdentifier: teamId,
    organizationName: "Origins Cafe",
    description: "Origins Coffee Loyalty",
    serialNumber: member.passSerial,
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
      // If strip rendered OK, name is baked into the image — no primaryFields.
      // If strip failed, fall back to native primaryFields (system font).
      ...(hasStrip
        ? {}
        : {
            primaryFields: [{ key: "name", value: member.name }],
          }),
      secondaryFields: [
        {
          key: "reward",
          label: "RECOMPENSĂ",
          value:
            stampsCount >= totalStamps
              ? "Card complet! Cafea gratuită"
              : `Mai ai ${totalStamps - stampsCount} ștampile`,
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

  // Add strip images
  if (hasStrip) {
    // Dynamically rendered strip with member name in Cormorant font
    files["strip.png"] = stripPng;
    files["strip@2x.png"] = stripPng;
    files["strip@3x.png"] = stripPng;
  } else {
    // Fallback: static clean strips (no name)
    const stripMap: Record<string, string> = {
      [`${tier.strip}.png`]: "strip.png",
      [`${tier.strip}@2x.png`]: "strip@2x.png",
      [`${tier.strip}@3x.png`]: "strip@3x.png",
    };
    for (const [srcName, destName] of Object.entries(stripMap)) {
      const data = readAsset(srcName);
      if (data) files[destName] = data;
    }
  }

  // Build manifest.json (SHA1 hash of every file)
  const manifest: Record<string, string> = {};
  for (const [filename, content] of Object.entries(files)) {
    manifest[filename] = crypto
      .createHash("sha1")
      .update(content)
      .digest("hex");
  }
  files["manifest.json"] = Buffer.from(JSON.stringify(manifest, null, 2));

  // Sign manifest with real Apple certificate (PKCS#7 detached)
  const manifestJson = JSON.stringify(manifest, null, 2);
  files["signature"] = signManifest(manifestJson);

  return zipSync(files);
}
