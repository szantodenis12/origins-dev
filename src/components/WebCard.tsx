"use client";

import { tx, ui, useLang } from "@/lib/i18n";
import type { I18nText, Lang } from "@/lib/types";
import Header from "./Header";
import PhoneFrame from "./PhoneFrame";
import SiteFooter from "./SiteFooter";

/**
 * The member's card, live in the browser (faza 2.5).
 *
 * The card face is Roland's approved render, shipped as a cleaned base
 * plate (public/cards/plate-*.png, built by the CARD_SAMPLE scripts) with
 * every dynamic element — name, counter, stamp row, reward line, the white
 * tile and the QR — overlaid live at the positions measured on the render.
 * Wallet passes in phase 3 composite the same plates server-side.
 *
 * Gold (lib/gold.ts) overrides the other two looks while active; its plate is
 * the Circle render mapped through a gold luminance ramp
 * (CARD_SAMPLE/make_gold_plate.py), not a hue rotation — a rotation kept the
 * render's narrow luminance band and came out flat khaki.
 */

interface GoldInfo {
  isGold: boolean;
  expiresAt: string | null;
  completedCards: number;
  cardsRequired: number;
  everGold: boolean;
}

/** The Gold perk of the current period, resolved on the server. */
export interface PerkInfo {
  /** Perk name from the settings, in all three languages. */
  name: I18nText;
  toGoOnly: boolean;
  used: boolean;
  /** "24.08.2026" — end of the current period. */
  untilLabel: string;
}

/** What this fortnight gives a Gold member, under the plate. */
function perkLine(perk: PerkInfo, lang: Lang): string {
  const name = tx(perk.name, lang);
  const toGo =
    !perk.toGoOnly
      ? ""
      : lang === "hu"
        ? " Csak elvitelre."
        : lang === "en"
          ? " Takeaway only."
          : " Doar la pachet.";

  if (perk.used) {
    if (lang === "hu") return `${name}: ebben az időszakban már megvolt.`;
    if (lang === "en") return `${name}: already claimed this period.`;
    return `${name}: l-ai luat deja în perioada asta.`;
  }
  if (lang === "hu") {
    return `Gold most: ${name.toLowerCase()}, ${perk.untilLabel}-ig.${toGo}`;
  }
  if (lang === "en") {
    return `Gold right now: ${name.toLowerCase()}, until ${perk.untilLabel}.${toGo}`;
  }
  return `Gold acum: ${name.toLowerCase()}, până pe ${perk.untilLabel}.${toGo}`;
}

interface WebCardProps {
  name: string;
  serial: string;
  isStudent: boolean;
  studentVerified: boolean;
  /** Manager freeze: the card earns nothing until a manager unblocks it. */
  blocked: boolean;
  /** Stamps on the current card, double stamps already counted twice. */
  progress: number;
  /** Stamps on this member's card — shorter while Gold. From the settings. */
  cycleLength: number;
  /** Mid-card reward position, when the manager turned one on. */
  midRewardAt: number | null;
  hasReward: boolean;
  /** Derived Gold status, resolved on the server. */
  gold: GoldInfo;
  /** "12.08.2026" — the Gold expiry, pre-formatted on the server. */
  goldExpiresLabel: string | null;
  perk: PerkInfo | null;
  /**
   * The birthday drink line (lib/program-copy.ts); null unless the drink is
   * claimable right now — outside the window the card says nothing at all.
   */
  birthdayText: I18nText | null;
  /** "Marțea, 14:00 - 17:00: ștampilă dublă"; null when the mechanic is off. */
  doubleStampText: I18nText | null;
  /** Pre-rendered QR of the pass serial (SVG markup, server generated). */
  qrSvg: string;
  /**
   * Marks the review intent on the server, then redirects to the Google
   * review page. Null when the member already got the bonus or no location
   * has a review URL yet — then the card shows no link at all.
   */
  reviewAction: (() => Promise<void>) | null;
  applePassUrl?: string;
  googleWalletUrl?: string;
}

/* ----------------------------------------------------- plate geometry --- */

/**
 * Overlay positions in % of the plate, measured on the renders
 * (Circle/Gold: 633x837 · Student: 609x793). Font sizes are in cqw so the
 * type scales with the card exactly like on the render.
 */
const CIRCLE_GEOMETRY = {
  aspect: "633 / 837",
  radius: "4.4% / 3.3%",
  label: { top: "6.2%", right: "5.4%", size: 2.5 },
  counter: { top: "8.9%", right: "5.4%", size: 7.4 },
  name: { left: "8.7%", top: "29.6%", size: 9.9 },
  stamps: { left: "8.7%", top: "43.6%", tree: 7.4, gap: 1.6 },
  reward: { left: "8.7%", top: "61.8%", eyebrow: 2.5, serif: 6.6 },
  qr: { left: "69.9%", top: "63.6%", width: "22.2%" },
};

const STUDENT_GEOMETRY = {
  ...CIRCLE_GEOMETRY,
  aspect: "609 / 793",
  radius: "4.6% / 3.5%",
  label: { top: "5.9%", right: "5.6%", size: 2.5 },
  counter: { top: "8.6%", right: "5.6%", size: 7.4 },
  name: { left: "6.1%", top: "30.9%", size: 9.6 },
  stamps: { left: "6.1%", top: "45.6%", tree: 7.2, gap: 1.8 },
  reward: null,
  qr: { left: "70.1%", top: "67.3%", width: "21.4%" },
};

const TIERS = {
  circle: {
    plate: "/cards/plate-circle.png",
    geometry: CIRCLE_GEOMETRY,
    label: "CIRCLE · ȘTAMPILE",
    ink: "#2a3b1f",
    labelInk: "#2a3b1f",
    nameWeight: 600,
    nameStretch: 0.982,
    nameShadow:
      "0 1.5px 1px rgba(236, 239, 216, 0.5), 0 -1px 1px rgba(26, 38, 18, 0.4)",
    tree: "/cards/tree_forest.png",
    emptyTreeOpacity: 0.18,
  },
  gold: {
    plate: "/cards/plate-gold.png",
    geometry: CIRCLE_GEOMETRY,
    label: "GOLD CIRCLE · ȘTAMPILE",
    ink: "#3a3113",
    labelInk: "#3a3113",
    nameWeight: 600,
    nameStretch: 0.982,
    nameShadow:
      "0 1.5px 1px rgba(240, 231, 200, 0.5), 0 -1px 1px rgba(43, 35, 12, 0.45)",
    tree: "/cards/tree_ink.png",
    emptyTreeOpacity: 0.2,
  },
  student: {
    plate: "/cards/plate-student.png",
    geometry: STUDENT_GEOMETRY,
    label: "STUDENT CIRCLE · ȘTAMPILE",
    ink: "#cfd5ad",
    labelInk: "#cfd5ad",
    nameWeight: 700,
    nameStretch: 1.075,
    nameShadow:
      "0 1.5px 1.5px rgba(0, 0, 0, 0.65), 0 -1px 1px rgba(207, 213, 173, 0.2)",
    tree: "/cards/tree_pale.png",
    emptyTreeOpacity: 0.22,
  },
} as const;

/* ------------------------------------------------------------- wording --- */

/**
 * The reward block on the card face. Lines are FIXED, like on the render —
 * never auto-wrapped: free wrapping broke "upgrade-ul" at the hyphen and
 * ran a third line over the cup badge.
 */
function rewardCopy(
  progress: number,
  cycleLength: number,
  midRewardAt: number | null,
  hasReward: boolean,
  lang: Lang,
): { eyebrow: string; lines: string[] } {
  if (hasReward) {
    if (lang === "hu")
      return { eyebrow: "JUTALOM", lines: ["mutasd a kártyád", "a kasszánál"] };
    if (lang === "en")
      return { eyebrow: "REWARD", lines: ["show your card", "at the counter"] };
    return { eyebrow: "RECOMPENSĂ", lines: ["arată cardul", "la casă"] };
  }

  // Counts down to the next thing the member gets: the mid-card reward while
  // one is configured and still ahead, the free drink otherwise.
  const toUpgrade = midRewardAt !== null && progress < midRewardAt;
  const n = (toUpgrade ? midRewardAt : cycleLength) - progress;

  if (lang === "hu") {
    return {
      eyebrow: `MÉG ${n} PECSÉT`,
      lines: toUpgrade
        ? ["az ajándék", "upgrade-ig"]
        : ["az ajándék", "kávéig"],
    };
  }
  if (lang === "en") {
    return {
      eyebrow: `${n} MORE ${n === 1 ? "STAMP" : "STAMPS"}`,
      lines: toUpgrade
        ? ["to your upgrade", "on the house"]
        : ["to your", "free coffee"],
    };
  }
  return {
    eyebrow: n === 1 ? "MAI AI O ȘTAMPILĂ" : `MAI AI ${n} ȘTAMPILE`,
    lines: toUpgrade
      ? ["până la upgrade-ul", "din partea casei"]
      : ["până la cafeaua", "din partea casei"],
  };
}

/** Gold status line under the stamp counter. */
function goldLine(
  gold: GoldInfo,
  expiresLabel: string | null,
  lang: Lang,
): string | null {
  if (gold.isGold && expiresLabel) {
    if (lang === "hu") {
      return `Gold aktív. Egy látogatás ${expiresLabel} előtt megtartja.`;
    }
    if (lang === "en") {
      return `Gold active. Visit by ${expiresLabel} to keep it.`;
    }
    return `Gold activ. O vizită până la ${expiresLabel} păstrează statutul.`;
  }
  // Progress is shown only after the first full card: a brand-new member
  // reads the stamp mechanics first, Gold reveals itself on the way. A
  // lapsed member always sees it — one card brings the status back.
  if (gold.completedCards === 0 && !gold.everGold) return null;
  const n = gold.completedCards;
  const total = gold.cardsRequired;
  const left = total - n;
  if (left === 1) {
    if (lang === "hu") return "Még egy teljes kártya a Goldig.";
    if (lang === "en") return "One more full card to Gold.";
    return "Încă un card complet până la Gold.";
  }
  if (lang === "hu") return `${n} / ${total} teljes kártya a Goldig.`;
  if (lang === "en") return `${n} of ${total} full cards to Gold.`;
  return `${n} din ${total} carduri complete până la Gold.`;
}

/**
 * The white tile behind the QR, derived from the QR box so the code always
 * sits dead centre with an even margin. The render's own tile was taller than
 * the code and the extra room showed as soon as the shape was cleaned up.
 */
function tileBox(
  qr: { left: string; top: string; width: string },
  aspect: string,
) {
  const [w, h] = aspect.split("/").map((part) => Number(part.trim()));
  const padX = 1.9; // % of the plate width
  const padY = (padX * w) / h;
  const size = Number.parseFloat(qr.width) + padX * 2;

  return {
    left: `${Number.parseFloat(qr.left) - padX}%`,
    top: `${Number.parseFloat(qr.top) - padY}%`,
    width: `${size}%`,
    height: `${(size * w) / h}%`,
  };
}

/**
 * The stamp row keeps the width it has on the render whatever the card
 * length is: a 5-stamp card spreads the trees out, a longer one shrinks
 * them. The geometry was measured on the 8-stamp render, so that row is
 * what "full width" means here.
 */
const RENDER_STAMPS = 8;

function stampRowLayout(
  stamps: { tree: number; gap: number },
  count: number,
): { tree: number; gap: number } {
  const span = stamps.tree * RENDER_STAMPS + stamps.gap * (RENDER_STAMPS - 1);
  if (count <= 1) return { tree: stamps.tree, gap: 0 };
  const tree = Math.min(stamps.tree, (span - (count - 1) * stamps.gap) / count);
  return { tree, gap: (span - count * tree) / (count - 1) };
}

/* ---------------------------------------------------------- components --- */

function CardFace({
  tier,
  name,
  progress,
  cycleLength,
  midRewardAt,
  hasReward,
  qrSvg,
  lang,
}: {
  tier: (typeof TIERS)[keyof typeof TIERS];
  name: string;
  progress: number;
  cycleLength: number;
  midRewardAt: number | null;
  hasReward: boolean;
  qrSvg: string;
  lang: Lang;
}) {
  const g = tier.geometry;
  const tile = tileBox(g.qr, g.aspect);
  const reward = g.reward
    ? rewardCopy(progress, cycleLength, midRewardAt, hasReward, lang)
    : null;
  const filled = Math.min(progress, cycleLength);
  const row = stampRowLayout(g.stamps, cycleLength);
  const nameLength = Array.from(name.trim()).length;
  const nameScale =
    nameLength > 42 ? 0.48 : nameLength > 32 ? 0.6 : nameLength > 24 ? 0.78 : 1;

  return (
    <div style={{ containerType: "inline-size" }}>
      <div
        className="relative w-full overflow-hidden shadow-[0_18px_40px_-18px_rgba(19,20,16,0.45)]"
        style={{ aspectRatio: g.aspect, borderRadius: g.radius }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- static plate, sized by the container */}
        <img
          src={tier.plate}
          alt=""
          className="absolute inset-0 h-full w-full"
        />

        {/* label + counter, top right */}
        <span
          className="absolute font-bold tracking-[0.24em]"
          style={{
            top: g.label.top,
            right: g.label.right,
            fontSize: `${g.label.size}cqw`,
            color: tier.labelInk,
          }}
        >
          {tier.label}
        </span>
        <span
          className="absolute font-serif-card"
          style={{
            top: g.counter.top,
            right: g.counter.right,
            fontSize: `${g.counter.size}cqw`,
            fontWeight: tier.nameWeight,
            color: tier.ink,
            textShadow: tier.nameShadow,
          }}
        >
          {filled} / {cycleLength}
        </span>

        {/* member name */}
        <span
          className="absolute block max-w-[84%] origin-left overflow-hidden text-ellipsis whitespace-nowrap font-serif-card leading-none"
          style={{
            left: g.name.left,
            top: g.name.top,
            fontSize: `${g.name.size * nameScale}cqw`,
            fontWeight: tier.nameWeight,
            color: tier.ink,
            textShadow: tier.nameShadow,
            transform: `scaleX(${tier.nameStretch})`,
          }}
        >
          {name}
        </span>

        {/* stamp row */}
        <div
          className="absolute flex items-center"
          style={{
            left: g.stamps.left,
            top: g.stamps.top,
            gap: `${row.gap}cqw`,
          }}
        >
          {Array.from({ length: cycleLength }, (_, i) => (
            /* eslint-disable-next-line @next/next/no-img-element -- tiny tinted glyph */
            <img
              key={i}
              src={tier.tree}
              alt=""
              style={{
                width: `${row.tree}cqw`,
                opacity: i < filled ? 1 : tier.emptyTreeOpacity,
              }}
            />
          ))}
        </div>

        {/* reward line (Circle/Gold; the student plate carries its baked benefit) */}
        {reward && g.reward && (
          <div
            className="absolute"
            style={{
              left: g.reward.left,
              top: g.reward.top,
              color: tier.ink,
            }}
          >
            <div
              className="font-bold tracking-[0.22em] whitespace-nowrap"
              style={{ fontSize: `${g.reward.eyebrow}cqw` }}
            >
              {reward.eyebrow}
            </div>
            <div
              className="mt-[2cqw] font-serif-card leading-[1.12]"
              style={{
                fontSize: `${g.reward.serif}cqw`,
                fontWeight: tier.nameWeight,
                textShadow: tier.nameShadow,
              }}
            >
              {reward.lines.map((line) => (
                <div key={line} className="whitespace-nowrap">
                  {line}
                </div>
              ))}
            </div>
          </div>
        )}

        {/*
          The white tile is drawn here, not baked into the plate: the render's
          tile had square "ears" on its top corners (left by the erase pass
          that built the plates) and they showed the moment anyone zoomed in.
          Painted out of the plates by CARD_SAMPLE/repair_plates.py; the phase-3
          wallet strip composites the same clean shape.
        */}
        <div
          className="absolute bg-[#fdfdfa]"
          style={{
            left: tile.left,
            top: tile.top,
            width: tile.width,
            height: tile.height,
            borderRadius: "11% / 9.5%",
            boxShadow: "0 0.7cqw 1.8cqw rgba(24, 20, 8, 0.18)",
          }}
        />

        {/* QR on the tile */}
        <div
          className="absolute [&_svg]:block [&_svg]:h-auto [&_svg]:w-full"
          style={{ left: g.qr.left, top: g.qr.top, width: g.qr.width }}
          dangerouslySetInnerHTML={{ __html: qrSvg }}
        />
      </div>
    </div>
  );
}

export default function WebCard({
  name,
  serial,
  isStudent,
  studentVerified,
  blocked,
  progress,
  cycleLength,
  midRewardAt,
  hasReward,
  gold,
  goldExpiresLabel,
  perk,
  birthdayText,
  doubleStampText,
  qrSvg,
  reviewAction,
  applePassUrl,
  googleWalletUrl,
}: WebCardProps) {
  const { lang } = useLang();

  const tier = gold.isGold
    ? TIERS.gold
    : isStudent
      ? TIERS.student
      : TIERS.circle;

  const goldText = goldLine(gold, goldExpiresLabel, lang);

  return (
    <PhoneFrame>
      <Header />

      <div className="px-5 pt-[22px]">
        <CardFace
          tier={tier}
          name={name}
          progress={progress}
          cycleLength={cycleLength}
          midRewardAt={midRewardAt}
          hasReward={hasReward}
          qrSvg={qrSvg}
          lang={lang}
        />

        {/*
          Under the plate the type has to belong to the same object. A bold
          centered sans line read like an app toast stapled to a printed card,
          so the instruction is set in the page serif and the serial sits
          tight under the plate, quiet, like a card number.
        */}
        <p className="mt-3 text-center text-[10.5px] tracking-[0.22em] text-muted">
          {serial}
        </p>
        <p className="mt-2.5 text-center font-[family-name:var(--font-serif)] text-[19px] leading-[1.25] font-medium text-ink">
          {tx(ui.webCardShow, lang)}
        </p>
      </div>

      {/*
        Nothing below the plate may repeat it. The card face already carries the
        counter, the stamps and the reward line, so a second progress widget
        both duplicated it and undercut the render. What stays is only what the
        plate cannot say, set quietly under a hairline.
      */}
      <div className="mx-5 mt-6 border-t border-line pt-4 pb-2">
        {/* First thing under the plate while blocked: the card must not
            promise mechanics it will refuse at the counter. */}
        {blocked && (
          <p className="mb-2 text-[13px] leading-[1.5] font-semibold text-ink">
            {tx(ui.webCardBlocked, lang)}
          </p>
        )}

        {doubleStampText && (
          <p className="text-[13px] leading-[1.5] font-semibold text-ink">
            {tx(doubleStampText, lang)}
          </p>
        )}

        {goldText && (
          <p className="mt-2 text-[13px] leading-[1.5] font-semibold text-[#8a7c52]">
            {goldText}
          </p>
        )}

        {perk && (
          <p className="mt-2 text-[13px] leading-[1.5] font-semibold text-[#8a7c52]">
            {perkLine(perk, lang)}
          </p>
        )}

        {birthdayText && (
          <p className="mt-2 text-[13px] leading-[1.5] font-semibold text-ink">
            {tx(birthdayText, lang)}
          </p>
        )}

        {isStudent && (
          <p
            className={`mt-2 text-[13px] leading-[1.5] font-semibold ${
              studentVerified ? "text-sage-deep" : "text-ink"
            }`}
          >
            {studentVerified
              ? tx(ui.webCardStudentActive, lang)
              : tx(ui.webCardStudentPending, lang)}
          </p>
        )}

        {/* Quiet on purpose: an invitation in the card's own voice, not a
            banner. The server action marks the intent, then opens Google. */}
        {reviewAction && (
          <form action={reviewAction} className="mt-2">
            <button
              type="submit"
              className="text-[13px] leading-[1.5] font-semibold text-sage-deep underline underline-offset-2"
            >
              {tx(ui.webCardReview, lang)}
            </button>
          </form>
        )}

        <p className="mt-4 text-[12.5px] leading-[1.5] text-muted">
          {tx(ui.webCardSave, lang)}
        </p>

        {applePassUrl && (
          <div className="mt-4 flex flex-col gap-2.5 items-center">
            <a
              href={applePassUrl}
              download
              className="inline-flex items-center justify-center gap-2.5 px-5 py-3 rounded-xl bg-black text-white text-[13.5px] font-medium shadow-md hover:bg-neutral-800 transition-all w-full text-center"
            >
              <svg className="w-5 h-5 fill-current" viewBox="0 0 24 24">
                <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M15.97 4.02c.62-.75 1.04-1.8 1-2.82-.9.04-2 .61-2.65 1.37-.58.68-1.09 1.76-.95 2.8.99.08 2.02-.51 2.6-1.35z"/>
              </svg>
              <span>Adaugă în Apple Wallet</span>
            </a>
            {googleWalletUrl && (
              <a
                href={googleWalletUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center gap-2.5 px-5 py-3 rounded-xl bg-neutral-900 text-white text-[13.5px] font-medium shadow-md hover:bg-neutral-800 transition-all w-full text-center"
              >
                <svg className="w-5 h-5 fill-current" viewBox="0 0 24 24">
                  <path d="M21.35 11.1h-9.17v2.73h6.51c-.33 1.76-1.82 3.08-3.79 3.08-2.28 0-4.14-1.86-4.14-4.14s1.86-4.14 4.14-4.14c1.03 0 1.97.38 2.69 1.01l2.06-2.06C18.42 6.3 16.71 5.6 14.9 5.6c-4.08 0-7.39 3.31-7.39 7.39s3.31 7.39 7.39 7.39c4.27 0 7.11-3 7.11-7.25 0-.58-.06-1.04-.16-1.63z"/>
                </svg>
                <span>Save to Google Wallet</span>
              </a>
            )}
          </div>
        )}
      </div>

      <SiteFooter />
    </PhoneFrame>
  );
}
