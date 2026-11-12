"use client";

import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight,
  CalendarDays,
  CupSoda,
  Gift,
  Hourglass,
  MailCheck,
  MapPin,
  Palette,
  Plus,
  Users,
  type LucideIcon,
} from "lucide-react";
import { createContext, useContext, useEffect, useRef } from "react";
import { tx, ui, useLang } from "@/lib/i18n";
import {
  DRAWING_CATEGORIES,
  type DrawingCategory,
  type PublicDrawing,
} from "@/lib/drawing";
import { canPreregister, type CampaignPhase } from "@/lib/campaign-phase";
import type { PublicResults } from "@/lib/campaign-results";
import type { Lang } from "@/lib/types";
import { rememberChannel, trackEvent } from "./campaign-track";
import GalleryGrid from "./GalleryGrid";
import Snowfall from "./Snowfall";

/**
 * /desene, the public gallery of the drawing contest (xmas.originscafe.ro).
 *
 * Layout after Roland's own reference (an art-gallery shop, 10.11.2026):
 * white and clean, black type, two-line headlines (first line bold, second
 * light and indented), a curved panoramic strip in the hero, dark rounded
 * bands and a dark footer. Inter Tight throughout; white, ink #121212 and
 * Origins green as the one accent. No kickers, eyebrows or tag chips
 * anywhere: headlines start directly (Roland's permanent rule).
 *
 * Mobile journey (11.2026): one teaser (the panorama), the key facts right
 * under the hero, then how to take part, then the gallery. The fan, the
 * "latest drawings" band and the cup banner repeated the same drawings and
 * are gone.
 *
 * Everything depends on the campaign phase (lib/campaign-phase.ts),
 * computed on the server and handed down: before opening, entries open,
 * voting only, selection, results, collection.
 *
 * Order of the grid comes from the server and is never by votes. The page
 * counts drawings; it never counts votes.
 *
 * Everything that must stay clear of the snow layer (drawings, the cup,
 * cards, buttons) is `relative z-20`; see Snowfall.tsx.
 */

export type T = (key: keyof typeof ui) => string;
type Words = { drawing: string; yearsOld: string };

/** "3-5" -> "3–5": age ranges are set with an en dash, as in the campaign copy. */
export function ageLabel(category: string): string {
  return category.replace("-", "–");
}

/** "Ana, 7 ani", or "Desenul R-002" when the parent chose no first name. */
export function drawingLabel(drawing: PublicDrawing, words: Words): string {
  return drawing.firstName !== null
    ? `${drawing.firstName}, ${drawing.age} ${words.yearsOld}`
    : `${words.drawing} ${drawing.code}`;
}

/**
 * False for a gallery-only drawing (no reproduction consent, or another
 * paper): shown, but no vote and no cup mockup. Read defensively so the
 * page works before and after `PublicDrawing.votable` exists.
 */
export function isVotable(drawing: PublicDrawing): boolean {
  return (drawing as PublicDrawing & { votable?: boolean }).votable !== false;
}

/** "{code}" style placeholders in the UI strings. */
export function fill(text: string, values: Record<string, string | number>): string {
  return text.replace(/\{(\w+)\}/g, (_, key: string) => String(values[key] ?? ""));
}

/**
 * Where "Regulament" and "Cum folosim datele" lead: always the CONTEST
 * pages (content/concurs/*.md), never the Origins Circle ones. The server
 * page decides the addresses (lib/campaign-host.ts contestDocLinks) and
 * hands them down here once, through the frame.
 */
export interface ContestDocLinks {
  rules: string;
  privacy: string;
}

const DEFAULT_LINKS: ContestDocLinks = {
  rules: "/desene/regulament",
  privacy: "/desene/confidentialitate",
};

const LinksContext = createContext<ContestDocLinks>(DEFAULT_LINKS);
/** The phase, when the page knows it (the rules pages do not). */
const PhaseContext = createContext<CampaignPhase | null>(null);

export function useContestLinks(): ContestDocLinks {
  return useContext(LinksContext);
}

export function useContestPhase(): CampaignPhase | null {
  return useContext(PhaseContext);
}

/** Full-width shell for the public contest pages; snow unless it is a reading page. */
export function ContestFrame({
  children,
  links = DEFAULT_LINKS,
  snow = true,
  phase = null,
}: {
  children: React.ReactNode;
  links?: ContestDocLinks;
  snow?: boolean;
  phase?: CampaignPhase | null;
}) {
  const { lang } = useLang();
  // The landing channel (?ch= / utm_source) is kept for this tab's events.
  useEffect(() => {
    rememberChannel();
  }, []);
  return (
    <LinksContext.Provider value={links}>
      <PhaseContext.Provider value={phase}>
        <div className="relative isolate flex flex-1 flex-col bg-white text-o-ink">
          <a
            href="#continut"
            className="sr-only z-50 rounded-full bg-o-ink px-5 py-3 text-[13px] font-semibold text-white focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
          >
            {tx(ui.skipToContent, lang)}
          </a>
          {snow && <Snowfall />}
          {children}
        </div>
      </PhaseContext.Provider>
    </LinksContext.Provider>
  );
}

/** The column every section sits in. */
export const WRAP = "mx-auto w-full max-w-[1240px] px-4 sm:px-5 md:px-8";
/** Black pill button; green on hover. */
export const PILL =
  "relative z-20 inline-flex min-h-[44px] items-center justify-center gap-2 rounded-full bg-o-ink px-6 py-3 text-[12px] font-semibold tracking-[0.06em] text-white uppercase transition-colors hover:bg-o-green";
/** Outline pill, for light and for dark grounds. */
export const PILL_OUTLINE =
  "relative z-20 inline-flex min-h-[44px] items-center justify-center gap-2 rounded-full border px-5 py-2.5 text-[11.5px] font-semibold tracking-[0.06em] uppercase transition-colors";
/** Visible keyboard focus on every contest control. */
export const FOCUS =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-o-green";

/**
 * The two-line headline: a bold uppercase first line, a light second line
 * set off to the right. It starts directly: no kicker, no eyebrow, no small
 * label above it (Roland's permanent rule, 10.11.2026).
 */
export function Stagger({
  a,
  b,
  as: Tag = "h2",
  size = "md",
  align = "center",
  id,
}: {
  a: string;
  b: string;
  as?: "h1" | "h2";
  size?: "sm" | "md" | "lg";
  align?: "center" | "left";
  id?: string;
}) {
  const scale = {
    sm: "text-[clamp(24px,2.7vw,36px)]",
    md: "text-[clamp(26px,3.6vw,48px)]",
    lg: "text-[clamp(24px,3.3vw,48px)]",
  }[size];
  return (
    <div className={align === "center" ? "text-center" : ""}>
      <Tag
        id={id}
        className={`${scale} inline-block max-w-full text-left leading-[1.14] tracking-[-0.01em] uppercase`}
      >
        <span className="block font-extrabold text-balance">{a}</span>
        <span className="block pl-[1.4em] font-light lg:pl-[2.2em]">{b}</span>
      </Tag>
    </div>
  );
}

const LANGS: Lang[] = ["ro", "hu", "en"];

/** The anchor and label of the phase section ("Cum particip" / "Ce urmează" / "Rezultate"). */
export function phaseAnchor(phase: CampaignPhase | null): {
  id: string;
  label: keyof typeof ui;
} {
  if (phase === "results" || phase === "collection") return { id: "rezultate", label: "navResults" };
  if (phase === "voting_only" || phase === "voting_closed") return { id: "cum-participi", label: "navNext" };
  return { id: "cum-participi", label: "navJoin" };
}

export function ContestHeader({
  active = "galerie",
}: {
  active?: "galerie" | "regulament" | null;
}) {
  const { lang, setLang } = useLang();
  const links = useContestLinks();
  const phase = useContestPhase();
  const t: T = (key) => tx(ui[key], lang);
  const anchor = phaseAnchor(phase);
  const nav = [
    { href: `/desene#${anchor.id}`, label: t(anchor.label), on: false },
    { href: "/desene#galerie", label: t("navGallery"), on: active === "galerie" },
    { href: "/desene#calendar", label: t("navCalendar"), on: false, desktopOnly: true },
    { href: links.rules, label: t("navRules"), on: active === "regulament" },
  ];
  const showPrereg = phase !== null && canPreregister(phase);

  return (
    <>
      <header className={`${WRAP} relative z-20 flex items-center justify-between gap-3 py-3 lg:py-5`}>
        <Link href="/desene" aria-label="Origins Coffee & Drinks" className={`shrink-0 rounded ${FOCUS}`}>
          <Image
            src="/brand/logo-ink.png"
            alt="Origins Coffee & Drinks"
            width={334}
            height={178}
            priority
            className="h-[34px] w-auto lg:h-[44px]"
          />
        </Link>

        <nav
          aria-label={t("navLabel")}
          className="hidden items-center gap-1 rounded-full border border-o-ink/15 bg-white p-1 text-[12px] font-medium lg:flex"
        >
          {nav.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              aria-current={item.on ? "page" : undefined}
              className={`rounded-full px-4 py-2 transition-colors ${FOCUS} ${
                item.on ? "bg-o-ink text-white" : "text-o-ink/75 hover:text-o-ink"
              }`}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-1 lg:gap-3">
          <div role="group" aria-label={t("langLabel")} className="flex text-[12px] font-semibold">
            {LANGS.map((l) => (
              <button
                key={l}
                type="button"
                lang={l}
                onClick={() => setLang(l)}
                aria-pressed={lang === l}
                className={`flex size-11 items-center justify-center rounded-full ${FOCUS} ${
                  lang === l ? "text-o-ink underline underline-offset-4" : "text-o-ink/60 hover:text-o-ink"
                }`}
              >
                {l.toUpperCase()}
              </button>
            ))}
          </div>
          {showPrereg && (
            <span className="hidden sm:block">
              <Link href="/desen" className={`${PILL} ${FOCUS} !px-4 !py-2.5 !text-[11px]`}>
                {t("prereg")}
              </Link>
            </span>
          )}
        </div>
      </header>

      {/* Phone and tablet: a compact bar that stays at the top while scrolling. */}
      <nav
        aria-label={t("navLabel")}
        className="sticky top-0 z-30 border-y border-o-ink/10 bg-white/95 backdrop-blur lg:hidden"
      >
        <ul className={`${WRAP} flex gap-1 overflow-x-auto py-1 text-[13px] font-semibold`}>
          {nav
            .filter((item) => !item.desktopOnly)
            .map((item) => (
              <li key={item.href} className="shrink-0">
                <Link
                  href={item.href}
                  aria-current={item.on ? "page" : undefined}
                  className={`flex min-h-[44px] items-center rounded-full px-3.5 ${FOCUS} ${
                    item.on ? "text-o-ink underline underline-offset-4" : "text-o-ink/75"
                  }`}
                >
                  {item.label}
                </Link>
              </li>
            ))}
        </ul>
      </nav>
    </>
  );
}

/** A drawing as a card: the sheet on a neutral wall, who made it, its code, the action. */
export function DrawingCard({
  drawing,
  words,
  years,
  voting,
  tone = "light",
  priority = false,
  onOpen,
}: {
  drawing: PublicDrawing;
  words: Words;
  years: string;
  /** The vote is open (phase). Gallery-only drawings never say "Votează". */
  voting: boolean;
  tone?: "light" | "dark";
  priority?: boolean;
  onOpen?: () => void;
}) {
  const { lang } = useLang();
  const dark = tone === "dark";
  const label = drawingLabel(drawing, words);
  const action = voting && isVotable(drawing) ? tx(ui.h2Vote, lang) : tx(ui.h2View, lang);
  return (
    <Link
      href={`/desene/${drawing.code}`}
      onClick={onOpen}
      className={`group relative z-20 block rounded-2xl ${FOCUS}`}
    >
      <div
        className={`relative aspect-[3/2] overflow-hidden rounded-2xl ${dark ? "bg-white" : "bg-o-wall"}`}
      >
        <Image
          src={drawing.image}
          alt={label}
          fill
          sizes="(min-width: 1280px) 290px, (min-width: 768px) 31vw, 46vw"
          priority={priority}
          className="object-contain p-2 transition-transform sm:p-3 duration-300 group-hover:scale-[1.04] motion-reduce:transition-none lg:p-4"
        />
      </div>
      <div className="mt-2.5 sm:mt-3 sm:flex sm:items-baseline sm:justify-between sm:gap-3">
        <span className="block truncate text-[12.5px] font-bold tracking-[0.03em] uppercase sm:text-[13px]">
          {label}
        </span>
        <span
          className={`block shrink-0 text-[12.5px] tabular-nums ${dark ? "text-white/75" : "text-o-ink/70"}`}
        >
          {drawing.firstName !== null ? `${drawing.code} · ` : ""}
          {ageLabel(drawing.category)} {years}
        </span>
      </div>
      <span
        className={`${PILL_OUTLINE} mt-2 !min-h-[36px] !px-4 !py-1.5 !text-[11px] group-hover:border-o-green group-hover:bg-o-green group-hover:text-white ${
          dark ? "border-white/60 text-white" : "border-o-ink/45 text-o-ink"
        }`}
      >
        {action}
      </span>
    </Link>
  );
}

/**
 * The curved panoramic strip of the hero: five panels on one perspective,
 * the outer ones turned inward like the walls of a round gallery room.
 * Each panel hangs one of the latest drawings; the cup stands in the
 * middle. The page's ONE teaser: no other block repeats these drawings.
 */
const PANELS = [
  { turn: 40, origin: "right center", flex: 1.5 },
  { turn: 20, origin: "right center", flex: 1.15 },
  { turn: 0, origin: "center", flex: 1.3 },
  { turn: -20, origin: "left center", flex: 1.15 },
  { turn: -40, origin: "left center", flex: 1.5 },
];

function Panorama({
  drawings,
  cup,
  words,
}: {
  drawings: PublicDrawing[];
  cup: PublicDrawing | null;
  words: Words;
}) {
  if (drawings.length === 0) return null;
  const sheets = drawings.filter((drawing) => drawing.code !== cup?.code);
  const pool = sheets.length > 0 ? sheets : drawings;
  const pick = (index: number) => pool[index % pool.length];
  const slots: (PublicDrawing | "cup")[] = [
    pick(0),
    pick(1),
    cup?.cupImage ? "cup" : pick(4),
    pick(2),
    pick(3),
  ];

  return (
    <div className="relative z-20 overflow-x-clip py-4 sm:py-8 lg:py-12">
      <div className="mx-auto flex h-[130px] w-full max-w-[1320px] items-stretch gap-1 px-[7%] sm:h-[210px] lg:h-[300px] lg:gap-2 xl:h-[340px]">
        {slots.map((slot, index) => {
          const panel = PANELS[index];
          const target = slot === "cup" ? cup! : slot;
          return (
            <Link
              key={index}
              href={`/desene/${target.code}`}
              aria-label={drawingLabel(target, words)}
              className={`relative block overflow-hidden bg-o-wall ${FOCUS}`}
              style={{
                flex: panel.flex,
                transform: `perspective(700px) rotateY(${panel.turn}deg)`,
                transformOrigin: panel.origin,
              }}
            >
              {slot === "cup" ? (
                <Image
                  src={cup!.cupImage!}
                  alt=""
                  fill
                  sizes="(min-width: 1024px) 300px, 20vw"
                  priority
                  className="object-cover"
                />
              ) : (
                <span className="absolute inset-x-[9%] top-1/2 block -translate-y-1/2 border border-o-ink/10 bg-white p-[3%] shadow-[0_10px_24px_rgba(18,18,18,0.12)]">
                  <Image
                    src={slot.image}
                    alt=""
                    width={slot.imageWidth}
                    height={slot.imageHeight}
                    sizes="(min-width: 1024px) 280px, 20vw"
                    priority={index < 2}
                    className="h-auto w-full"
                  />
                </span>
              )}
            </Link>
          );
        })}
      </div>
    </div>
  );
}

function sentence(text: string): string {
  return text.charAt(0).toLocaleUpperCase("ro") + text.slice(1);
}

function countText(total: number, t: T): string {
  if (total === 1) return `1 ${t("siteCount1")}`;
  const rest = total % 100;
  return rest >= 1 && rest <= 19
    ? `${total} ${t("siteCountFew")}`
    : `${total} ${t("siteCountMany")}`;
}

/**
 * The three contest cafés. Addresses cross-checked 10.11.2026: lib/data.ts,
 * the client README and the live originscafe.ro ("Era Shopping Park
 * (C. Aradului 62)", "Rogerius (C. Coposu 33)", "Gara Mare (Muzeului 2)",
 * Gara Mare being the former name of Palatul Copiilor). Map links: the
 * Google place ids from lib/data.ts where they exist, the address otherwise.
 * No holiday hours anywhere: only Palatul Copiilor's weekday note.
 */
export const CAFES = [
  {
    slug: "rogerius",
    name: "Rogerius",
    address: "Calea Corneliu Coposu 33",
    placeId: "ChIJr3BDSwdJRkcRSsy_H07WvC4",
    noteKey: null,
  },
  {
    slug: "era",
    name: "ERA Shopping Park",
    address: "Calea Aradului 62",
    placeId: "ChIJpVTBgEVHRkcRnbZALZqcg6c",
    noteKey: null,
  },
  {
    slug: "palatul-copiilor",
    name: "Palatul Copiilor",
    address: "Strada Muzeului 2",
    placeId: null,
    noteKey: "siteLocPalatulNote" as const,
  },
] as const;

export function mapUrl(cafe: (typeof CAFES)[number]): string {
  const query = encodeURIComponent(`Origins Coffee & Drinks, ${cafe.address}, Oradea`);
  return `https://www.google.com/maps/search/?api=1&query=${query}${
    cafe.placeId ? `&query_place_id=${cafe.placeId}` : ""
  }`;
}

/** The café list with a map link per café; `tone` for white or dark grounds. */
export function CafeList({
  tone = "light",
  only,
  compact = false,
}: {
  tone?: "light" | "dark";
  /** Show just this café (the one chosen at preregistration). */
  only?: string;
  compact?: boolean;
}) {
  const { lang } = useLang();
  const t: T = (key) => tx(ui[key], lang);
  const dark = tone === "dark";
  return (
    <ul className={`flex flex-col ${compact ? "gap-2" : "gap-3"}`}>
      {CAFES.filter((cafe) => !only || cafe.slug === only).map((cafe) => (
        <li
          key={cafe.slug}
          className={`flex items-center justify-between gap-3 ${
            compact ? "" : `rounded-2xl border px-4 py-3 ${dark ? "border-white/15" : "border-o-ink/12"}`
          }`}
        >
          <span className={`text-[14.5px] leading-[1.45] ${dark ? "text-white/80" : "text-o-ink/80"}`}>
            <b className={`font-semibold ${dark ? "text-white" : "text-o-ink"}`}>{cafe.name}</b>
            <br />
            {cafe.address}
            {cafe.noteKey ? `, ${t(cafe.noteKey)}` : ""}
          </span>
          <a
            href={mapUrl(cafe)}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`${t("mapOpenOf")} ${cafe.name}, ${cafe.address}`}
            onClick={() => trackEvent("map_click", { location: cafe.slug })}
            className={`relative z-20 inline-flex min-h-[44px] shrink-0 items-center gap-1.5 rounded-full border px-4 text-[12px] font-semibold tracking-[0.04em] uppercase transition-colors ${FOCUS} ${
              dark
                ? "border-white/50 text-white hover:border-o-green hover:bg-o-green"
                : "border-o-ink/30 text-o-ink hover:border-o-green hover:bg-o-green hover:text-white"
            }`}
          >
            <MapPin className="size-[14px]" strokeWidth={1.75} aria-hidden />
            {t("mapOpen")}
          </a>
        </li>
      ))}
    </ul>
  );
}

/** Dark footer of every contest page: the contest, the three cafés, contact. */
export function ContestFooter({ flat = false }: { flat?: boolean }) {
  const { lang } = useLang();
  const t: T = (key) => tx(ui[key], lang);
  const docs = useContestLinks();
  const phase = useContestPhase();
  const heading = "text-[13px] font-bold tracking-[0.06em] uppercase underline underline-offset-[6px]";
  const links = [
    { href: "/desene#galerie", label: t("navGallery") },
    ...(phase !== null && canPreregister(phase) ? [{ href: "/desen", label: t("prereg") }] : []),
    { href: docs.rules, label: t("siteLinkRules") },
    { href: docs.privacy, label: t("siteLinkPrivacy") },
  ];
  const linkClass = `relative z-20 inline-flex min-h-[32px] items-center hover:text-white ${FOCUS}`;
  return (
    <footer
      data-snow="dark"
      className={`mt-auto bg-o-ink text-white ${
        flat ? "border-t border-white/10" : "rounded-t-[36px] lg:rounded-t-[48px]"
      }`}
    >
      <div className={`${WRAP} grid gap-10 py-12 lg:grid-cols-12 lg:py-16`}>
        <div className="lg:col-span-3">
          <Image
            src="/brand/logo-white.png"
            alt="Origins Coffee & Drinks"
            width={334}
            height={178}
            className="relative z-20 h-[52px] w-auto"
          />
          <p className="mt-4 max-w-[300px] text-[14px] leading-[1.6] text-white/75">{t("brandName")}</p>
        </div>
        <div className="lg:col-span-2">
          <h2 className={heading}>{t("h2FootContest")}</h2>
          <ul className="mt-4 flex flex-col gap-1 text-[14px] text-white/80">
            {links.map((link) => (
              <li key={link.href}>
                <Link href={link.href} className={linkClass}>
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>
        <div id="locatii" className="scroll-mt-16 lg:col-span-4">
          <h2 className={heading}>{t("h2FootLocations")}</h2>
          <div className="mt-4">
            <CafeList tone="dark" compact />
          </div>
        </div>
        <div className="lg:col-span-3">
          <h2 className={heading}>{t("h2FootContact")}</h2>
          <ul className="mt-4 flex flex-col gap-1 text-[14px] text-white/80">
            <li>
              <a href="mailto:contact@originscafe.ro" className={linkClass}>
                contact@originscafe.ro
              </a>
            </li>
            <li>
              <a href="tel:+40740038569" className={linkClass}>
                0740 038 569
              </a>
            </li>
            <li className="pt-2 text-white/60">originscafe.ro</li>
          </ul>
        </div>
      </div>
    </footer>
  );
}


function Results({
  results,
  phase,
  words,
  years,
}: {
  results: PublicResults;
  phase: CampaignPhase;
  words: Words;
  years: string;
}) {
  const { lang } = useLang();
  const t: T = (key) => tx(ui[key], lang);
  return (
    <section
      id="rezultate"
      aria-labelledby="rezultate-titlu"
      data-snow="dark"
      className="mt-12 scroll-mt-14 rounded-t-[36px] bg-o-ink text-white lg:mt-20 lg:rounded-t-[56px]"
    >
      <div className={`${WRAP} py-12 lg:py-20`}>
        <Stagger id="rezultate-titlu" align="left" a={t("h2ResultsA")} b={t("h2ResultsB")} />
        <p className="mt-5 max-w-[720px] text-[15.5px] leading-[1.6] text-white/80">{t("resultsLead")}</p>

        {DRAWING_CATEGORIES.map((category) => {
          const group = results[category];
          const chosen = [
            ...(group?.vote ? [{ drawing: group.vote, how: t("resultsVote") }] : []),
            ...(group?.jury ?? []).map((drawing) => ({ drawing, how: t("resultsJury") })),
          ];
          return (
            <div key={category} className="mt-10 border-t border-white/15 pt-6 lg:mt-14">
              <h3 className="text-[19px] font-bold lg:text-[22px]">
                {ageLabel(category)} {years}
              </h3>
              {chosen.length === 0 ? (
                <p className="mt-3 text-[15px] text-white/75">{t("resultsPending")}</p>
              ) : (
                <ul className="mt-5 grid grid-cols-1 gap-x-5 gap-y-8 sm:grid-cols-2 lg:grid-cols-4">
                  {chosen.map(({ drawing, how }) => (
                    <li key={drawing.code}>
                      <DrawingCard drawing={drawing} words={words} years={years} voting={false} tone="dark" />
                      <p className="mt-2 text-[13.5px] text-white/75">{how}</p>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}

        <div className="mt-12 grid gap-4 border-t border-white/15 pt-6 text-[15.5px] leading-[1.6] text-white/85 lg:grid-cols-2 lg:gap-12">
          {phase === "collection" ? (
            <>
              <p>
                <b className="font-semibold text-white">{t("collectionCups")}</b> {t("collectionPrizes")}
              </p>
              <p>{t("collectionOriginals")}</p>
            </>
          ) : (
            <>
              <p>{t("resultsCupsSoon")}</p>
              <p>{t("collectionOriginals")}</p>
            </>
          )}
        </div>
      </div>
    </section>
  );
}

/** Steps, the optional preregistration and the cafés: the "how to take part" block. */
function HowToJoin({ phase }: { phase: CampaignPhase }) {
  const { lang } = useLang();
  const t: T = (key) => tx(ui[key], lang);
  const ref = useRef<HTMLElement>(null);
  const open = canPreregister(phase);

  // instructions_view: once per page view, when the steps come into sight.
  useEffect(() => {
    const node = ref.current;
    if (!node || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          trackEvent("instructions_view");
          observer.disconnect();
        }
      },
      { threshold: 0.25 },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const steps = [1, 2, 3, 4, 5] as const;
  return (
    <section
      ref={ref}
      id="cum-participi"
      aria-labelledby="cum-participi-titlu"
      className={`${WRAP} scroll-mt-14 pt-12 lg:pt-24`}
    >
      <div className="grid gap-10 lg:grid-cols-12 lg:gap-16">
        <div className="lg:col-span-7">
          <Stagger id="cum-participi-titlu" align="left" size="sm" a={t("h2JoinA")} b={t("h2JoinB")} />
          <ol className="mt-6 border-b border-o-ink/12">
            {steps.map((n) => (
              <li
                key={n}
                className="grid grid-cols-[2rem_minmax(0,1fr)] gap-3 border-t border-o-ink/12 py-4 lg:grid-cols-[3rem_minmax(0,1fr)]"
              >
                <span className="text-[15.5px] leading-[1.55] font-bold lg:text-[16px]">{n}.</span>
                <p className="text-[15.5px] leading-[1.55] lg:text-[16px]">
                  <b className="font-semibold">{t(`siteStep${n}Title`)}</b>{" "}
                  <span className="text-o-ink/80">{t(`siteStep${n}`)}</span>
                </p>
              </li>
            ))}
          </ol>
        </div>

        <div className="flex flex-col gap-6 lg:col-span-5 lg:pt-2">
          <div className="relative z-20 rounded-3xl bg-o-wall p-5 lg:p-6">
            <p className="text-[16px] leading-[1.4] font-bold">{t("preregTitle")}</p>
            <p className="mt-2 text-[14.5px] leading-[1.6] text-o-ink/80">
              {open ? t("preregBody") : t("preregSoon")}
            </p>
            {open && (
              <Link href="/desen" className={`${PILL} ${FOCUS} mt-4`}>
                {t("prereg")}
                <ArrowRight className="size-[14px]" strokeWidth={2} aria-hidden />
              </Link>
            )}
          </div>
          <div>
            <h3 className="text-[17px] font-bold lg:text-[19px]">{t("siteLocationsTitle")}</h3>
            <div className="mt-3">
              <CafeList />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/** After entries close: what happens now, in one paragraph. */
function WhatsNext({ phase }: { phase: CampaignPhase }) {
  const { lang } = useLang();
  const t: T = (key) => tx(ui[key], lang);
  return (
    <section
      id="cum-participi"
      aria-labelledby="ce-urmeaza-titlu"
      className={`${WRAP} scroll-mt-14 pt-12 lg:pt-24`}
    >
      <div className="grid gap-6 lg:grid-cols-12 lg:gap-16">
        <div className="lg:col-span-5">
          <Stagger id="ce-urmeaza-titlu" align="left" size="sm" a={t("h2NextA")} b={t("h2NextB")} />
        </div>
        <div className="text-[16px] leading-[1.6] text-o-ink/85 lg:col-span-7 lg:pt-2 lg:text-[17px]">
          <p>{phase === "voting_only" ? t("nextVoting") : t("nextSelection")}</p>
          <p className="mt-3">{t("siteCup")}</p>
        </div>
      </div>
    </section>
  );
}

function FactsBand({ phase }: { phase: CampaignPhase }) {
  const { lang } = useLang();
  const t: T = (key) => tx(ui[key], lang);
  const entering = phase === "before_open" || phase === "submissions_open";
  const facts: { Icon: LucideIcon; title: keyof typeof ui; line: keyof typeof ui }[] = entering
    ? [
        { Icon: Users, title: "factAges", line: "factAgesLine" },
        { Icon: CalendarDays, title: "factDeadline", line: "factDeadlineLine" },
        { Icon: Palette, title: "factSheet", line: "factSheetLine" },
        { Icon: MailCheck, title: "factVote", line: "factVoteLine" },
      ]
    : phase === "voting_only"
      ? [
          { Icon: MailCheck, title: "factVoteClose", line: "factVoteCloseLine" },
          { Icon: Gift, title: "factResults", line: "factResultsLine" },
          { Icon: CupSoda, title: "factCups", line: "factCupsLine" },
          { Icon: MapPin, title: "factWall", line: "factWallLine" },
        ]
      : [
          { Icon: Hourglass, title: "factResults", line: "factResultsLine" },
          { Icon: CupSoda, title: "factCups", line: "factCupsLine" },
          { Icon: MapPin, title: "factWall", line: "factWallLine" },
        ];

  return (
    <section data-snow="dark" className="mt-6 rounded-[28px] bg-o-ink text-white lg:mt-10 lg:rounded-[40px]">
      <ul
        className={`${WRAP} grid grid-cols-2 gap-x-4 gap-y-6 py-7 lg:py-12 ${
          facts.length === 4 ? "lg:grid-cols-4" : "lg:grid-cols-3"
        }`}
      >
        {facts.map(({ Icon, title, line }, index) => (
          <li key={title} className="flex flex-col items-center text-center">
            <span
              className={`flex size-[44px] items-center justify-center rounded-full lg:size-[64px] ${
                index === 0 ? "bg-white text-o-ink" : "border border-white/50 text-white"
              }`}
            >
              <Icon className="size-[20px] lg:size-[26px]" strokeWidth={1.5} aria-hidden />
            </span>
            <h3 className="mt-3 text-[14px] leading-[1.3] font-bold lg:mt-4 lg:text-[16px]">{t(title)}</h3>
            <p className="mx-auto mt-1 max-w-[230px] text-[12.5px] leading-[1.5] text-white/75 lg:text-[13.5px]">
              {t(line)}
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}

export default function DrawingGallery({
  drawings,
  phase,
  total,
  latest,
  cup,
  links,
  results,
  initial,
}: {
  /** Addresses of the contest rules and privacy note (server decides). */
  links: ContestDocLinks;
  /** All published drawings, in this visitor's stable shuffle. */
  drawings: PublicDrawing[];
  phase: CampaignPhase;
  /** Drawings online, all age groups. A count of drawings, never of votes. */
  total: number;
  /** Newest first: the hero strip only. */
  latest: PublicDrawing[];
  /** A drawing with a cup mockup, for the centre of the hero strip. */
  cup: PublicDrawing | null;
  /** The chosen drawings, only in the results and collection phases. */
  results: PublicResults | null;
  /** Filter state from the URL (?grupa, ?cod, ?n), for a stable first render. */
  initial: { category: DrawingCategory | null; query: string; count: number };
}) {
  const { lang } = useLang();
  const t: T = (key) => tx(ui[key], lang);
  const words = { drawing: t("galDrawing"), yearsOld: t("galYearsOld") };
  const years = t("galYears");
  const voting = phase === "submissions_open" || phase === "voting_only";
  const showResults = (phase === "results" || phase === "collection") && results !== null;
  const entering = phase === "before_open" || phase === "submissions_open";

  const lead = {
    before_open: t("heroBefore"),
    submissions_open: t("heroOpen"),
    voting_only: t("heroVoting"),
    voting_closed: t("heroSelection"),
    results: t("heroResults"),
    collection: t("heroCollection"),
  }[phase];

  const calendar: { date: keyof typeof ui; key: keyof typeof ui }[] = [
    { date: "calDate1", key: "siteCal1" },
    { date: "calDate2", key: "siteCal2" },
    { date: "calDate3", key: "siteCal3" },
    { date: "calDate4", key: "siteCal4" },
    { date: "calDate5", key: "siteCal5" },
    { date: "calDate6", key: "siteCal6" },
    { date: "calDate7", key: "siteCal7" },
  ];
  const faq = [1, 9, 2, 3, 4, 5, 6, 7, 8] as const;
  const row =
    "grid grid-cols-[6.5rem_minmax(0,1fr)] gap-3 border-t border-o-ink/12 py-3.5 lg:grid-cols-[8.5rem_minmax(0,1fr)] lg:py-4";

  return (
    <ContestFrame links={links} phase={phase}>
      <ContestHeader />

      <main id="continut" tabIndex={-1} className="outline-none">
        {/* ------------------------------------------------------------ hero */}
        <section className="pt-5 lg:pt-10">
          <div className={WRAP}>
            <Stagger as="h1" size="lg" a={t("h2HeroA")} b={t("h2HeroB")} />
          </div>
          <div className="mt-3 lg:mt-8">
            <Panorama drawings={latest} cup={cup} words={words} />
          </div>
          <div className={`${WRAP} mt-3 grid gap-5 lg:mt-10 lg:grid-cols-12 lg:items-center lg:gap-10`}>
            <div className="text-[15.5px] leading-[1.6] text-o-ink/85 lg:col-span-8 lg:text-[17px]">
              <p>{lead}</p>
              {total > 0 && (
                <p className="mt-1.5 font-semibold text-o-ink">{sentence(countText(total, t))}.</p>
              )}
            </div>
            <div className="flex flex-wrap gap-2 lg:col-span-4 lg:justify-end">
              {showResults ? (
                <a href="#rezultate" className={`${PILL} ${FOCUS}`}>
                  {t("btnResults")}
                </a>
              ) : (
                <a href="#cum-participi" className={`${PILL} ${FOCUS}`}>
                  {entering ? t("btnJoin") : t("navNext")}
                </a>
              )}
              <a
                href="#galerie"
                className={`${PILL_OUTLINE} ${FOCUS} border-o-ink/35 text-o-ink hover:border-o-green hover:bg-o-green hover:text-white`}
              >
                {t("btnGallery")}
              </a>
            </div>
          </div>
        </section>

        <div className="px-2 sm:px-4 lg:px-6">
          <FactsBand phase={phase} />
        </div>

        {/* ------------------------------------- the phase's own section */}
        {showResults ? (
          <Results results={results!} phase={phase} words={words} years={years} />
        ) : entering ? (
          <HowToJoin phase={phase} />
        ) : (
          <WhatsNext phase={phase} />
        )}

        {/* ---------------------------------------------------- the gallery */}
        <section
          id="galerie"
          aria-labelledby="galerie-titlu"
          className={`${WRAP} scroll-mt-14 pt-14 lg:pt-28`}
        >
          <Stagger id="galerie-titlu" a={t("h2AllA")} b={t("h2AllB")} />
          <p className="mx-auto mt-4 max-w-[640px] text-center text-[15px] leading-[1.6] text-o-ink/80 lg:mt-6 lg:text-[16px]">
            {phase === "before_open"
              ? t("galBeforeOpen")
              : voting
                ? t("galVoteHow")
                : t("galClosedBanner")}
          </p>
          <GalleryGrid drawings={drawings} voting={voting} initial={initial} />
        </section>

        {/* ------------------------------ how the ten are chosen + calendar */}
        <section className={`${WRAP} grid gap-12 pt-14 lg:grid-cols-12 lg:gap-16 lg:pt-28`}>
          <div className="lg:col-span-7">
            <Stagger align="left" size="sm" a={t("h2ChooseA")} b={t("h2ChooseB")} />
            <p className="mt-5 text-[16px] leading-[1.6] font-semibold lg:text-[17px]">{t("siteChooseLead")}</p>
            <div className="mt-5 flex flex-col gap-4 text-[15px] leading-[1.6] text-o-ink/80 lg:text-[16px]">
              <p className="border-t border-o-ink/15 pt-4">
                <b className="font-bold text-o-ink">{t("siteJuryLabel")}</b> {t("siteJury")}
              </p>
              <p className="border-t border-o-ink/15 pt-4">
                <b className="font-bold text-o-ink">{t("siteVoteLabel")}</b> {t("siteVote")}
                <span className="mt-2 block">{t("siteVoteExample")}</span>
              </p>
              <p className="border-t border-o-ink/15 pt-4">
                <b className="font-bold text-o-ink">{t("siteHiddenLabel")}</b> {t("siteHidden")}
              </p>
              {entering && <p className="border-t border-o-ink/15 pt-4">{t("siteCup")}</p>}
            </div>
            <Link
              href={links.rules}
              className={`${PILL_OUTLINE} ${FOCUS} mt-6 border-o-ink/35 text-o-ink hover:border-o-green hover:bg-o-green hover:text-white`}
            >
              {t("siteLinkRules")}
            </Link>
          </div>
          <div id="calendar" className="scroll-mt-14 lg:col-span-5">
            <Stagger align="left" size="sm" a={t("h2CalA")} b={t("h2CalB")} />
            <ol className="mt-6 border-b border-o-ink/12">
              {calendar.map((item) => (
                <li key={item.key} className={row}>
                  <span className="text-[15px] leading-[1.55] font-bold tabular-nums lg:text-[16px]">
                    {t(item.date)}
                  </span>
                  <p className="text-[15px] leading-[1.55] lg:text-[16px]">{t(item.key)}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* ------------------------------------------------------------- faq */}
        <section className={`${WRAP} pt-14 pb-16 lg:pt-28 lg:pb-28`}>
          <Stagger a={t("h2FaqA")} b={t("h2FaqB")} />
          <div className="mx-auto mt-8 grid max-w-[1000px] gap-3 lg:mt-12 lg:grid-cols-2 lg:items-start lg:gap-4">
            {faq.map((n) => (
              <details key={n} className="group relative z-20 rounded-2xl border border-o-ink/15 bg-white px-5 lg:px-6">
                <summary
                  className={`flex min-h-[52px] cursor-pointer list-none items-center justify-between gap-4 py-3.5 text-[15.5px] leading-[1.4] font-semibold lg:py-5 lg:text-[16px] [&::-webkit-details-marker]:hidden ${FOCUS}`}
                >
                  {t(`siteFaq${n}Q`)}
                  <Plus
                    className="size-[18px] shrink-0 transition-transform duration-200 group-open:rotate-45 motion-reduce:transition-none"
                    strokeWidth={1.75}
                    aria-hidden
                  />
                </summary>
                <p className="pb-5 text-[15px] leading-[1.6] text-o-ink/80">{t(`siteFaq${n}A`)}</p>
              </details>
            ))}
          </div>
        </section>
      </main>

      <ContestFooter />
    </ContestFrame>
  );
}
