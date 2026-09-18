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
import { createMemoryDb } from "./memory.ts";
import { createSupabaseDb } from "./supabase.ts";

/**
 * Ports and adapters. Everything above this file talks to the `Db` interface,
 * never to a driver. Supabase is not provisioned yet, so `getDb()` returns the
 * in-memory adapter; when the project exists, add `supabase.ts` implementing
 * the same interface and switch the single line in `getDb()`.
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
  pin?: string;
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

export interface Db {
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

let db: Db | null = null;

/** The one place the adapter is chosen. */
export function getDb(): Db {
  if (
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
    !process.env.NEXT_PUBLIC_SUPABASE_URL.includes("YOUR_PROJECT_ID")
  ) {
    db ??= createSupabaseDb();
  } else {
    db ??= createMemoryDb();
  }
  return db;
}
