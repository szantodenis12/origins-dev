import {
  nextStampKind,
  stampWindow,
  type LoyaltyConfig,
  type Redemption,
  type RewardDef,
  type RewardId,
  type StampEvent,
  type StampKind,
  // Explicit .ts extensions: tests import this adapter under plain Node,
  // whose type stripping resolves relative paths literally.
} from "../loyalty.ts";
import { memberCard } from "../card.ts";
import {
  DEFAULT_LOYALTY_CONFIG,
  sanitizeLoyaltyConfig,
} from "../program.ts";
import {
  categories as seedCategories,
  locations as seedLocations,
  products as seedProducts,
} from "../data.ts";
import { normalizePhone } from "../phone.ts";
import { membersPastRetention } from "../retention.ts";
import {
  canChangeDrawingStatus,
  drawingCategory,
  drawingCode,
  drawingIsLive,
  drawingPublishBlock,
  normalizeDrawingCode,
  type DrawingLocation,
  type DrawingStatus,
} from "../drawing.ts";
import { hashStaffPin, verifyStaffPin } from "../admin/staff-pin.ts";
import { EMPTY_CAMPAIGN_STATE, type CampaignState } from "../campaign-phase.ts";
import {
  isCampaignEventName,
  sanitizeEventProps,
  type CampaignEvent,
} from "../campaign-metrics.ts";
import {
  campaignPrintable,
  isSheetKind,
  SUBMITTABLE_STATUSES,
  validateNewDrawingEntry,
  type WinnerKind,
} from "./campaign-rules.ts";
// A value import from ./index.ts is a module cycle (index imports this
// adapter), but a harmless one: CONSENT_VERSION is only read inside getStats,
// long after both modules finished evaluating.
import { CONSENT_VERSION } from "./index.ts";
import type { Category, Location } from "../types";
import type {
  AddStampInput,
  AddStampResult,
  AdminProduct,
  AuditEvent,
  LoyaltyConfigPatch,
  CategoryPatch,
  CreateLocationResult,
  CastVoteResult,
  CreateDrawingEntryResult,
  DrawingImageInput,
  DrawingVote,
  NewVoteCodeInput,
  PublishDrawingResult,
  RedeemVoteCodeResult,
  SetVoteWinnerResult,
  MarkDrawingSubmittedResult,
  NewCampaignEventInput,
  SetDrawingWinnerResult,
  SetReserveRankResult,
  SetWinnerAcceptedResult,
  CreateMemberResult,
  CreateStaffResult,
  Db,
  DrawingEntry,
  NewDrawingEntryInput,
  SetDrawingStatusResult,
  StaffRole,
  ForgetMemberResult,
  LocationPatch,
  LocationStats,
  Member,
  NewAuditInput,
  NewLocationInput,
  NewMemberInput,
  NewProductInput,
  NewPushCampaignInput,
  NewStaffInput,
  PlatformStats,
  ProductPatch,
  PushCampaign,
  RedeemInput,
  RedeemResult,
  ReissuePassSerialResult,
  RenameStaffResult,
  SetMemberBlockedResult,
  SetStaffActiveResult,
  SetStaffPinResult,
  StaffSession,
  StaffUser,
  WithdrawMarketingConsentResult,
} from "./index.ts";

/**
 * In-memory adapter — demo data only, wiped on restart. Supabase replaces it
 * without touching anything above the `Db` interface.
 *
 * Every member here is obviously fake on purpose ("Demo Unu", phone
 * 0700 000 00x): nothing in this file may ever be mistaken for a real client.
 */

interface Store {
  /** The mechanics, as edited in /admin/setari. One row in Supabase. */
  loyaltyConfig: LoyaltyConfig;
  members: Member[];
  stamps: StampEvent[];
  redemptions: Redemption[];
  staff: StaffUser[];
  /**
   * Personal barista codes; Supabase Auth replaces this in phase 3+. Only a
   * peppered hash is stored (lib/admin/staff-pin.ts) — a code is readable
   * exactly once, in the create/reset result that generated it.
   */
  staffPins: { locationSlug: string; pinHash: string; staffId: string }[];
  /** Menu lives here since phase 5; `data.ts` is only the seed. */
  locations: Location[];
  categories: Category[];
  products: AdminProduct[];
  campaigns: PushCampaign[];
  /** Jurnalul de modificări — append-only, never trimmed. */
  auditLog: AuditEvent[];
  /** Concursul de desene 2026 — separate from members (lib/drawing.ts). */
  drawingEntries: DrawingEntry[];
  /** Last sequence handed out per contest location: R-017 means 17 here. */
  drawingSequences: Record<DrawingLocation, number>;
  /** Public vote: one row per (drawing, e-mail hash). */
  drawingVotes: DrawingVote[];
  /** Pending e-mail codes, one per (drawing, e-mail hash). */
  drawingVoteCodes: (NewVoteCodeInput & { attempts: number })[];
  /** The manual campaign switches (campaign_state in Supabase). */
  campaignState: CampaignState;
  /** First-party measurement rows: event names + whitelisted slugs only. */
  campaignEvents: CampaignEvent[];
  /** Per-process fixed windows for `rateLimitHit`. */
  rateLimits: Map<string, { windowStart: number; hits: number }>;
  nextStampId: number;
  nextRedemptionId: number;
  nextCampaignId: number;
  nextAuditId: number;
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/**
 * DEMO ONLY: six published drawings so the gallery, the drawing page with
 * the cup and the vote screen have something to show under `next dev`.
 *
 * Runs only when NODE_ENV is exactly "development". Never in production
 * (`next build` / `next start`), never in tests (`node --test` leaves
 * NODE_ENV unset, and the suites count on an empty contest), and it only
 * exists in this in-memory adapter: the Supabase adapter has no seed.
 * Every name says "Demo"; images are in public/desen/demo/. Set
 * DEMO_DRAWINGS=0 to start `next dev` with an empty contest.
 */
function seedDemoDrawings(store: Store, now: number): void {
  if (process.env.NODE_ENV !== "development") return;
  if (process.env.DEMO_DRAWINGS === "0") return;
  // With a persistent campaign store configured, the contest is not read
  // from this adapter at all (compose.ts); seeding would only be confusing.
  // Demo rows exist ONLY here: nothing in this file ever writes to Supabase.
  if (process.env.SUPABASE_URL) return;

  const demo: {
    location: DrawingLocation;
    name: string;
    age: number;
    named: boolean;
    image: number;
    width: number;
    height: number;
    daysOnline: number;
    votes: number;
  }[] = [
    { location: "rogerius", name: "Demo Ana", age: 4, named: true, image: 3, width: 1460, height: 754, daysOnline: 5, votes: 9 },
    { location: "era", name: "Demo Luca", age: 5, named: true, image: 4, width: 1460, height: 754, daysOnline: 2, votes: 6 },
    { location: "rogerius", name: "Demo Mara", age: 7, named: true, image: 1, width: 1600, height: 832, daysOnline: 4, votes: 8 },
    { location: "palatul-copiilor", name: "Demo Tudor", age: 9, named: true, image: 5, width: 1460, height: 754, daysOnline: 1.5, votes: 3 },
    { location: "era", name: "Demo Ilinca", age: 11, named: true, image: 2, width: 1600, height: 832, daysOnline: 3, votes: 12 },
    { location: "rogerius", name: "Demo Fără Prenume", age: 13, named: false, image: 6, width: 1460, height: 754, daysOnline: 3, votes: 12 },
  ];

  // Scale test: DEMO_DRAWINGS=150 grows the demo to 150 real entries (real
  // codes, real pages) by cycling the six images. Every 4th is anonymous,
  // every 7th is gallery-only (no reproduction consent: shown, not votable).
  const wanted = Number(process.env.DEMO_DRAWINGS);
  const base = demo.length;
  const locations: DrawingLocation[] = ["rogerius", "era", "palatul-copiilor"];
  for (let i = base; Number.isInteger(wanted) && i < Math.min(wanted, 500); i += 1) {
    const like = demo[i % base];
    demo.push({
      ...like,
      location: locations[i % 3],
      name: `Demo ${i + 1}`,
      age: 3 + (i % 12),
      named: i % 4 !== 0,
      daysOnline: 0.5 + (i % 14),
      votes: i % 9,
    });
  }

  for (const [index, item] of demo.entries()) {
    const sequence = store.drawingSequences[item.location] + 1;
    store.drawingSequences[item.location] = sequence;
    const publishedAt = new Date(now - item.daysOnline * DAY).toISOString();
    const id = `demo-desen-${index + 1}`;
    store.drawingEntries.push({
      id,
      code: drawingCode(item.location, sequence),
      location: item.location,
      childFirstName: item.name,
      childAge: item.age,
      category: drawingCategory(item.age)!,
      parentName: "Părinte Demo",
      phone: "0700000001",
      consentParticipation: true,
      consentReproduction: index < base || index % 7 !== 0,
      attribution: item.named ? "first-name-age" : "none",
      consentPhoto: false,
      consentGallery: true,
      imageOriginal: null,
      imageWeb: `/desen/demo/demo-${item.image}.jpg`,
      imageWidth: item.width,
      imageHeight: item.height,
      cupMockup: index < base || index % 7 !== 0 ? `/desen/demo/pahar-${item.image}.jpg` : null,
      publishedAt,
      unpublishedAt: null,
      voteWinner: false,
      sheetKind: "oficiala",
      submittedAt: publishedAt,
      submittedBy: null,
      winnerKind: null,
      winnerAcceptedAt: null,
      reserveRank: null,
      circleOptIn: false,
      status: index % 2 === 0 ? "expus" : "depus",
      registeredVia: "counter",
      createdAt: publishedAt,
      updatedAt: publishedAt,
    });
    // Fake votes with fake hashes, spread over the time online. The last
    // drawing gets its votes in one burst, so the manager's alarm shows.
    const burst = index === base - 1;
    for (let v = 0; v < item.votes; v += 1) {
      const at = burst
        ? now - 2 * DAY + v * 2 * MINUTE
        : now - item.daysOnline * DAY + ((v + 1) / (item.votes + 1)) * item.daysOnline * DAY;
      store.drawingVotes.push({
        drawingId: id,
        emailHash: `${index}${v}`.padStart(4, "0").padEnd(64, "d"),
        createdAt: new Date(at).toISOString(),
      });
    }
  }
}

function seed(): Store {
  const now = Date.now();
  const ago = (ms: number) => new Date(now - ms).toISOString();

  const store: Store = {
    loyaltyConfig: structuredClone(DEFAULT_LOYALTY_CONFIG),
    members: [],
    stamps: [],
    redemptions: [],
    staff: [],
    staffPins: [],
    // Deep copies: admin mutations must never write into the seed module.
    locations: structuredClone(seedLocations),
    categories: structuredClone(seedCategories),
    products: structuredClone(seedProducts).map((p) => ({
      ...p,
      active: true,
    })),
    campaigns: [],
    auditLog: [],
    drawingEntries: [],
    drawingSequences: { rogerius: 0, era: 0, "palatul-copiilor": 0 },
    drawingVotes: [],
    drawingVoteCodes: [],
    campaignState: { ...EMPTY_CAMPAIGN_STATE },
    campaignEvents: [],
    rateLimits: new Map(),
    nextStampId: 1,
    nextRedemptionId: 1,
    nextCampaignId: 1,
    nextAuditId: 1,
  };

  seedDemoDrawings(store, now);

  // One shared demo barista + one manager per real location, so the cookie
  // always resolves whichever role logged in — plus two personal demo
  // baristas per location, each with their own login code (see staffPins).
  store.staff = seedLocations.flatMap((location) => [
    {
      id: `staff-${location.slug}`,
      name: "Cont comun barista",
      role: "barista" as const,
      locationSlug: location.slug,
      active: true,
      shared: true,
    },
    {
      id: `staff-${location.slug}-b1`,
      name: "Barista demo unu",
      role: "barista" as const,
      locationSlug: location.slug,
      active: true,
      shared: false,
    },
    {
      id: `staff-${location.slug}-b2`,
      name: "Barista demo doi",
      role: "barista" as const,
      locationSlug: location.slug,
      active: true,
      shared: false,
    },
    {
      id: `staff-manager-${location.slug}`,
      name: "Cont comun manager",
      role: "manager" as const,
      locationSlug: location.slug,
      active: true,
      shared: true,
    },
  ]);
  // The documented demo codes (era 2011/2012, rogerius 2021/2022, ...) keep
  // working in development, but even they go into the store hashed.
  store.staffPins = seedLocations.flatMap((location, index) => [
    {
      locationSlug: location.slug,
      pinHash: hashStaffPin(String(2011 + index * 10)),
      staffId: `staff-${location.slug}-b1`,
    },
    {
      locationSlug: location.slug,
      pinHash: hashStaffPin(String(2012 + index * 10)),
      staffId: `staff-${location.slug}-b2`,
    },
  ]);

  let index = 0;
  const addMember = (
    fields: Pick<Member, "name"> & Partial<Member>,
  ): Member => {
    index += 1;
    const member: Member = {
      id: `demo-${index}`,
      phone: `070000000${index}`,
      blockedAt: null,
      birthDay: null,
      birthMonth: null,
      birthYear: null,
      lang: "ro",
      isStudent: false,
      studentVerifiedAt: null,
      passSerial: `ORIG-DEMO-${String(index).padStart(4, "0")}`,
      consentAt: ago(40 * DAY),
      consentVersion: "demo",
      marketingConsentAt: null,
      marketingConsentVersion: null,
      reviewIntentAt: null,
      reviewBonusGiven: false,
      createdAt: ago(40 * DAY),
      ...fields,
    };
    store.members.push(member);
    return member;
  };

  /** Adds `count` stamps, the most recent one `lastAgo` ago, one per day. */
  const addStamps = (
    member: Member,
    locationSlug: string,
    count: number,
    lastAgo: number,
    kind: StampKind = "normal",
  ) => {
    // Cycle through the location's staff so the barista stats have data.
    const staffIds = [
      `staff-${locationSlug}`,
      `staff-${locationSlug}-b1`,
      `staff-${locationSlug}-b2`,
    ];
    for (let i = 0; i < count; i += 1) {
      store.stamps.push({
        id: store.nextStampId++,
        memberId: member.id,
        locationSlug,
        staffId: staffIds[i % staffIds.length],
        kind,
        createdAt: ago(lastAgo + (count - 1 - i) * DAY),
      });
    }
  };

  const CARD = store.loyaltyConfig.cycleLength;

  // Mid-card, nothing earned yet.
  addStamps(addMember({ name: "Demo Unu" }), "era", 2, 2 * DAY);
  addStamps(addMember({ name: "Demo Doi" }), "rogerius", 3, 3 * DAY);

  // One stamp short of the free drink.
  addStamps(addMember({ name: "Demo Trei" }), "era", CARD - 1, 26 * HOUR);

  // Full card: free drink earned, not used.
  addStamps(addMember({ name: "Demo Patru" }), "rogerius", CARD, 30 * HOUR);

  // Student who ticked the box online but never showed the card.
  addStamps(addMember({ name: "Demo Cinci", isStudent: true }), "era", 2, 5 * DAY);

  // Student with the physical card already checked at the counter.
  addStamps(
    addMember({
      name: "Demo Șase",
      isStudent: true,
      studentVerifiedAt: ago(12 * DAY),
    }),
    "oraselul",
    3,
    4 * DAY,
  );

  // Stamped at ERA half an hour ago: the 2h window must refuse a second one.
  addStamps(addMember({ name: "Demo Șapte" }), "era", 3, 30 * MINUTE);

  // Finished a card: drink redeemed, card restarted, one stamp since.
  const eight = addMember({ name: "Demo Opt", reviewBonusGiven: true });
  addStamps(eight, "era", CARD, 9 * DAY);
  store.redemptions.push({
    id: store.nextRedemptionId++,
    memberId: eight.id,
    rewardId: "free_coffee",
    locationSlug: "era",
    staffId: "staff-era",
    createdAt: ago(9 * DAY - HOUR),
  });
  addStamps(eight, "era", 1, 2 * DAY);

  /** A full card ending `lastAgo` ago, the drink redeemed an hour after. */
  const addCompletedCard = (
    member: Member,
    locationSlug: string,
    lastAgo: number,
    stamps: number = CARD,
  ) => {
    addStamps(member, locationSlug, stamps, lastAgo);
    store.redemptions.push({
      id: store.nextRedemptionId++,
      memberId: member.id,
      rewardId: "free_coffee",
      locationSlug,
      staffId: `staff-${locationSlug}`,
      createdAt: ago(lastAgo - HOUR),
    });
  };

  const GOLD_CARDS = store.loyaltyConfig.gold.cardsRequired;
  const GOLD_CARD_LENGTH = store.loyaltyConfig.gold.cycleLength;

  // Gold, active: enough completed cards, last visit 2 days ago.
  const nine = addMember({ name: "Demo Nouă" });
  for (let i = 0; i < GOLD_CARDS; i += 1) {
    addCompletedCard(nine, "rogerius", (40 - i * 9) * DAY);
  }
  addStamps(nine, "rogerius", GOLD_CARD_LENGTH - 2, 2 * DAY);

  // Was Gold, stopped coming: lapsed, one completed card wins it back.
  const ten = addMember({ name: "Demo Zece" });
  for (let i = 0; i < GOLD_CARDS; i += 1) {
    addCompletedCard(ten, "era", (70 - i * 10) * DAY);
  }

  return store;
}

/**
 * Module-level singleton. Keyed on globalThis so the seeded state survives
 * hot reloads and route re-evaluation in dev.
 */
/**
 * The key carries two parts.
 *
 * `v3` is the Store *shape* and is bumped by hand: old-shape state would crash
 * freshly reloaded code. The suffix is a fingerprint of the seed itself, so
 * editing `data.ts` re-seeds automatically. Without it, a `next dev` started
 * before a menu edit keeps serving the previous menu from the surviving
 * singleton — silently, because the code is new and only the data is stale.
 *
 * Exported so the tests that read the raw store follow the key instead of
 * hardcoding it and quietly getting `undefined` after the next change.
 */
function seedFingerprint(): string {
  const json = JSON.stringify([seedLocations, seedCategories, seedProducts]);
  // djb2 — no crypto import, and collisions only cost a stale dev singleton.
  let hash = 5381;
  for (let i = 0; i < json.length; i += 1) {
    hash = ((hash << 5) + hash + json.charCodeAt(i)) | 0;
  }
  return (hash >>> 0).toString(36);
}

export const STORE_KEY = Symbol.for(`origins.memory-db.v6.${seedFingerprint()}`);

/**
 * The one place a vote is written: live drawing, one row per (drawing,
 * e-mail hash). Supabase holds the same rule as a unique index (0003).
 */
function recordVote(drawingId: string, emailHash: string, now: Date): CastVoteResult {
  const store = getStore();
  const entry = store.drawingEntries.find((e) => e.id === drawingId);
  if (!entry || !drawingIsLive(entry)) return { status: "not_live" };
  const exists = store.drawingVotes.some(
    (v) => v.drawingId === drawingId && v.emailHash === emailHash,
  );
  if (exists) return { status: "already_voted" };
  store.drawingVotes.push({ drawingId, emailHash, createdAt: now.toISOString() });
  return { status: "voted" };
}

/**
 * Marks or clears a cup winner. Same rules, same words as the SQL function
 * `set_drawing_winner` (migration 0004).
 */
function setWinner(
  id: string,
  kind: WinnerKind | null,
  now: Date,
): SetDrawingWinnerResult {
  const store = getStore();
  const entry = store.drawingEntries.find((e) => e.id === id);
  if (!entry) return { status: "not_found" };
  const at = now.toISOString();
  if (kind === null) {
    entry.winnerKind = null;
    entry.voteWinner = false;
    entry.winnerAcceptedAt = null;
    entry.updatedAt = at;
    return { status: "saved", entry, replaced: null };
  }
  if (entry.winnerKind === kind) return { status: "saved", entry, replaced: null };
  if (kind === "vote" && !drawingIsLive(entry)) return { status: "not_live" };
  if (!campaignPrintable(entry)) return { status: "not_eligible" };
  if (kind === "vote" && entry.status === "selectat") return { status: "is_jury_pick" };
  if (kind === "jury" && entry.winnerKind === "vote") return { status: "is_vote_winner" };

  let replaced: DrawingEntry | null = null;
  if (kind === "vote") {
    replaced =
      store.drawingEntries.find(
        (e) => e.winnerKind === "vote" && e.category === entry.category && e.id !== entry.id,
      ) ?? null;
    if (replaced) {
      replaced.winnerKind = null;
      replaced.voteWinner = false;
      replaced.winnerAcceptedAt = null;
      replaced.updatedAt = at;
    }
  }
  entry.winnerKind = kind;
  entry.voteWinner = kind === "vote";
  entry.winnerAcceptedAt = null;
  entry.reserveRank = null;
  entry.updatedAt = at;
  return { status: "saved", entry, replaced };
}

/**
 * End-of-campaign discipline, like forgetMember: the Jurnal rows about a
 * deleted drawing stay (what happened, who did it), the part that points at
 * a child does not. Summaries only ever carried the code, never a name or a
 * phone, but a code still resolves to a row until the deletion. Exported
 * because the Jurnal lives here even when the campaign store is Supabase
 * (compose.ts calls it after the remote delete).
 */
export function redactDrawingAudit(ids: Set<string>): void {
  for (const entry of getStore().auditLog) {
    if (!ids.has(entry.target)) continue;
    entry.target = "desen-sters";
    entry.summary = `${entry.action}: acțiune pe un desen șters la finalul campaniei.`;
    delete entry.details;
  }
}

function getStore(): Store {
  const host = globalThis as typeof globalThis & { [STORE_KEY]?: Store };
  host[STORE_KEY] ??= seed();
  return host[STORE_KEY];
}

/**
 * Photo fields are optional, never null: `undefined = no image` is what every
 * public component already branches on. Clearing therefore deletes the key.
 */
function setPhoto(
  target: { photo?: string; heroPhoto?: string },
  value: string | null,
  key: "photo" | "heroPhoto" = "photo",
): void {
  if (value === null) delete target[key];
  else target[key] = value;
}

/** "Piadineria Aurel Lazăr" -> "piadineria-aurel-lazar". */
function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

/** The shared env codes (dev 0000, manager 1111) no personal code may use. */
function reservedPins(): Set<string> {
  return new Set(
    [
      process.env.ADMIN_DEV_PIN ?? "0000",
      process.env.ADMIN_MANAGER_PIN ?? "1111",
    ].map((pin) => pin.trim()),
  );
}

/**
 * Random 4-digit personal barista code. Never the shared env codes and never
 * a code already used at the location.
 */
function newStaffPin(taken: (pin: string) => boolean): string {
  const reserved = reservedPins();
  for (;;) {
    const bytes = new Uint8Array(2);
    crypto.getRandomValues(bytes);
    const pin = String(((bytes[0] << 8) | bytes[1]) % 10000).padStart(4, "0");
    if (reserved.has(pin)) continue;
    if (!taken(pin)) return pin;
  }
}

/**
 * The stored hash is a deterministic HMAC, so "same code" means "same hash":
 * collision checks compare hashes without ever recovering a code.
 */
function pinTakenAt(
  store: Store,
  locationSlug: string,
  pin: string,
  ignoreStaffId?: string,
): boolean {
  const hash = hashStaffPin(pin);
  return store.staffPins.some(
    (p) =>
      p.locationSlug === locationSlug &&
      p.pinHash === hash &&
      p.staffId !== ignoreStaffId,
  );
}

/** Names land on Statistici and printed codes — refuse the obvious garbage. */
function cleanStaffName(name: string): string | null {
  const trimmed = name.trim();
  return trimmed.length > 0 && trimmed.length <= 60 ? trimmed : null;
}

/**
 * What a forgotten member's events point at after erasure. Never a real id
 * (those are UUIDs or seeded "demo-N"), and the member row is gone, so the
 * events stay countable but resolve to nobody.
 */
const FORGOTTEN_MEMBER = "anonim";

/** No 0/O/1/I — the serial gets read out loud and typed at the counter. */
const SERIAL_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";

function randomSerialBlock(length: number): string {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => SERIAL_ALPHABET[b % SERIAL_ALPHABET.length])
    .join("");
}

/** "ORIG-XXXX-XXXX", unique within the store. */
function newPassSerial(taken: (serial: string) => boolean): string {
  for (;;) {
    const serial = `ORIG-${randomSerialBlock(4)}-${randomSerialBlock(4)}`;
    if (!taken(serial)) return serial;
  }
}

export function createMemoryDb(): Db {
  const stampsOf = (memberId: string) =>
    getStore().stamps.filter((s) => s.memberId === memberId);
  const redemptionsOf = (memberId: string) =>
    getStore().redemptions.filter((r) => r.memberId === memberId);
  const memberById = (memberId: string) =>
    getStore().members.find((m) => m.id === memberId) ?? null;

  const config = () => getStore().loyaltyConfig;
  /** The member's standing under the config in force right now. */
  const cardOf = (memberId: string, now: Date) => {
    const member = memberById(memberId);
    return memberCard(
      stampsOf(memberId),
      redemptionsOf(memberId),
      config(),
      now,
      member
        ? { day: member.birthDay, month: member.birthMonth, year: member.birthYear }
        : null,
    );
  };

  return {
    async getLoyaltyConfig(): Promise<LoyaltyConfig> {
      return structuredClone(config());
    },

    async updateLoyaltyConfig(
      patch: LoyaltyConfigPatch,
      now: Date = new Date(),
    ): Promise<LoyaltyConfig> {
      const store = getStore();
      // Merge over the stored config, then sanitize the whole thing: a form
      // that posts only the Gold section must not reset the rest.
      store.loyaltyConfig = sanitizeLoyaltyConfig({
        ...store.loyaltyConfig,
        ...patch,
        updatedAt: now.toISOString(),
      });
      return structuredClone(store.loyaltyConfig);
    },

    async findMemberByPassSerial(serial: string): Promise<Member | null> {
      const wanted = serial.trim().toUpperCase();
      return (
        getStore().members.find(
          (m) => m.passSerial.toUpperCase() === wanted,
        ) ?? null
      );
    },

    async findMemberByPhone(phone: string): Promise<Member | null> {
      const wanted = normalizePhone(phone);
      if (!wanted) return null;
      return (
        getStore().members.find(
          (m) => normalizePhone(m.phone) === wanted,
        ) ?? null
      );
    },

    async createMember(input: NewMemberInput): Promise<CreateMemberResult> {
      const store = getStore();
      const phone = normalizePhone(input.phone);
      if (!phone) return { status: "invalid_phone" };

      // One phone = one member, for life of the program (spec §1).
      if (store.members.some((m) => normalizePhone(m.phone) === phone)) {
        return { status: "phone_exists" };
      }

      const now = (input.now ?? new Date()).toISOString();
      const member: Member = {
        // Unguessable on purpose: the id is the whole auth of /card/{id}.
        id: crypto.randomUUID(),
        name: input.name.trim(),
        phone,
        blockedAt: null,
        birthDay: input.birthDay,
        birthMonth: input.birthMonth,
        birthYear: input.birthYear,
        lang: input.lang,
        isStudent: input.isStudent,
        studentVerifiedAt: null,
        passSerial: newPassSerial((serial) =>
          store.members.some((m) => m.passSerial === serial),
        ),
        consentAt: now,
        consentVersion: input.consentVersion,
        marketingConsentAt: input.marketingConsent ? now : null,
        marketingConsentVersion: input.marketingConsent
          ? input.consentVersion
          : null,
        reviewIntentAt: null,
        reviewBonusGiven: false,
        createdAt: now,
      };
      store.members.push(member);
      return { status: "created", member };
    },

    async getMember(memberId: string): Promise<Member | null> {
      return memberById(memberId);
    },

    async listMembers(): Promise<Member[]> {
      return getStore().members;
    },

    async getMemberStamps(memberId: string): Promise<StampEvent[]> {
      return stampsOf(memberId);
    },

    async getMemberRedemptions(memberId: string): Promise<Redemption[]> {
      return redemptionsOf(memberId);
    },

    async addStamp(input: AddStampInput): Promise<AddStampResult> {
      const store = getStore();
      const member = memberById(input.memberId);
      if (!member) return { status: "not_found" };
      // Blocked wins over everything: not even a deliberate bonus accrues.
      if (member.blockedAt !== null) return { status: "blocked" };

      const now = input.now ?? new Date();
      const requested = input.kind ?? "auto";

      if (requested === "review_bonus" && member.reviewBonusGiven) {
        return { status: "bonus_used" };
      }

      // The window guards scans only; a bonus is a deliberate grant.
      if (requested === "auto") {
        const window = stampWindow(
          stampsOf(member.id),
          input.locationSlug,
          now,
          config().stampWindowHours,
        );
        if (window.blocked) {
          return {
            status: "already_stamped",
            lastStampAt: window.lastStampAt as string,
            nextAllowedAt: window.nextAllowedAt as string,
          };
        }
      }

      const kind: StampKind =
        requested === "auto" ? nextStampKind(now, config().doubleStamp) : requested;

      const event: StampEvent = {
        id: store.nextStampId++,
        memberId: member.id,
        locationSlug: input.locationSlug,
        staffId: input.staffId,
        kind,
        createdAt: now.toISOString(),
      };
      store.stamps.push(event);

      if (kind === "review_bonus") member.reviewBonusGiven = true;

      return { status: "added", event };
    },

    async listAvailableRewards(
      member: Member,
      now: Date = new Date(),
    ): Promise<RewardDef[]> {
      return cardOf(member.id, now).rewards;
    },

    async redeemReward(input: RedeemInput): Promise<RedeemResult> {
      const store = getStore();
      const member = memberById(input.memberId);
      if (!member) return { status: "not_found" };
      if (member.blockedAt !== null) return { status: "blocked" };

      const now = input.now ?? new Date();
      // One check for both kinds of reward: card rewards come from the
      // current card, the Gold perk from the current period.
      const card = cardOf(member.id, now);
      if (!card.rewards.some((reward) => reward.id === input.rewardId)) {
        return { status: "not_earned" };
      }

      // A perk redemption freezes the period it consumed, so editing the
      // period settings later cannot make the same fortnight eligible twice
      // (perkUsedAt checks overlap against these stored bounds).
      const period =
        card.perk && card.perk.period.perk === input.rewardId
          ? card.perk.period
          : null;

      const redemption: Redemption = {
        id: store.nextRedemptionId++,
        memberId: member.id,
        rewardId: input.rewardId,
        locationSlug: input.locationSlug,
        staffId: input.staffId,
        createdAt: now.toISOString(),
        ...(period
          ? { perkPeriodStart: period.startsAt, perkPeriodEnd: period.endsAt }
          : {}),
      };
      store.redemptions.push(redemption);

      return { status: "redeemed", redemption };
    },

    async markStudentVerified(
      memberId: string,
      staffId: string | null,
      now?: Date,
    ): Promise<Member | null> {
      const member = memberById(memberId);
      if (!member) return null;
      member.studentVerifiedAt = (now ?? new Date()).toISOString();
      // studentVerifiedBy lands in the Supabase adapter (staff_users FK).
      void staffId;
      return member;
    },

    async markReviewIntent(
      memberId: string,
      now?: Date,
    ): Promise<Member | null> {
      const member = memberById(memberId);
      if (!member) return null;
      // Only the first tap is recorded: the barista reads this as "when did
      // they say they would review", and repeat taps must not move it.
      member.reviewIntentAt ??= (now ?? new Date()).toISOString();
      return member;
    },

    async reissuePassSerial(memberId: string): Promise<ReissuePassSerialResult> {
      const store = getStore();
      const member = memberById(memberId);
      if (!member) return { status: "not_found" };

      // Replace, never keep: findMemberByPassSerial matches only the current
      // serial, so the leaked QR stops resolving with this one assignment.
      member.passSerial = newPassSerial((serial) =>
        store.members.some((m) => m.passSerial === serial),
      );
      return { status: "reissued", serial: member.passSerial };
    },

    async setMemberBlocked(
      memberId: string,
      blocked: boolean,
      now?: Date,
    ): Promise<SetMemberBlockedResult> {
      const member = memberById(memberId);
      if (!member) return { status: "not_found" };
      member.blockedAt = blocked ? (now ?? new Date()).toISOString() : null;
      return { status: "saved", member };
    },

    async forgetMember(memberId: string): Promise<ForgetMemberResult> {
      const store = getStore();
      const index = store.members.findIndex((m) => m.id === memberId);
      if (index === -1) return { status: "not_found" };
      store.members.splice(index, 1);

      // The events are kept, detached — not deleted. Stamps and redemptions
      // are the café's operational record: per-location and per-barista
      // counts and the reward totals in getStats must not shrink because a
      // person exercised erasure — the coffees were really handed out. What
      // must go is the identity, so memberId becomes a sentinel no member
      // row can ever carry (real ids are UUIDs or seeded "demo-N"); with the
      // member row gone, nothing resolves these events to a person again.
      // The Supabase adapter does the same with a nullable FK set to null.
      for (const stamp of store.stamps) {
        if (stamp.memberId === memberId) stamp.memberId = FORGOTTEN_MEMBER;
      }
      for (const redemption of store.redemptions) {
        if (redemption.memberId === memberId) {
          redemption.memberId = FORGOTTEN_MEMBER;
        }
      }

      // The Jurnal is the last place holding the name: earlier rows say
      // things like "A retras acordul promoțional pentru Ana Pop". Erasure
      // that leaves those standing is not erasure. The rows survive, because
      // an audit trail that can be deleted is worth nothing — only the
      // personal part is redacted, and what happened and who did it stays.
      for (const entry of store.auditLog) {
        if (entry.target !== memberId) continue;
        entry.target = FORGOTTEN_MEMBER;
        entry.summary = `${entry.action}: acțiune pe un membru șters ulterior la cerere (GDPR).`;
        delete entry.details;
      }

      return { status: "forgotten" };
    },

    async withdrawMarketingConsent(
      memberId: string,
    ): Promise<WithdrawMarketingConsentResult> {
      const member = memberById(memberId);
      if (!member) return { status: "not_found" };
      // Both fields go: a version without a date would look like consent.
      // When and by whom is the audit row's job, written by the action.
      member.marketingConsentAt = null;
      member.marketingConsentVersion = null;
      return { status: "saved", member };
    },

    async getStaffForSession(
      session: StaffSession,
    ): Promise<StaffUser | null> {
      const staff = getStore().staff;
      // Only active rows resolve: a person deactivated mid-shift loses the
      // session on the next request, because readStaffSession re-reads here.
      if (session.staffId) {
        // Personal login: the id must still belong to the session's location.
        return (
          staff.find(
            (s) =>
              s.id === session.staffId &&
              s.locationSlug === session.locationSlug &&
              s.role === session.role &&
              s.active,
          ) ?? null
        );
      }
      // Shared code: only the café's shared account answers. Falling through
      // to any matching row would credit a named barista with stamps scanned
      // on the common code, and "cine nu scanează" is exactly what the
      // manager reads Statistici for.
      return (
        staff.find(
          (s) =>
            s.locationSlug === session.locationSlug &&
            s.role === session.role &&
            s.shared &&
            s.active,
        ) ?? null
      );
    },

    async findStaffByPin(
      locationSlug: string,
      pin: string,
    ): Promise<StaffUser | null> {
      const store = getStore();
      const entry = store.staffPins.find(
        (p) =>
          p.locationSlug === locationSlug && verifyStaffPin(pin, p.pinHash),
      );
      if (!entry) return null;
      const staff = store.staff.find((s) => s.id === entry.staffId) ?? null;
      // A right code on a deactivated row is still a refused login.
      return staff?.active ? staff : null;
    },

    /* ------------------------------------------------------------- menu --- */

    async listLocations(): Promise<Location[]> {
      return getStore().locations;
    },

    async getLocationBySlug(slug: string): Promise<Location | null> {
      return getStore().locations.find((l) => l.slug === slug) ?? null;
    },

    async listCategories(): Promise<Category[]> {
      return [...getStore().categories].sort((a, b) => a.order - b.order);
    },

    async listProducts(): Promise<AdminProduct[]> {
      return getStore().products.filter((p) => p.active);
    },

    async listAdminProducts(): Promise<AdminProduct[]> {
      return getStore().products;
    },

    async createProduct(input: NewProductInput): Promise<AdminProduct> {
      const store = getStore();
      const base = slugify(input.name.ro) || "produs";
      let id = base;
      for (let n = 2; store.products.some((p) => p.id === id); n += 1) {
        id = `${base}-${n}`;
      }

      const product: AdminProduct = {
        id,
        categorySlug: input.categorySlug,
        name: input.name,
        description: input.description ?? null,
        price: input.price ?? null,
        priceFrom: input.priceFrom ?? null,
        locations: input.locations ?? null,
        alcohol: input.alcohol ?? false,
        seasonal: false,
        active: true,
        ...(input.photo ? { photo: input.photo } : {}),
      };
      store.products.push(product);
      return product;
    },

    async updateProduct(
      id: string,
      patch: ProductPatch,
    ): Promise<AdminProduct | null> {
      const product = getStore().products.find((p) => p.id === id);
      if (!product) return null;

      if (patch.categorySlug !== undefined) {
        product.categorySlug = patch.categorySlug;
      }
      if (patch.name !== undefined) product.name = patch.name;
      if (patch.description !== undefined) product.description = patch.description;
      if (patch.price !== undefined) product.price = patch.price;
      if (patch.priceFrom !== undefined) product.priceFrom = patch.priceFrom;
      if (patch.locations !== undefined) product.locations = patch.locations;
      if (patch.alcohol !== undefined) product.alcohol = patch.alcohol;
      if (patch.seasonal !== undefined) product.seasonal = patch.seasonal;
      if (patch.active !== undefined) product.active = patch.active;
      // `photo` is optional on the type, so removing it deletes the key
      // instead of storing a null the public components would have to guard.
      if (patch.photo !== undefined) setPhoto(product, patch.photo);

      return product;
    },

    async setSeasonalProduct(
      id: string,
      seasonal: boolean,
    ): Promise<AdminProduct | null> {
      const store = getStore();
      const product = store.products.find((p) => p.id === id);
      if (!product) return null;

      // One synchronous store mutation here; the Supabase adapter implements
      // the same port with a transaction/RPC.
      if (seasonal) {
        for (const item of store.products) item.seasonal = item.id === id;
      } else {
        product.seasonal = false;
      }
      return product;
    },

    async updateCategory(
      slug: string,
      patch: CategoryPatch,
    ): Promise<Category | null> {
      const category = getStore().categories.find((c) => c.slug === slug);
      if (!category) return null;

      if (patch.photo !== undefined) setPhoto(category, patch.photo);

      return category;
    },

    async updateLocation(
      slug: string,
      patch: LocationPatch,
    ): Promise<Location | null> {
      const location = getStore().locations.find((l) => l.slug === slug);
      if (!location) return null;

      if (patch.hours !== undefined) location.hours = patch.hours;
      if (patch.woltUrl !== undefined) location.woltUrl = patch.woltUrl;
      if (patch.servesAlcohol !== undefined) {
        location.servesAlcohol = patch.servesAlcohol;
      }
      if (patch.googleRating !== undefined) {
        location.googleRating = patch.googleRating;
      }
      if (patch.googleReviewCount !== undefined) {
        location.googleReviewCount = patch.googleReviewCount;
      }
      if (patch.googlePlaceId !== undefined) {
        location.googlePlaceId = patch.googlePlaceId;
      }
      if (patch.reviewUrl !== undefined) location.reviewUrl = patch.reviewUrl;
      if (patch.comingSoon !== undefined) location.comingSoon = patch.comingSoon;
      if (patch.photo !== undefined) setPhoto(location, patch.photo);
      if (patch.heroPhoto !== undefined) {
        setPhoto(location, patch.heroPhoto, "heroPhoto");
      }

      return location;
    },

    async createLocation(
      input: NewLocationInput,
    ): Promise<CreateLocationResult> {
      const store = getStore();

      const name = input.name.trim();
      const slug = slugify(name);
      if (!slug) return { status: "invalid_name" };
      if (store.locations.some((l) => l.slug === slug)) {
        return { status: "name_exists" };
      }

      const location: Location = {
        slug,
        name,
        address: input.addressRo ? { ro: input.addressRo } : null,
        hours: input.hoursRo
          ? input.hoursHu
            ? { ro: input.hoursRo, hu: input.hoursHu }
            : { ro: input.hoursRo }
          : null,
        comingSoon: input.comingSoon ?? true,
        seasonalNote: null,
        googlePlaceId: null,
        googleRating: null,
        googleReviewCount: null,
        reviewUrl: null,
        woltUrl: null,
        // Never guessed: stays "de confirmat" until the manager sets it.
        servesAlcohol: null,
      };
      store.locations.push(location);

      // Same staffing shape as the seeded cafenele: the shared barista and
      // manager rows resolve the env PINs, the personal rows get their own
      // generated codes, returned exactly once.
      store.staff.push(
        {
          id: `staff-${slug}`,
          name: "Cont comun barista",
          role: "barista",
          locationSlug: slug,
          active: true,
          shared: true,
        },
        {
          id: `staff-manager-${slug}`,
          name: "Cont comun manager",
          role: "manager",
          locationSlug: slug,
          active: true,
          shared: true,
        },
      );

      const staffPins: { name: string; pin: string }[] = [];
      for (let i = 1; i <= 2; i += 1) {
        const staffId = `staff-${slug}-b${i}`;
        const name = `Barista ${i}`;
        store.staff.push({
          id: staffId,
          name,
          role: "barista",
          locationSlug: slug,
          active: true,
          shared: false,
        });
        const pin = newStaffPin((candidate) => pinTakenAt(store, slug, candidate));
        store.staffPins.push({
          locationSlug: slug,
          pinHash: hashStaffPin(pin),
          staffId,
        });
        staffPins.push({ name, pin });
      }

      return { status: "created", location, staffPins };
    },

    /* ----------------------------------------------------------- echipa --- */

    async listStaff(locationSlug?: string): Promise<StaffUser[]> {
      const staff = locationSlug
        ? getStore().staff.filter((s) => s.locationSlug === locationSlug)
        : getStore().staff;
      // Stable reading order for the team screen: cafenea, then name.
      return [...staff].sort(
        (a, b) =>
          a.locationSlug.localeCompare(b.locationSlug) ||
          a.name.localeCompare(b.name, "ro"),
      );
    },

    async createStaff(input: NewStaffInput): Promise<CreateStaffResult> {
      const store = getStore();
      const name = cleanStaffName(input.name);
      if (!name) return { status: "invalid_name" };
      // Coming-soon cafenele count: they get staffed before they open.
      if (!store.locations.some((l) => l.slug === input.locationSlug)) {
        return { status: "unknown_location" };
      }

      const staff: StaffUser = {
        // Random like member ids — the readable staff-{slug} ids stay with
        // the seed; Supabase uses uuids here anyway (staff_users.id).
        id: crypto.randomUUID(),
        name,
        role: input.role,
        locationSlug: input.locationSlug,
        active: true,
        // A person the manager added is never the shared account: their code
        // is personal, and so is the Statistici line it fills.
        shared: false,
      };
      store.staff.push(staff);

      const pin = newStaffPin((candidate) =>
        pinTakenAt(store, input.locationSlug, candidate),
      );
      store.staffPins.push({
        locationSlug: input.locationSlug,
        pinHash: hashStaffPin(pin),
        staffId: staff.id,
      });

      return { status: "created", staff, pin };
    },

    async renameStaff(id: string, name: string): Promise<RenameStaffResult> {
      const staff = getStore().staff.find((s) => s.id === id);
      if (!staff) return { status: "not_found" };
      const cleaned = cleanStaffName(name);
      if (!cleaned) return { status: "invalid_name" };
      staff.name = cleaned;
      return { status: "renamed", staff };
    },

    async setStaffPin(id: string, pin?: string): Promise<SetStaffPinResult> {
      const store = getStore();
      const staff = store.staff.find((s) => s.id === id);
      if (!staff) return { status: "not_found" };
      // The shared account answers to the env code, which this store does not
      // own. Issuing a "new" one would leave the old env code working.
      if (staff.shared) return { status: "shared_account" };

      let next: string;
      if (pin === undefined) {
        next = newStaffPin((candidate) =>
          pinTakenAt(store, staff.locationSlug, candidate, staff.id),
        );
      } else {
        // Manager-typed code: same rules a generated one lives by.
        if (!/^\d{4}$/.test(pin)) return { status: "invalid_pin" };
        if (
          reservedPins().has(pin) ||
          pinTakenAt(store, staff.locationSlug, pin, staff.id)
        ) {
          return { status: "pin_taken" };
        }
        next = pin;
      }

      // Replace, never append: the old code must stop working immediately.
      store.staffPins = store.staffPins.filter((p) => p.staffId !== staff.id);
      store.staffPins.push({
        locationSlug: staff.locationSlug,
        pinHash: hashStaffPin(next),
        staffId: staff.id,
      });

      return { status: "set", staff, pin: next };
    },

    async setStaffActive(
      id: string,
      active: boolean,
    ): Promise<SetStaffActiveResult> {
      const staff = getStore().staff.find((s) => s.id === id);
      if (!staff) return { status: "not_found" };
      staff.active = active;
      return { status: "saved", staff };
    },

    /* ------------------------------------------------------------- push --- */

    async createPushCampaign(
      input: NewPushCampaignInput,
    ): Promise<PushCampaign> {
      const store = getStore();
      const now = input.now ?? new Date();
      const campaign: PushCampaign = {
        id: store.nextCampaignId++,
        messageRo: input.messageRo,
        messageHu: input.messageHu,
        segment: input.segment,
        // Recorded as sent right away; real pass updates arrive with phase 3,
        // so the honest count today is zero.
        sentAt: now.toISOString(),
        passesUpdated: 0,
        createdBy: input.staffId,
        createdAt: now.toISOString(),
      };
      store.campaigns.push(campaign);
      return campaign;
    },

    async listPushCampaigns(): Promise<PushCampaign[]> {
      return [...getStore().campaigns].sort((a, b) => b.id - a.id);
    },

    /* ------------------------------------------------------------ audit --- */

    async recordAudit(input: NewAuditInput): Promise<AuditEvent> {
      const store = getStore();
      const event: AuditEvent = {
        id: store.nextAuditId++,
        at: (input.now ?? new Date()).toISOString(),
        staffId: input.staffId,
        staffName: input.staffName,
        locationSlug: input.locationSlug,
        action: input.action,
        target: input.target,
        summary: input.summary,
        details: input.details ?? null,
      };
      store.auditLog.push(event);
      return event;
    },

    async listAudit(options?: { limit?: number }): Promise<AuditEvent[]> {
      const limit = options?.limit ?? 50;
      // Ids grow with time, so newest-first is just the reversed tail.
      return [...getStore().auditLog].sort((a, b) => b.id - a.id).slice(0, limit);
    },

    /* ----------------------------------------------------------- desene --- */

    async createDrawingEntry(
      input: NewDrawingEntryInput,
    ): Promise<CreateDrawingEntryResult> {
      const store = getStore();
      const checked = validateNewDrawingEntry(input);
      if (!checked.ok) return { status: checked.status };
      const v = checked.values;
      // The sequence is read and written in one synchronous step: the memory
      // store runs on a single thread, so two submits cannot share a number.
      // Supabase does the same with `next_drawing_code()` (migration 0002).
      const sequence = store.drawingSequences[v.location] + 1;
      store.drawingSequences[v.location] = sequence;

      const now = (input.now ?? new Date()).toISOString();
      const entry: DrawingEntry = {
        id: crypto.randomUUID(),
        code: drawingCode(v.location, sequence),
        location: v.location,
        childFirstName: v.childFirstName,
        childAge: v.childAge,
        category: v.category,
        parentName: v.parentName,
        phone: v.phone,
        consentParticipation: true,
        consentReproduction: v.consentReproduction,
        attribution: v.attribution,
        consentPhoto: v.consentPhoto,
        consentGallery: v.consentGallery,
        imageOriginal: null,
        imageWeb: null,
        imageWidth: null,
        imageHeight: null,
        cupMockup: null,
        publishedAt: null,
        unpublishedAt: null,
        voteWinner: false,
        sheetKind: null,
        submittedAt: null,
        submittedBy: null,
        winnerKind: null,
        winnerAcceptedAt: null,
        reserveRank: null,
        circleOptIn: v.circleOptIn,
        status: "inregistrat",
        registeredVia: input.registeredVia,
        ...(input.registeredBy ? { registeredBy: input.registeredBy } : {}),
        createdAt: now,
        updatedAt: now,
      };
      store.drawingEntries.push(entry);
      return { status: "created", entry };
    },

    async getDrawingEntry(id: string): Promise<DrawingEntry | null> {
      return getStore().drawingEntries.find((e) => e.id === id) ?? null;
    },

    async findDrawingEntryByCode(code: string): Promise<DrawingEntry | null> {
      const wanted = normalizeDrawingCode(code);
      if (!wanted) return null;
      return getStore().drawingEntries.find((e) => e.code === wanted) ?? null;
    },

    async listDrawingEntries(options?: {
      location?: DrawingLocation;
    }): Promise<DrawingEntry[]> {
      return getStore()
        .drawingEntries.filter(
          (e) => !options?.location || e.location === options.location,
        )
        .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
    },

    async setDrawingStatus(
      id: string,
      status: DrawingStatus,
      role: StaffRole,
      now: Date = new Date(),
    ): Promise<SetDrawingStatusResult> {
      const entry = getStore().drawingEntries.find((e) => e.id === id);
      if (!entry) return { status: "not_found" };
      if (!canChangeDrawingStatus(entry.status, status, role)) {
        return { status: "invalid_transition" };
      }
      if (status === "selectat" && !campaignPrintable(entry)) {
        return { status: "not_eligible" };
      }
      // Vote winners are decided first; the jury picks from the rest.
      if (status === "selectat" && entry.voteWinner) {
        return { status: "invalid_transition" };
      }
      const from = entry.status;
      entry.status = status;
      entry.updatedAt = now.toISOString();
      return { status: "saved", entry, from };
    },

    async deleteDrawingEntries(): Promise<{ deleted: number }> {
      const store = getStore();
      const ids = new Set(store.drawingEntries.map((e) => e.id));
      const deleted = store.drawingEntries.length;
      store.drawingEntries = [];
      // Votes and pending codes belong to the entries: they go with them.
      store.drawingVotes = [];
      store.drawingVoteCodes = [];
      // The sequences restart with the data: a second edition starts at 001.
      store.drawingSequences = { rogerius: 0, era: 0, "palatul-copiilor": 0 };

      store.rateLimits.clear();
      redactDrawingAudit(ids);
      return { deleted };
    },

    /* ---------------------------------------------- desene: galerie + vot --- */

    async setDrawingImage(
      id: string,
      image: DrawingImageInput,
      now: Date = new Date(),
    ): Promise<DrawingEntry | null> {
      const entry = getStore().drawingEntries.find((e) => e.id === id);
      if (!entry) return null;
      entry.imageOriginal = image.original;
      entry.imageWeb = image.web;
      entry.imageWidth = image.width;
      entry.imageHeight = image.height;
      entry.cupMockup = image.cupMockup;
      entry.updatedAt = now.toISOString();
      return entry;
    },

    async publishDrawing(
      id: string,
      now: Date = new Date(),
    ): Promise<PublishDrawingResult> {
      const entry = getStore().drawingEntries.find((e) => e.id === id);
      if (!entry) return { status: "not_found" };
      const block = drawingPublishBlock(entry);
      if (block) return { status: "blocked", reason: block };
      // First publish only: a take-down and return keeps the original clock.
      entry.publishedAt ??= now.toISOString();
      entry.unpublishedAt = null;
      entry.updatedAt = now.toISOString();
      return { status: "published", entry };
    },

    async unpublishDrawing(
      id: string,
      now: Date = new Date(),
    ): Promise<DrawingEntry | null> {
      const entry = getStore().drawingEntries.find((e) => e.id === id);
      if (!entry) return null;
      if (drawingIsLive(entry)) {
        entry.unpublishedAt = now.toISOString();
        entry.updatedAt = now.toISOString();
      }
      return entry;
    },

    async listPublishedDrawings(): Promise<DrawingEntry[]> {
      return getStore()
        .drawingEntries.filter((e) => drawingIsLive(e) && e.imageWeb !== null)
        .sort((a, b) => (a.publishedAt! < b.publishedAt! ? 1 : -1));
    },

    async setDrawingVoteWinner(
      id: string,
      winner: boolean,
      now: Date = new Date(),
    ): Promise<SetVoteWinnerResult> {
      const entry = getStore().drawingEntries.find((e) => e.id === id);
      if (!entry) return { status: "not_found" };
      // Unmarking only ever clears a VOTE win; a jury pick is left alone.
      if (!winner && entry.winnerKind !== "vote") {
        return { status: "saved", entry, replaced: null };
      }
      const result = setWinner(id, winner ? "vote" : null, now);
      // "is_vote_winner" cannot happen for kind "vote".
      return result as SetVoteWinnerResult;
    },

    async createVoteCode(input: NewVoteCodeInput): Promise<void> {
      const store = getStore();
      store.drawingVoteCodes = store.drawingVoteCodes.filter(
        (c) => !(c.drawingId === input.drawingId && c.emailHash === input.emailHash),
      );
      store.drawingVoteCodes.push({ ...input, attempts: 0 });
    },

    async redeemVoteCode(input: {
      drawingId: string;
      emailHash: string;
      codeHash: string;
      maxAttempts: number;
      now?: Date;
    }): Promise<RedeemVoteCodeResult> {
      const store = getStore();
      const now = input.now ?? new Date();
      const pending = store.drawingVoteCodes.find(
        (c) => c.drawingId === input.drawingId && c.emailHash === input.emailHash,
      );
      if (!pending) return { status: "no_code" };
      if (new Date(pending.expiresAt).getTime() <= now.getTime()) {
        return { status: "expired" };
      }
      if (pending.attempts >= input.maxAttempts) {
        return { status: "too_many_attempts" };
      }
      if (pending.codeHash !== input.codeHash) {
        pending.attempts += 1;
        const attemptsLeft = input.maxAttempts - pending.attempts;
        return attemptsLeft > 0
          ? { status: "wrong_code", attemptsLeft }
          : { status: "too_many_attempts" };
      }

      // Right code: it is spent whatever happens next.
      store.drawingVoteCodes = store.drawingVoteCodes.filter((c) => c !== pending);
      const result = recordVote(input.drawingId, input.emailHash, now);
      // A drawing taken down between the e-mail and the code: nothing to vote for.
      return result.status === "not_live" ? { status: "no_code" } : result;
    },

    async castVote(input: {
      drawingId: string;
      emailHash: string;
      now?: Date;
    }): Promise<CastVoteResult> {
      return recordVote(input.drawingId, input.emailHash, input.now ?? new Date());
    },

    async hasVoted(drawingId: string, emailHash: string): Promise<boolean> {
      return getStore().drawingVotes.some(
        (v) => v.drawingId === drawingId && v.emailHash === emailHash,
      );
    },

    async listDrawingVotes(): Promise<DrawingVote[]> {
      return [...getStore().drawingVotes].sort((a, b) =>
        a.createdAt < b.createdAt ? -1 : 1,
      );
    },

    /* ------------------------------------------ desene: fazele concursului --- */

    async markDrawingSubmitted(
      id: string,
      input: { sheetKind: string; staffId: string | null },
      now: Date = new Date(),
    ): Promise<MarkDrawingSubmittedResult> {
      const entry = getStore().drawingEntries.find((e) => e.id === id);
      if (!entry) return { status: "not_found" };
      if (!isSheetKind(input.sheetKind)) return { status: "invalid_sheet_kind" };
      if (!(SUBMITTABLE_STATUSES as readonly string[]).includes(entry.status)) {
        return { status: "invalid_transition" };
      }
      if (
        input.sheetKind === "alta-foaie" &&
        (entry.winnerKind !== null || entry.reserveRank !== null)
      ) {
        return { status: "not_eligible" };
      }
      const from = entry.status;
      entry.sheetKind = input.sheetKind;
      entry.submittedAt ??= now.toISOString();
      entry.submittedBy ??= input.staffId;
      if (entry.status === "inregistrat") entry.status = "depus";
      entry.updatedAt = now.toISOString();
      return { status: "saved", entry, from };
    },

    async setDrawingWinner(
      id: string,
      kind: WinnerKind | null,
      now: Date = new Date(),
    ): Promise<SetDrawingWinnerResult> {
      return setWinner(id, kind, now);
    },

    async setWinnerAccepted(
      id: string,
      acceptedAt: Date | null,
    ): Promise<SetWinnerAcceptedResult> {
      const entry = getStore().drawingEntries.find((e) => e.id === id);
      if (!entry) return { status: "not_found" };
      if (entry.winnerKind === null) return { status: "not_winner" };
      entry.winnerAcceptedAt = acceptedAt ? acceptedAt.toISOString() : null;
      entry.updatedAt = (acceptedAt ?? new Date()).toISOString();
      return { status: "saved", entry };
    },

    async setReserveRank(
      id: string,
      rank: number | null,
      now: Date = new Date(),
    ): Promise<SetReserveRankResult> {
      const store = getStore();
      const entry = store.drawingEntries.find((e) => e.id === id);
      if (!entry) return { status: "not_found" };
      if (rank !== null) {
        if (!Number.isInteger(rank) || rank < 1) return { status: "invalid_rank" };
        if (entry.winnerKind !== null) return { status: "is_winner" };
        if (!campaignPrintable(entry)) return { status: "not_eligible" };
        const taken = store.drawingEntries.some(
          (e) => e.id !== entry.id && e.category === entry.category && e.reserveRank === rank,
        );
        if (taken) return { status: "rank_taken" };
      }
      entry.reserveRank = rank;
      entry.updatedAt = now.toISOString();
      return { status: "saved", entry };
    },

    async getCampaignState(): Promise<CampaignState> {
      return { ...getStore().campaignState };
    },

    async updateCampaignState(patch: Partial<CampaignState>): Promise<CampaignState> {
      const store = getStore();
      for (const key of ["resultsPublishedAt", "collectionConfirmedAt"] as const) {
        if (patch[key] !== undefined) store.campaignState[key] = patch[key];
      }
      return { ...store.campaignState };
    },

    async recordCampaignEvent(event: NewCampaignEventInput): Promise<void> {
      if (!isCampaignEventName(event.name)) {
        throw new Error(`Eveniment de campanie necunoscut: ${String(event.name)}`);
      }
      getStore().campaignEvents.push({
        name: event.name,
        ...sanitizeEventProps(event as unknown as Record<string, unknown>),
        createdAt: (event.now ?? new Date()).toISOString(),
      });
    },

    async listCampaignEvents(options?: {
      from?: Date;
      to?: Date;
      name?: string;
    }): Promise<CampaignEvent[]> {
      const from = options?.from?.toISOString();
      const to = options?.to?.toISOString();
      return getStore()
        .campaignEvents.filter(
          (e) =>
            (!from || e.createdAt >= from) &&
            (!to || e.createdAt < to) &&
            (!options?.name || e.name === options.name),
        )
        .sort((a, b) => (a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0))
        .map((e) => ({ ...e }));
    },

    async rateLimitHit(
      key: string,
      options: { limit: number; windowMs: number },
      now: Date = new Date(),
    ): Promise<boolean> {
      const limits = getStore().rateLimits;
      const t = now.getTime();
      const current = limits.get(key);
      if (!current || t - current.windowStart >= options.windowMs) {
        limits.set(key, { windowStart: t, hits: 1 });
        return 1 <= options.limit;
      }
      current.hits += 1;
      return current.hits <= options.limit;
    },

    /* ------------------------------------------------------------ stats --- */

    async getStats(now: Date = new Date()): Promise<PlatformStats> {
      const store = getStore();
      const t7 = now.getTime() - 7 * DAY;
      const t30 = now.getTime() - 30 * DAY;
      const since = (iso: string, t: number) => new Date(iso).getTime() >= t;

      const byReward = new Map<RewardId, number>();
      for (const redemption of store.redemptions) {
        byReward.set(
          redemption.rewardId,
          (byReward.get(redemption.rewardId) ?? 0) + 1,
        );
      }

      const locations: LocationStats[] = store.locations.map((location) => {
        const stamps = store.stamps.filter(
          (s) => s.locationSlug === location.slug,
        );
        return {
          slug: location.slug,
          name: location.name,
          stamps7d: stamps.filter((s) => since(s.createdAt, t7)).length,
          stamps30d: stamps.filter((s) => since(s.createdAt, t30)).length,
          redemptions30d: store.redemptions.filter(
            (r) =>
              r.locationSlug === location.slug && since(r.createdAt, t30),
          ).length,
          googleRating: location.googleRating,
          googleReviewCount: location.googleReviewCount,
        };
      });

      return {
        membersTotal: store.members.length,
        members30d: store.members.filter((m) => since(m.createdAt, t30))
          .length,
        studentsTotal: store.members.filter((m) => m.isStudent).length,
        studentsVerified: store.members.filter(
          (m) => m.studentVerifiedAt !== null,
        ).length,
        goldMembers: store.members.filter(
          (m) => cardOf(m.id, now).gold.isGold,
        ).length,
        consentOutdated: store.members.filter(
          (m) => m.consentVersion !== CONSENT_VERSION,
        ).length,
        // Same-format ISO strings, so `>` compares instants correctly.
        retentionDue: membersPastRetention(
          store.members.map((member) => {
            let last: string | null = null;
            for (const s of store.stamps) {
              if (s.memberId === member.id && (last === null || s.createdAt > last)) {
                last = s.createdAt;
              }
            }
            for (const r of store.redemptions) {
              if (r.memberId === member.id && (last === null || r.createdAt > last)) {
                last = r.createdAt;
              }
            }
            return { createdAt: member.createdAt, lastActivityAt: last };
          }),
          now,
        ).length,
        stampsTotal: store.stamps.length,
        stamps7d: store.stamps.filter((s) => since(s.createdAt, t7)).length,
        stamps30d: store.stamps.filter((s) => since(s.createdAt, t30)).length,
        redemptionsTotal: store.redemptions.length,
        redemptionsByReward: [...byReward.entries()].map(
          ([rewardId, count]) => ({
            rewardId,
            name: config().names[rewardId].ro,
            count,
          }),
        ),
        reviewBonuses: store.stamps.filter((s) => s.kind === "review_bonus")
          .length,
        campaignsSent: store.campaigns.filter((c) => c.sentAt !== null)
          .length,
        locations,
        baristas: store.staff
          .filter((s) => s.role === "barista")
          .map((s) => ({
            staffId: s.id,
            name: s.name,
            locationSlug: s.locationSlug,
            locationName:
              store.locations.find((l) => l.slug === s.locationSlug)?.name ??
              s.locationSlug,
            stamps7d: store.stamps.filter(
              (e) => e.staffId === s.id && since(e.createdAt, t7),
            ).length,
            stamps30d: store.stamps.filter(
              (e) => e.staffId === s.id && since(e.createdAt, t30),
            ).length,
            redemptions30d: store.redemptions.filter(
              (r) => r.staffId === s.id && since(r.createdAt, t30),
            ).length,
          }))
          .sort((a, b) => b.stamps30d - a.stamps30d),
      };
    },
  };
}
