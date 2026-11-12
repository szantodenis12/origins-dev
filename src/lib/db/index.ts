import type {
  Category,
  I18nText,
  Lang,
  Location,
  Product,
} from "../types.ts";
import type {
  LoyaltyConfig,
  Redemption,
  RewardDef,
  RewardId,
  StampEvent,
  StampKind,
  // Explicit .ts extensions: the memory adapter now imports CONSENT_VERSION
  // from this module, so tests reach it under plain Node, whose type
  // stripping resolves relative paths literally.
} from "../loyalty.ts";
import type {
  DrawingAttribution,
  DrawingCategory,
  DrawingLocation,
  DrawingStatus,
} from "../drawing.ts";
import type { CampaignState } from "../campaign-phase.ts";
import type {
  CampaignEvent,
  CampaignEventName,
  CampaignEventProps,
} from "../campaign-metrics.ts";
import type { SheetKind, WinnerKind } from "./campaign-rules.ts";
import { createDb } from "./compose.ts";

export type { SheetKind, WinnerKind } from "./campaign-rules.ts";

/**
 * Ports and adapters. Everything above this file talks to the `Db` interface,
 * never to a driver.
 *
 * Two halves (compose.ts):
 *   LoyaltyDb   members, cards, menu, staff, audit, stats — the in-memory
 *               adapter (memory.ts), unchanged.
 *   CampaignDb  the Christmas drawing contest — persistent when
 *               SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY are set
 *               (supabase.ts, PostgREST over fetch, service role, server
 *               only); the memory adapter in dev/test without them; and in
 *               production without them every campaign method throws
 *               `CampaignStoreUnavailableError` instead of quietly keeping
 *               children's drawings in RAM.
 */

/**
 * Version of the regulament + privacy text the member agreed to. Bump the
 * date whenever /regulament or /confidentialitate changes materially.
 */
export const CONSENT_VERSION = "2026-08-04";

export interface Member {
  id: string;
  name: string;
  /** Canonical national format ("0740038569") — see lib/phone.ts. Unique. */
  phone: string;
  /**
   * Set by a manager when the card is abused (e.g. a circulating screenshot).
   * A blocked card earns nothing: addStamp and redeemReward refuse, the web
   * card shows a notice. The row itself stays — blocking is not deletion.
   */
  blockedAt: string | null;
  /**
   * Full birthdate (client decision 26.07.2026): age verification for the
   * under-16 parental-consent rule. All three set or
   * all three null (null only on legacy/demo rows — signup requires it).
   */
  birthDay: number | null;
  birthMonth: number | null;
  birthYear: number | null;
  lang: Lang;
  /** Declared at signup. On its own it grants nothing. */
  isStudent: boolean;
  /** Set when a barista checked the physical student card. */
  studentVerifiedAt: string | null;
  /** QR payload of the Wallet pass. */
  passSerial: string;
  /** When the mandatory program/privacy acceptance was recorded. */
  consentAt: string | null;
  consentVersion: string | null;
  /** Optional, explicit consent for promotional Wallet notifications. */
  marketingConsentAt: string | null;
  marketingConsentVersion: string | null;
  /** Set when the member tapped "Lasă o recenzie" on the location page. */
  reviewIntentAt: string | null;
  reviewBonusGiven: boolean;
  createdAt: string;
}

export interface NewMemberInput {
  name: string;
  /** Any user-typed form; the adapter normalizes before the unique check. */
  phone: string;
  birthDay: number;
  birthMonth: number;
  birthYear: number;
  lang: Lang;
  isStudent: boolean;
  marketingConsent?: boolean;
  consentVersion: string;
  now?: Date;
}

export type CreateMemberResult =
  | { status: "created"; member: Member }
  /** Spec §6.4: no SMS — the barista opens the existing card from admin. */
  | { status: "phone_exists" }
  | { status: "invalid_phone" };

export type StaffRole = "barista" | "manager";

export interface StaffUser {
  id: string;
  name: string;
  role: StaffRole;
  locationSlug: string;
  /**
   * Nobody is hard-deleted: stamp_events and redemptions reference staffId
   * and Statistici is built on it. Inactive staff cannot log in and drop off
   * the active team list, but every past stamp stays attributed.
   */
  active: boolean;
  /**
   * The café's shared account — the one the env PINs (ADMIN_DEV_PIN,
   * ADMIN_MANAGER_PIN) log into. A shift started on a shared code resolves
   * ONLY to this row, never to a named barista who happens to match the same
   * location and role, or their Statistici line would fill up with stamps
   * somebody else scanned. Deactivating it is how a café switches the shared
   * code off once everyone has a personal one.
   */
  shared: boolean;
}

/** What the httpOnly admin cookie carries. */
export interface StaffSession {
  locationSlug: string;
  role: StaffRole;
  /** Set when the login used a personal code — attributes stamps to a person. */
  staffId?: string;
}

export interface AddStampInput {
  memberId: string;
  locationSlug: string;
  staffId: string | null;
  /**
   * "auto" resolves to normal or double_tuesday from the clock and respects
   * the 2h window. An explicit kind (review_bonus, signup_promo) is a
   * deliberate barista grant and skips the window.
   */
  kind?: "auto" | StampKind;
  now?: Date;
}

export type AddStampResult =
  | { status: "added"; event: StampEvent }
  | { status: "already_stamped"; lastStampAt: string; nextAllowedAt: string }
  | { status: "not_found" }
  /** Review bonus is once per member, for life. */
  | { status: "bonus_used" }
  /** The card is blocked by a manager; nothing accrues until unblocked. */
  | { status: "blocked" };

export interface RedeemInput {
  memberId: string;
  rewardId: RewardId;
  locationSlug: string;
  staffId: string | null;
  now?: Date;
}

export type RedeemResult =
  | { status: "redeemed"; redemption: Redemption }
  | { status: "not_earned" }
  | { status: "not_found" }
  /** The card is blocked by a manager; nothing is handed over. */
  | { status: "blocked" };

export type ReissuePassSerialResult =
  | { status: "reissued"; serial: string }
  | { status: "not_found" };

export type SetMemberBlockedResult =
  | { status: "saved"; member: Member }
  | { status: "not_found" };

/** GDPR erasure: once forgotten, nothing resolves to the person again. */
export type ForgetMemberResult =
  | { status: "forgotten" }
  | { status: "not_found" };

/** Consent withdrawal: the membership continues, the promo channel stops. */
export type WithdrawMarketingConsentResult =
  | { status: "saved"; member: Member }
  | { status: "not_found" };

/* --------------------------------------------------- program (settings) --- */

/**
 * The manager edits the mechanics in /admin/setari; the adapter stores the
 * whole `LoyaltyConfig` as one row. A partial patch is merged over the stored
 * config and then sanitized (`sanitizeLoyaltyConfig`), so a half-filled form
 * can never produce an unusable program.
 */
export type LoyaltyConfigPatch = Partial<LoyaltyConfig>;

/* ------------------------------------------------------- menu (phase 5) --- */

/** Product row as the manager sees it — includes hidden items. */
export interface AdminProduct extends Product {
  /** Hidden from the public menu when false; never hard-deleted. */
  active: boolean;
}

export interface ProductPatch {
  categorySlug?: string;
  name?: I18nText;
  description?: I18nText | null;
  price?: number | null;
  priceFrom?: number | null;
  locations?: string[] | null;
  alcohol?: boolean;
  seasonal?: boolean;
  active?: boolean;
  /** Path from the image store (lib/storage); null removes the photo. */
  photo?: string | null;
}

export interface NewProductInput {
  categorySlug: string;
  name: I18nText;
  description?: I18nText | null;
  price?: number | null;
  priceFrom?: number | null;
  locations?: string[] | null;
  alcohol?: boolean;
  photo?: string | null;
}

/** Categories are seed data; only their banner photo is editable. */
export interface CategoryPatch {
  photo?: string | null;
}

/** Fields the manager may edit; everything else stays verified seed data. */
export interface LocationPatch {
  hours?: I18nText | null;
  woltUrl?: string | null;
  servesAlcohol?: boolean | null;
  /** Manual fallback until the Places API cron exists. */
  googleRating?: number | null;
  googleReviewCount?: number | null;
  googlePlaceId?: string | null;
  reviewUrl?: string | null;
  /** Flipping this to false is how a new cafenea goes live publicly. */
  comingSoon?: boolean;
  /** Card photo — home list + atmosphere band. null removes it. */
  photo?: string | null;
  /** Full-bleed photo behind the name on the location page. null removes it. */
  heroPhoto?: string | null;
}

/**
 * A new cafenea, created by the manager (e.g. the Aurel Lazăr piadinărie).
 * Starts as `comingSoon` unless said otherwise; products with
 * `locations: null` are available there automatically, per-list products
 * must be ticked by hand afterwards in the menu editor.
 */
export interface NewLocationInput {
  /** Public display name — the slug is derived from it. */
  name: string;
  addressRo?: string | null;
  hoursRo?: string | null;
  hoursHu?: string | null;
  comingSoon?: boolean;
}

export type CreateLocationResult =
  | {
      status: "created";
      location: Location;
      /**
       * One-time output, shown to the manager exactly once: the personal
       * barista codes generated for the new cafenea. Not retrievable later
       * from the UI (Supabase Auth replaces this whole mechanism).
       */
      staffPins: { name: string; pin: string }[];
    }
  | { status: "name_exists" }
  | { status: "invalid_name" };

/* ---------------------------------------------------- echipa (phase 5+) --- */

export interface NewStaffInput {
  name: string;
  locationSlug: string;
  role: StaffRole;
}

export type CreateStaffResult =
  | {
      status: "created";
      staff: StaffUser;
      /**
       * One-time output, like `createLocation`'s staffPins: the generated
       * 4-digit code is shown to the manager exactly once and never stored
       * readable (the adapter keeps only a peppered hash).
       */
      pin: string;
    }
  | { status: "invalid_name" }
  | { status: "unknown_location" };

export type RenameStaffResult =
  | { status: "renamed"; staff: StaffUser }
  | { status: "invalid_name" }
  | { status: "not_found" };

export type SetStaffPinResult =
  | { status: "set"; staff: StaffUser; pin: string }
  /** A typed code that is not exactly four digits. */
  | { status: "invalid_pin" }
  /** Collides with another code at the same cafenea or a shared env code. */
  | { status: "pin_taken" }
  /**
   * The café's shared account. Its code lives in the environment
   * (ADMIN_DEV_PIN / ADMIN_MANAGER_PIN), not in the store, so handing the
   * manager a new one here would be a lie: the old env code would keep
   * working. Turning the shared account off is `setStaffActive`.
   */
  | { status: "shared_account" }
  | { status: "not_found" };

export type SetStaffActiveResult =
  | { status: "saved"; staff: StaffUser }
  | { status: "not_found" };

/* ------------------------------------------------------- push (phase 5) --- */

export type PushSegment = "all" | "students" | "families" | "gold" | "ro" | "hu";

export interface PushCampaign {
  id: number;
  messageRo: string;
  messageHu: string | null;
  segment: PushSegment;
  sentAt: string | null;
  /** Stays 0 until wallet passes exist (phase 3). */
  passesUpdated: number | null;
  createdBy: string | null;
  createdAt: string;
}

export interface NewPushCampaignInput {
  messageRo: string;
  messageHu: string | null;
  segment: PushSegment;
  staffId: string | null;
  now?: Date;
}

/* -------------------------------------------------------- audit (jurnal) --- */

/**
 * Who did what in the admin. The manager code is shared between people, so
 * when the program changes or a card is reissued, this log is the only way to
 * find out who and when. Append-only; stamps and redemptions are NOT here —
 * they already are the event history.
 *
 * Never write a PIN, a hash or a member's phone number into a row. Summaries
 * name people and cafenele, not secrets.
 */
export interface AuditEvent {
  id: number;
  /** ISO 8601 timestamp. */
  at: string;
  staffId: string | null;
  /**
   * The actor's name, copied at write time: a later rename must not rewrite
   * history — "Ana" did this, even if the row is called "Ana Pop" now.
   */
  staffName: string;
  locationSlug: string;
  /** Machine-ish verb, e.g. "program.salvat", "echipa.cod-nou". */
  action: string;
  /** What it acted on: a staff id, a member id, a location slug, "program". */
  target: string;
  /** One short Romanian sentence — what the Jurnal shows. */
  summary: string;
  /** Structured before/after, when the action has one. */
  details?: Record<string, unknown> | null;
}

export interface NewAuditInput {
  staffId: string | null;
  staffName: string;
  locationSlug: string;
  action: string;
  target: string;
  summary: string;
  details?: Record<string, unknown> | null;
  now?: Date;
}

/* ------------------------------------------- desene (concurs Crăciun 2026) --- */

/**
 * One child's drawing in the Christmas contest. A separate entity on
 * purpose: registering a drawing creates no member and no card, and the
 * phone is not unique here (one parent, several children). Rules, codes and
 * categories live in lib/drawing.ts; the whole data set is deleted after
 * 31.01.2027 with `deleteDrawingEntries`.
 */
export interface DrawingEntry {
  id: string;
  /** "R-001" / "E-001" / "P-001" — unique, sequential per location. */
  code: string;
  location: DrawingLocation;
  childFirstName: string;
  childAge: number;
  /** Derived from childAge at creation (lib/drawing.ts). */
  category: DrawingCategory;
  parentName: string;
  /** Canonical national format ("0740038569") — see lib/phone.ts. */
  phone: string;
  /** Always true on a stored row: the form refuses without it. */
  consentParticipation: boolean;
  /**
   * Reproduction on Origins cups and materials. False = the drawing
   * is exhibited only and cannot be selected for print.
   */
  consentReproduction: boolean;
  attribution: DrawingAttribution;
  consentPhoto: boolean;
  /**
   * Separate consent for publishing the drawing in the online gallery
   * (/desene). Independent of reproduction: gallery needs only this one,
   * cup printing still needs `consentReproduction`.
   */
  consentGallery: boolean;
  /** "Vreau informații despre Origins Circle" — marketing opt-in, separate. */
  circleOptIn: boolean;
  status: DrawingStatus;
  /**
   * The photo/scan staff uploaded. `imageOriginal` is a PRIVATE key in the
   * drawing file store (the untouched file, for the cup supplier);
   * `imageWeb` and `cupMockup` are public paths (<= 1600 px JPEG, cup mockup).
   */
  imageOriginal: string | null;
  imageWeb: string | null;
  imageWidth: number | null;
  imageHeight: number | null;
  cupMockup: string | null;
  /** First time it went online; votes per day are counted from here. */
  publishedAt: string | null;
  /** Set when staff take it down (moderation); null while it is live. */
  unpublishedAt: string | null;
  /**
   * The public-vote winner of its age group (one per category, manager).
   * Derived: always `winnerKind === "vote"` (a generated column in 0004).
   */
  voteWinner: boolean;
  /** What it was drawn on; null until the sheet is handed in (0004). */
  sheetKind: SheetKind | null;
  /** Physical drawing + signed form received at a café. */
  submittedAt: string | null;
  /** Staff id that recorded the submission. */
  submittedBy: string | null;
  /** How it won a cup; null = not a winner. */
  winnerKind: WinnerKind | null;
  /** Parent accepted after the private phone call. Winners only. */
  winnerAcceptedAt: string | null;
  /** Jury reserve order in its category (1 = first); null = not a reserve. */
  reserveRank: number | null;
  registeredVia: "web" | "counter";
  /** Staff id when registered at the counter. */
  registeredBy?: string;
  createdAt: string;
  updatedAt: string;
}

export interface NewDrawingEntryInput {
  location: string;
  childFirstName: string;
  childAge: number;
  parentName: string;
  /** Any user-typed form; the adapter normalizes. */
  phone: string;
  consentParticipation: boolean;
  consentReproduction: boolean;
  attribution: DrawingAttribution;
  consentPhoto: boolean;
  /** Absent = false: publishing online is never assumed. */
  consentGallery?: boolean;
  circleOptIn: boolean;
  registeredVia: "web" | "counter";
  registeredBy?: string;
  now?: Date;
}

export type CreateDrawingEntryResult =
  | { status: "created"; entry: DrawingEntry }
  | { status: "invalid_name" }
  | { status: "invalid_phone" }
  | { status: "invalid_age" }
  | { status: "unknown_location" }
  | { status: "consent_required" };

export type SetDrawingStatusResult =
  | { status: "saved"; entry: DrawingEntry; from: DrawingStatus }
  | { status: "not_found" }
  /** The ladder in lib/drawing.ts refuses the move (or the role). */
  | { status: "invalid_transition" }
  /** "selectat" on a drawing without reproduction consent. */
  | { status: "not_eligible" };

export interface DrawingImageInput {
  /** Private key of the untouched upload. */
  original: string;
  /** Public path of the web-size JPEG. */
  web: string;
  width: number;
  height: number;
  /** Public path of the cup mockup image, when one was generated. */
  cupMockup: string | null;
}

export type PublishDrawingResult =
  | { status: "published"; entry: DrawingEntry }
  | { status: "not_found" }
  /** lib/drawing.ts drawingPublishBlock said no. */
  | { status: "blocked"; reason: "no_consent" | "no_image" | "bad_status" };

export type SetVoteWinnerResult =
  | { status: "saved"; entry: DrawingEntry; replaced: DrawingEntry | null }
  | { status: "not_found" }
  /** Only a drawing that is online can win the public vote. */
  | { status: "not_live" }
  /** A cup winner must be printable: reproduction consent is missing. */
  | { status: "not_eligible" }
  /** Already a jury pick ("selectat"): the two lists do not overlap. */
  | { status: "is_jury_pick" };

/** One vote as stored: a drawing, a keyed e-mail hash, a time. No address. */
export interface DrawingVote {
  drawingId: string;
  emailHash: string;
  createdAt: string;
}

export interface NewVoteCodeInput {
  drawingId: string;
  emailHash: string;
  /** lib/vote-hash.ts hashVoteCode: bound to the drawing and the voter. */
  codeHash: string;
  expiresAt: string;
}

export type RedeemVoteCodeResult =
  | { status: "voted" }
  /** Right code, but this e-mail already voted for this drawing. */
  | { status: "already_voted" }
  | { status: "wrong_code"; attemptsLeft: number }
  | { status: "expired" }
  | { status: "too_many_attempts" }
  /** No code was requested for this drawing and e-mail. */
  | { status: "no_code" };

export type MarkDrawingSubmittedResult =
  | { status: "saved"; entry: DrawingEntry; from: DrawingStatus }
  | { status: "not_found" }
  /** Already "selectat" or "returnat": nothing to hand in any more. */
  | { status: "invalid_transition" }
  /** "alta-foaie" on a cup winner or a jury reserve. */
  | { status: "not_eligible" }
  | { status: "invalid_sheet_kind" };

export type SetDrawingWinnerResult =
  | { status: "saved"; entry: DrawingEntry; replaced: DrawingEntry | null }
  | { status: "not_found" }
  /** "vote" only: the drawing must be online. */
  | { status: "not_live" }
  /** No reproduction consent, or drawn on other paper. */
  | { status: "not_eligible" }
  /** "vote" on a drawing that is already a jury pick ("selectat"). */
  | { status: "is_jury_pick" }
  /** "jury" on the vote winner: the two lists do not overlap. */
  | { status: "is_vote_winner" };

export type SetWinnerAcceptedResult =
  | { status: "saved"; entry: DrawingEntry }
  | { status: "not_found" }
  | { status: "not_winner" };

export type SetReserveRankResult =
  | { status: "saved"; entry: DrawingEntry }
  | { status: "not_found" }
  /** Not a positive whole number. */
  | { status: "invalid_rank" }
  | { status: "not_eligible" }
  /** Already a cup winner: a reserve is somebody who may step in. */
  | { status: "is_winner" }
  /** Another drawing of the same category holds this rank. */
  | { status: "rank_taken" };

export interface NewCampaignEventInput extends CampaignEventProps {
  name: CampaignEventName;
  now?: Date;
}

export type CastVoteResult =
  | { status: "voted" }
  | { status: "already_voted" }
  | { status: "not_live" };

/* ------------------------------------------------------ stats (phase 5) --- */

export interface LocationStats {
  slug: string;
  name: string;
  stamps7d: number;
  stamps30d: number;
  redemptions30d: number;
  googleRating: number | null;
  googleReviewCount: number | null;
}

/** Activity per barista — a scanning-discipline monitor, not a ranking. */
export interface BaristaStats {
  staffId: string;
  name: string;
  locationSlug: string;
  locationName: string;
  stamps7d: number;
  stamps30d: number;
  redemptions30d: number;
}

export interface PlatformStats {
  membersTotal: number;
  /** Members who joined in the last 30 days. */
  members30d: number;
  studentsTotal: number;
  studentsVerified: number;
  /** Members whose derived Gold status is active right now (lib/gold.ts). */
  goldMembers: number;
  /**
   * Members whose accepted `consentVersion` is not the current
   * CONSENT_VERSION: they are on an older version of the regulament. When
   * the program changes materially, the rules text and its version should
   * be updated and members told.
   */
  consentOutdated: number;
  /**
   * Members past the retention window (lib/retention.ts, 24 months without
   * a stamp, a redemption or a more recent signup). Visibility only: the
   * deletion job arrives with the Supabase phase, nothing deletes from here.
   */
  retentionDue: number;
  stampsTotal: number;
  stamps7d: number;
  stamps30d: number;
  redemptionsTotal: number;
  redemptionsByReward: { rewardId: RewardId; name: string; count: number }[];
  reviewBonuses: number;
  campaignsSent: number;
  locations: LocationStats[];
  baristas: BaristaStats[];
}

export interface LoyaltyDb {
  /* program — the mechanics, editable by the manager */
  getLoyaltyConfig(): Promise<LoyaltyConfig>;
  updateLoyaltyConfig(
    patch: LoyaltyConfigPatch,
    now?: Date,
  ): Promise<LoyaltyConfig>;

  /** Scan path: the QR on the Wallet pass carries the serial. */
  findMemberByPassSerial(serial: string): Promise<Member | null>;
  /** Duplicate check at signup + barista search at the counter. */
  findMemberByPhone(phone: string): Promise<Member | null>;
  /** Signup (faza 2.5): creates the member behind the /card/{id} web card. */
  createMember(input: NewMemberInput): Promise<CreateMemberResult>;
  getMember(memberId: string): Promise<Member | null>;
  /**
   * Every member, for the config-impact check in /admin/setari: a program
   * change is retroactive, so the save has to walk real cards first.
   */
  listMembers(): Promise<Member[]>;
  getMemberStamps(memberId: string): Promise<StampEvent[]>;
  getMemberRedemptions(memberId: string): Promise<Redemption[]>;
  addStamp(input: AddStampInput): Promise<AddStampResult>;
  /** Card rewards earned on the current card, plus the Gold perk if due. */
  listAvailableRewards(member: Member, now?: Date): Promise<RewardDef[]>;
  redeemReward(input: RedeemInput): Promise<RedeemResult>;
  markStudentVerified(
    memberId: string,
    staffId: string | null,
    now?: Date,
  ): Promise<Member | null>;
  /**
   * Member tapped "Lasă o recenzie" on their card. The FIRST tap is the
   * honest signal, so a later tap never overwrites it. The bonus stamp
   * itself stays a deliberate barista grant at the counter.
   */
  markReviewIntent(memberId: string, now?: Date): Promise<Member | null>;
  /**
   * New unique pass serial; the old one stops resolving immediately. The web
   * card is keyed on the member id, so the member's link keeps working — only
   * the QR payload changes. For a leaked/screenshotted card.
   */
  reissuePassSerial(memberId: string): Promise<ReissuePassSerialResult>;
  /** Manager freeze: a blocked card earns nothing until unblocked. */
  setMemberBlocked(
    memberId: string,
    blocked: boolean,
    now?: Date,
  ): Promise<SetMemberBlockedResult>;
  /**
   * GDPR erasure (art. 17): removes the member row and every personal field
   * with it. Stamps and redemptions stay as the café's operational history,
   * but detached from any identity — see the adapter for the mechanics.
   */
  forgetMember(memberId: string): Promise<ForgetMemberResult>;
  /**
   * Clears the promotional consent while the membership itself continues.
   * Push campaigns must never target a member without `marketingConsentAt`.
   */
  withdrawMarketingConsent(
    memberId: string,
  ): Promise<WithdrawMarketingConsentResult>;
  /** Staff session lookup: cookie -> staff row. Supabase Auth replaces this. */
  getStaffForSession(session: StaffSession): Promise<StaffUser | null>;

  /**
   * Personal barista code at a location; null = unknown code or inactive
   * staff. Compares peppered hashes — the store never holds a readable code.
   */
  findStaffByPin(locationSlug: string, pin: string): Promise<StaffUser | null>;

  /* echipa — manager */

  /** Team rows, active and inactive alike; the UI tells them apart. */
  listStaff(locationSlug?: string): Promise<StaffUser[]>;
  /** New person + their generated code, returned exactly once. */
  createStaff(input: NewStaffInput): Promise<CreateStaffResult>;
  /** The name is what Statistici shows, so it has to be editable. */
  renameStaff(id: string, name: string): Promise<RenameStaffResult>;
  /**
   * No `pin` generates a new code, a given one accepts a manager-typed code.
   * Either way the old code stops working and the new one is returned once.
   */
  setStaffPin(id: string, pin?: string): Promise<SetStaffPinResult>;
  setStaffActive(id: string, active: boolean): Promise<SetStaffActiveResult>;

  /* menu — public read: active products only, in menu order */
  listLocations(): Promise<Location[]>;
  getLocationBySlug(slug: string): Promise<Location | null>;
  listCategories(): Promise<Category[]>;
  listProducts(): Promise<Product[]>;

  /* menu — manager */
  listAdminProducts(): Promise<AdminProduct[]>;
  createProduct(input: NewProductInput): Promise<AdminProduct>;
  updateProduct(id: string, patch: ProductPatch): Promise<AdminProduct | null>;
  /** Sets/clears the single seasonal hero atomically in the adapter. */
  setSeasonalProduct(
    id: string,
    seasonal: boolean,
  ): Promise<AdminProduct | null>;
  updateCategory(slug: string, patch: CategoryPatch): Promise<Category | null>;
  updateLocation(slug: string, patch: LocationPatch): Promise<Location | null>;
  /** New cafenea + its staff logins, in one step (manager only). */
  createLocation(input: NewLocationInput): Promise<CreateLocationResult>;

  /* push — composing works now; real pass updates land in phase 3 */
  createPushCampaign(input: NewPushCampaignInput): Promise<PushCampaign>;
  listPushCampaigns(): Promise<PushCampaign[]>;

  /* audit — jurnalul de modificări */
  recordAudit(input: NewAuditInput): Promise<AuditEvent>;
  /** Newest first. */
  listAudit(options?: { limit?: number }): Promise<AuditEvent[]>;

  /* stats */
  getStats(now?: Date): Promise<PlatformStats>;
}

export interface CampaignDb {
  /* desene — concursul de Crăciun 2026 (lib/drawing.ts) */

  /** Validates, derives the category and hands out the next code atomically. */
  createDrawingEntry(
    input: NewDrawingEntryInput,
  ): Promise<CreateDrawingEntryResult>;
  getDrawingEntry(id: string): Promise<DrawingEntry | null>;
  findDrawingEntryByCode(code: string): Promise<DrawingEntry | null>;
  /** Newest first; a location filter for the barista screens. */
  listDrawingEntries(options?: {
    location?: DrawingLocation;
  }): Promise<DrawingEntry[]>;
  /** Moves along the ladder in lib/drawing.ts; the role decides "selectat". */
  setDrawingStatus(
    id: string,
    status: DrawingStatus,
    role: StaffRole,
    now?: Date,
  ): Promise<SetDrawingStatusResult>;
  /**
   * End of campaign (after 31.01.2027): every entry goes, parents and
   * children with it. Audit rows that pointed at an entry are redacted the
   * way `forgetMember` does it — the trail stays, the person does not.
   */
  deleteDrawingEntries(): Promise<{ deleted: number }>;

  /* desene — galeria online și votul public (lib/drawing-vote.ts) */

  /** Attaches (or replaces) the uploaded photo. Does not publish. */
  setDrawingImage(
    id: string,
    image: DrawingImageInput,
    now?: Date,
  ): Promise<DrawingEntry | null>;
  /**
   * Puts the drawing online. Refused without gallery consent, without a
   * photo, or outside "depus"/"expus". `publishedAt` is written the first
   * time only: taking a drawing down and putting it back does not restart
   * its days online.
   */
  publishDrawing(id: string, now?: Date): Promise<PublishDrawingResult>;
  /** Takes it down (moderation). Votes stay. */
  unpublishDrawing(id: string, now?: Date): Promise<DrawingEntry | null>;
  /** Live entries only, for the public gallery. */
  listPublishedDrawings(): Promise<DrawingEntry[]>;
  /**
   * Marks (or unmarks) the public-vote winner of the entry's age group.
   * One per category: marking a second one replaces the first.
   */
  setDrawingVoteWinner(
    id: string,
    winner: boolean,
    now?: Date,
  ): Promise<SetVoteWinnerResult>;

  /** Stores the pending code, replacing an older one for the same pair. */
  createVoteCode(input: NewVoteCodeInput): Promise<void>;
  /**
   * Checks the code and records the vote in one step: counts the attempt,
   * refuses after `maxAttempts`, burns the code on success. One vote per
   * drawing per e-mail hash, whatever the caller does.
   */
  redeemVoteCode(input: {
    drawingId: string;
    emailHash: string;
    codeHash: string;
    maxAttempts: number;
    now?: Date;
  }): Promise<RedeemVoteCodeResult>;
  /** A vote from an already verified e-mail hash (signed voter token). */
  castVote(input: {
    drawingId: string;
    emailHash: string;
    now?: Date;
  }): Promise<CastVoteResult>;
  hasVoted(drawingId: string, emailHash: string): Promise<boolean>;
  /** Manager only: every vote, oldest first. Hashes, never addresses. */
  listDrawingVotes(): Promise<DrawingVote[]>;


  /* desene — fazele concursului (migration 0004, lib/campaign-phase.ts) */

  /**
   * The sheet and the signed form arrived at a café. From "inregistrat" it
   * moves the drawing to "depus"; from "depus"/"expus" it only corrects the
   * sheet kind. `submittedAt`/`submittedBy` are written the first time only.
   * "alta-foaie" on a cup winner or a reserve is refused (`not_eligible`).
   * The old `setDrawingStatus(id, "depus")` still works and leaves
   * `sheetKind` null.
   */
  markDrawingSubmitted(
    id: string,
    input: { sheetKind: SheetKind; staffId: string | null },
    now?: Date,
  ): Promise<MarkDrawingSubmittedResult>;
  /**
   * Marks a cup winner ("vote" | "jury") or clears it (null, whatever the
   * kind). "vote" keeps every rule of `setDrawingVoteWinner` (live, one per
   * category — the previous one is `replaced`, never a jury pick). Both need
   * a printable drawing (`campaignPrintable`). Marking clears the reserve
   * rank and any earlier acceptance. Does NOT change `status`: "selectat"
   * stays the print ladder, `winnerKind` is the result of the selection.
   */
  setDrawingWinner(
    id: string,
    kind: WinnerKind | null,
    now?: Date,
  ): Promise<SetDrawingWinnerResult>;
  /** Parent accepted after the private phone call (null = undo). Winners only. */
  setWinnerAccepted(id: string, acceptedAt: Date | null): Promise<SetWinnerAcceptedResult>;
  /**
   * Jury reserve order in the drawing's category (1 = first reserve), or
   * null to clear. Printable non-winners only; a rank is unique per category.
   */
  setReserveRank(id: string, rank: number | null, now?: Date): Promise<SetReserveRankResult>;

  /** The two manual switches (singleton). Never null: empty state by default. */
  getCampaignState(): Promise<CampaignState>;
  /** Merges the patch; `undefined` keys are left alone, `null` clears. */
  updateCampaignState(patch: Partial<CampaignState>): Promise<CampaignState>;

  /**
   * First-party measurement (lib/campaign-metrics.ts). The name must be a
   * known event (throws otherwise: a programming error); props go through
   * `sanitizeEventProps` again here, so nothing identifying is ever stored.
   */
  recordCampaignEvent(event: NewCampaignEventInput): Promise<void>;
  /** Oldest first, `from` inclusive, `to` exclusive. */
  listCampaignEvents(options?: {
    from?: Date;
    to?: Date;
    name?: CampaignEventName;
  }): Promise<CampaignEvent[]>;

  /**
   * Shared fixed-window limiter (every Vercel instance counts together in
   * Supabase; per process in memory). True = allowed and counted. The key
   * is hashed before it is stored, but callers should still prefix it
   * ("vote-send-ip:…") so different limiters never share a counter.
   */
  rateLimitHit(
    key: string,
    options: { limit: number; windowMs: number },
    now?: Date,
  ): Promise<boolean>;
}

/**
 * The whole port. `getDb()` composes it: loyalty (members, cards, menu,
 * staff, audit, stats) from the memory adapter, exactly as before; every
 * `CampaignDb` method from the campaign store chosen by env (compose.ts).
 */
export interface Db extends LoyaltyDb, CampaignDb {}

let db: Db | null = null;

/**
 * The one place the adapter is chosen (see compose.ts `campaignBackend`):
 *   SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY  -> campaign in Supabase
 *   neither, NODE_ENV !== "production"        -> campaign in memory
 *   anything else                             -> campaign methods throw
 * Loyalty is always the memory adapter.
 */
export function getDb(): Db {
  db ??= createDb(process.env);
  return db;
}
