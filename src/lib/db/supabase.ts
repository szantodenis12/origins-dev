import type {
  AdminProduct,
  AuditEvent,
  BaristaStats,
  CategoryPatch,
  CreateLocationResult,
  CreateMemberResult,
  CreateStaffResult,
  GrantStaffLocationResult,
  Db,
  ForgetMemberResult,
  LocationPatch,
  LocationStats,
  LoyaltyConfigPatch,
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
  RevokeStaffLocationResult,
  SetMemberBlockedResult,
  SetStaffActiveResult,
  SetStaffPinResult,
  StaffSession,
  StaffUser,
  WithdrawMarketingConsentResult,
} from "./index.ts";
import type { Category, Location, Product } from "../types.ts";
import {
  DEFAULT_LOYALTY_CONFIG,
  sanitizeLoyaltyConfig,
  stampWindow,
  canRedeem,
  type LoyaltyConfig,
  type Redemption,
  type RewardDef,
  type StampEvent,
  type StampKind,
  type RewardId,
} from "../loyalty.ts";
import { goldStatus } from "../gold.ts";
import { normalizePhone } from "../phone.ts";
import {
  generateStaffPin,
  hashStaffPin,
  reservedPins,
  verifyStaffPin,
} from "../admin/staff-pin.ts";
import { fetchAllRows, supabaseClient } from "./supabase-client.ts";

/** The two event tables as Postgres returns them, snake_case and all. */
interface StampRow {
  id: number;
  member_id: string;
  location_slug: string;
  staff_id: string | null;
  kind: string;
  created_at: string;
}

interface RedemptionRow {
  id: number;
  member_id: string;
  reward_id: RewardId;
  location_slug: string;
  staff_id: string | null;
  created_at: string;
}
import { notifyWalletsForMember } from "../wallet/notify.ts";

function isValidUuid(id: string | null | undefined): boolean {
  if (!id) return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
}

/** No 0/O/1/I — serial gets read out loud and typed at the counter. */
const SERIAL_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";

function randomSerialBlock(length: number): string {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => SERIAL_ALPHABET[b % SERIAL_ALPHABET.length]).join("");
}

function generatePassSerial(): string {
  return `ORIG-${randomSerialBlock(4)}-${randomSerialBlock(4)}`;
}

export function createSupabaseDb(): Db {
  const client = supabaseClient;

  if (!client) {
    throw new Error(
      "Supabase client is not initialized. Please set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local",
    );
  }

  return {
    /* ---------------------------------------------------- program --- */
    async getLoyaltyConfig(): Promise<LoyaltyConfig> {
      const { data, error } = await client
        .from("loyalty_config")
        .select("config")
        .eq("id", true)
        .single();

      if (error || !data) {
        return DEFAULT_LOYALTY_CONFIG;
      }
      return sanitizeLoyaltyConfig(data.config);
    },

    async updateLoyaltyConfig(
      patch: LoyaltyConfigPatch,
      now: Date = new Date(),
    ): Promise<LoyaltyConfig> {
      const current = await this.getLoyaltyConfig();
      const updated = sanitizeLoyaltyConfig({
        ...current,
        ...patch,
        updatedAt: now.toISOString(),
      });

      const { error } = await client
        .from("loyalty_config")
        .upsert({ id: true, config: updated, updated_at: now.toISOString() });

      if (error) {
        throw new Error(`Failed to update loyalty config: ${error.message}`);
      }
      return updated;
    },

    /* ----------------------------------------------------- members --- */
    async findMemberByPassSerial(serial: string): Promise<Member | null> {
      const { data, error } = await client
        .from("members")
        .select("*")
        .eq("pass_serial", serial)
        .single();

      if (error || !data) return null;
      return mapDbMember(data);
    },

    async findMemberByPhone(phone: string): Promise<Member | null> {
      const normalized = normalizePhone(phone);
      if (!normalized) return null;

      const { data, error } = await client
        .from("members")
        .select("*")
        .eq("phone", normalized)
        .single();

      if (error || !data) return null;
      return mapDbMember(data);
    },

    async createMember(input: NewMemberInput): Promise<CreateMemberResult> {
      const normalizedPhone = normalizePhone(input.phone);
      if (!normalizedPhone) return { status: "invalid_phone" };

      const existing = await this.findMemberByPhone(normalizedPhone);
      if (existing) return { status: "phone_exists" };

      const now = input.now ?? new Date();
      const passSerial = generatePassSerial();

      const newMember = {
        name: input.name.trim(),
        phone: normalizedPhone,
        birth_day: input.birthDay,
        birth_month: input.birthMonth,
        birth_year: input.birthYear,
        lang: input.lang,
        is_student: input.isStudent,
        pass_serial: passSerial,
        consent_at: now.toISOString(),
        consent_version: input.consentVersion,
        marketing_consent_at: input.marketingConsent ? now.toISOString() : null,
        marketing_consent_version: input.marketingConsent
          ? input.consentVersion
          : null,
        created_at: now.toISOString(),
      };

      const { data, error } = await client
        .from("members")
        .insert(newMember)
        .select()
        .single();

      if (error || !data) {
        throw new Error(`Failed to create member: ${error?.message}`);
      }

      return { status: "created", member: mapDbMember(data) };
    },

    async getMember(memberId: string): Promise<Member | null> {
      const { data, error } = await client
        .from("members")
        .select("*")
        .eq("id", memberId)
        .single();

      if (error || !data) return null;
      return mapDbMember(data);
    },

    async listMembers(): Promise<Member[]> {
      // Callers count on having everyone: the stats, the push segments and
      // the nightly wallet job all iterate this. Paged oldest-first so a
      // signup during the walk cannot shift the pages under us, then
      // reversed to keep the newest-first order callers expect.
      const { rows, error } = await fetchAllRows<Record<string, never>>((from, to) =>
        client
          .from("members")
          .select("*")
          .order("created_at", { ascending: true })
          .range(from, to),
      );

      if (error) {
        console.error(`[db] listMembers read failed: ${error}`);
        return [];
      }
      return rows.reverse().map(mapDbMember);
    },

    async getMemberStamps(memberId: string): Promise<StampEvent[]> {
      const { data, error } = await client
        .from("stamp_events")
        .select("*")
        .eq("member_id", memberId)
        .order("created_at", { ascending: true });

      if (error || !data) return [];
      return data.map((s) => ({
        id: s.id,
        memberId: s.member_id,
        locationSlug: s.location_slug,
        staffId: s.staff_id,
        kind: s.kind as StampKind,
        createdAt: s.created_at,
      }));
    },

    async getMemberRedemptions(memberId: string): Promise<Redemption[]> {
      const { data, error } = await client
        .from("redemptions")
        .select("*")
        .eq("member_id", memberId)
        .order("created_at", { ascending: true });

      if (error || !data) return [];
      return data.map((r) => ({
        id: r.id,
        memberId: r.member_id,
        rewardId: r.reward_id,
        locationSlug: r.location_slug,
        staffId: r.staff_id,
        createdAt: r.created_at,
        perkPeriodStart: r.perk_period_start,
        perkPeriodEnd: r.perk_period_end,
      }));
    },

    async addStamp(input): Promise<any> {
      const member = await this.getMember(input.memberId);
      if (!member) return { status: "not_found" };
      if (member.blockedAt) return { status: "blocked" };

      const now = input.now ?? new Date();
      const config = await this.getLoyaltyConfig();
      const stamps = await this.getMemberStamps(input.memberId);

      const kind =
        input.kind === "auto" || !input.kind
          ? stampWindow(stamps, input.locationSlug, now, config.stampWindowHours).blocked
            ? null
            : "normal"
          : input.kind;

      if (!kind) {
        const win = stampWindow(stamps, input.locationSlug, now, config.stampWindowHours);
        return {
          status: "already_stamped",
          lastStampAt: win.lastStampAt!,
          nextAllowedAt: win.nextAllowedAt!,
        };
      }

      if (kind === "review_bonus" && member.reviewBonusGiven) {
        return { status: "bonus_used" };
      }

      const validStaffId = isValidUuid(input.staffId) ? input.staffId : null;

      const { data, error } = await client
        .from("stamp_events")
        .insert({
          member_id: input.memberId,
          location_slug: input.locationSlug,
          staff_id: validStaffId,
          kind,
          created_at: now.toISOString(),
        })
        .select()
        .single();

      if (error || !data) throw new Error(`Add stamp failed: ${error?.message}`);

      if (kind === "review_bonus") {
        await client
          .from("members")
          .update({ review_bonus_given: true })
          .eq("id", input.memberId);
      }

      await notifyWalletsForMember(member);

      return {
        status: "added",
        event: {
          id: data.id,
          memberId: data.member_id,
          locationSlug: data.location_slug,
          staffId: data.staff_id,
          kind: data.kind,
          createdAt: data.created_at,
        },
      };
    },

    async listAvailableRewards(member: Member, now: Date = new Date()): Promise<RewardDef[]> {
      const config = await this.getLoyaltyConfig();
      const stamps = await this.getMemberStamps(member.id);
      const redemptions = await this.getMemberRedemptions(member.id);
      return [];
    },

    async redeemReward(input: RedeemInput): Promise<RedeemResult> {
      const member = await this.getMember(input.memberId);
      if (!member) return { status: "not_found" };
      if (member.blockedAt) return { status: "blocked" };

      const now = input.now ?? new Date();

      const validStaffId = isValidUuid(input.staffId) ? input.staffId : null;

      const { data, error } = await client
        .from("redemptions")
        .insert({
          member_id: input.memberId,
          reward_id: input.rewardId,
          location_slug: input.locationSlug,
          staff_id: validStaffId,
          created_at: now.toISOString(),
        })
        .select()
        .single();

      if (error || !data) throw new Error(`Redeem failed: ${error?.message}`);

      await notifyWalletsForMember(member);

      return {
        status: "redeemed",
        redemption: {
          id: data.id,
          memberId: data.member_id,
          rewardId: data.reward_id,
          locationSlug: data.location_slug,
          staffId: data.staff_id,
          createdAt: data.created_at,
        },
      };
    },

    async markStudentVerified(memberId: string, staffId: string | null, now: Date = new Date()) {
      const { data, error } = await client
        .from("members")
        .update({ student_verified_at: now.toISOString() })
        .eq("id", memberId)
        .select()
        .single();

      if (error || !data) return null;
      return mapDbMember(data);
    },

    async markReviewIntent(memberId: string, now: Date = new Date()) {
      const member = await this.getMember(memberId);
      if (!member) return null;
      if (member.reviewIntentAt) return member;

      const { data, error } = await client
        .from("members")
        .update({ review_intent_at: now.toISOString() })
        .eq("id", memberId)
        .select()
        .single();

      if (error || !data) return null;
      return mapDbMember(data);
    },

    async reissuePassSerial(memberId: string): Promise<ReissuePassSerialResult> {
      const serial = generatePassSerial();
      const { data, error } = await client
        .from("members")
        .update({ pass_serial: serial })
        .eq("id", memberId)
        .select()
        .single();

      if (error || !data) return { status: "not_found" };

      // Google keys the pass on the member, so this rewrites the barcode in
      // place. Apple keys it on the serial: the old pass is a different pass,
      // its web-service lookups now 404, and iOS retires it — that member has
      // to add the card again, which is inherent to reissuing.
      await notifyWalletsForMember(mapDbMember(data));

      return { status: "reissued", serial };
    },

    async setMemberBlocked(memberId: string, blocked: boolean, now: Date = new Date()): Promise<SetMemberBlockedResult> {
      const { data, error } = await client
        .from("members")
        .update({ blocked_at: blocked ? now.toISOString() : null })
        .eq("id", memberId)
        .select()
        .single();

      if (error || !data) return { status: "not_found" };

      // A blocked card has to stop looking valid in the wallet too, and an
      // unblocked one has to come back.
      const member = mapDbMember(data);
      await notifyWalletsForMember(member);

      return { status: "saved", member };
    },

    async forgetMember(memberId: string): Promise<ForgetMemberResult> {
      const { error } = await client.from("members").delete().eq("id", memberId);
      if (error) return { status: "not_found" };
      return { status: "forgotten" };
    },

    async withdrawMarketingConsent(memberId: string): Promise<WithdrawMarketingConsentResult> {
      const { data, error } = await client
        .from("members")
        .update({ marketing_consent_at: null, marketing_consent_version: null })
        .eq("id", memberId)
        .select()
        .single();

      if (error || !data) return { status: "not_found" };
      return { status: "saved", member: mapDbMember(data) };
    },

    /* -------------------------------------------------------- staff --- */
    async getStaffForSession(session: StaffSession): Promise<StaffUser | null> {
      if (session.staffId) {
        const { data } = await client
          .from("staff_users")
          .select("*")
          .eq("id", session.staffId)
          .eq("active", true)
          .single();
        if (data) {
          const slugs = await locationsForStaff(client, session.staffId);
          // Their home cafenea is not the test — holding a code at the
          // cafenea the shift is running at is. Revoking it ends the shift on
          // the next request, which is the point of revoking.
          if (!slugs.includes(session.locationSlug)) return null;
          return mapDbStaff(data, slugs);
        }
      }
      const { data } = await client
        .from("staff_users")
        .select("*")
        .eq("location_slug", session.locationSlug)
        .eq("role", session.role)
        .eq("shared", true)
        .eq("active", true)
        .single();

      if (data) return mapDbStaff(data);

      return {
        id: `shared-${session.locationSlug}-${session.role}`,
        name: `Cont comun ${session.role}`,
        role: session.role,
        locationSlug: session.locationSlug,
        locationSlugs: [session.locationSlug],
        active: true,
        shared: true,
      };
    },

    async findStaffByPin(locationSlug: string, pin: string): Promise<StaffUser | null> {
      const devPin = process.env.ADMIN_DEV_PIN ?? "0000";
      const managerPin = process.env.ADMIN_MANAGER_PIN ?? "1111";

      if (pin === devPin) {
        return {
          id: `shared-${locationSlug}-barista`,
          name: "Cont comun barista",
          role: "barista",
          locationSlug,
          locationSlugs: [locationSlug],
          active: true,
          shared: true,
        };
      }

      if (pin === managerPin) {
        return {
          id: `shared-${locationSlug}-manager`,
          name: "Cont comun manager",
          role: "manager",
          locationSlug,
          locationSlugs: [locationSlug],
          active: true,
          shared: true,
        };
      }

      // The codes live in staff_pins, one row per (person, cafenea), so this
      // reads whoever can start a shift HERE — not whoever is filed here.
      const { data: pins, error } = await client
        .from("staff_pins")
        .select("staff_id, pin_hash")
        .eq("location_slug", locationSlug);

      if (error) {
        // Never degrade into "wrong code" on an infrastructure failure: a
        // barista retyping a correct code all evening is the worst possible
        // way to learn the database is unreachable.
        console.error("[supabase] findStaffByPin read error:", error);
        return null;
      }
      if (!pins?.length) return null;

      const match = pins.find((row: { pin_hash: string }) =>
        verifyStaffPin(pin, row.pin_hash),
      );
      if (!match) return null;

      const { data: staff } = await client
        .from("staff_users")
        .select("*")
        .eq("id", match.staff_id)
        .eq("active", true)
        .single();

      // A right code on a deactivated row is still a refused login.
      if (!staff) return null;
      return mapDbStaff(staff, await locationsForStaff(client, staff.id));
    },

    async listStaff(locationSlug?: string): Promise<StaffUser[]> {
      const { data, error } = await client
        .from("staff_users")
        .select("*")
        .order("name", { ascending: true });
      if (error || !data) return [];

      const access = await staffLocationIndex(client);
      // Shared accounts hold no code of their own — theirs lives in the
      // environment — so they keep the home cafenea rather than reading as
      // locked out. For everyone else an empty list is the truth.
      const staff = data.map((row: any) =>
        mapDbStaff(row, row.shared ? undefined : (access.get(row.id) ?? [])),
      );

      // Filtering on access, not on the home cafenea: the team screen for a
      // cafenea has to show everyone who can work there, including the people
      // covering shifts from elsewhere.
      return locationSlug
        ? staff.filter((person) => person.locationSlugs.includes(locationSlug))
        : staff;
    },

    async createStaff(input: NewStaffInput): Promise<CreateStaffResult> {
      const name = input.name.trim();
      if (!name || name.length > 60) return { status: "invalid_name" };

      const { data: location } = await client
        .from("locations")
        .select("slug")
        .eq("slug", input.locationSlug)
        .single();
      if (!location) return { status: "unknown_location" };

      const pin = await resolveNewPin(client, input.locationSlug, input.pin);
      if (pin === "invalid") return { status: "invalid_pin" };
      if (pin === "taken" || pin === "exhausted") return { status: "pin_taken" };

      const newId = crypto.randomUUID();
      const { data, error } = await client
        .from("staff_users")
        .insert({
          id: newId,
          name,
          location_slug: input.locationSlug,
          role: input.role,
          active: true,
          shared: false,
        })
        .select()
        .single();

      if (error || !data) {
        console.error("[supabase] createStaff insert error:", error);
        return { status: "invalid_name" };
      }

      const { error: pinError } = await client.from("staff_pins").insert({
        staff_id: newId,
        location_slug: input.locationSlug,
        pin_hash: hashStaffPin(pin),
      });

      if (pinError) {
        // A person with no code cannot log in anywhere and nothing in the UI
        // would say why, so undo the half-made account rather than leave one.
        console.error("[supabase] createStaff pin insert error:", pinError);
        await client.from("staff_users").delete().eq("id", newId);
        return { status: "invalid_name" };
      }

      return {
        status: "created",
        staff: mapDbStaff(data, [input.locationSlug]),
        pin,
      };
    },

    async renameStaff(id: string, name: string): Promise<RenameStaffResult> {
      const { data, error } = await client
        .from("staff_users")
        .update({ name: name.trim() })
        .eq("id", id)
        .select()
        .single();

      if (error || !data) return { status: "not_found" };
      return {
        status: "renamed",
        staff: mapDbStaff(data, await locationsForStaff(client, id)),
      };
    },

    async setStaffPin(
      id: string,
      locationSlug: string,
      pin?: string,
    ): Promise<SetStaffPinResult> {
      const staff = await staffRow(client, id);
      if (!staff) return { status: "not_found" };
      // The shared account answers to the env code, which this store does not
      // own. Issuing a "new" one here would leave the old env code working.
      if (staff.shared) return { status: "shared_account" };

      const slugs = await locationsForStaff(client, id);
      if (!slugs.includes(locationSlug)) return { status: "no_access" };

      const next = await resolveNewPin(client, locationSlug, pin, id);
      if (next === "invalid") return { status: "invalid_pin" };
      if (next === "taken" || next === "exhausted") return { status: "pin_taken" };

      const { error } = await client
        .from("staff_pins")
        .update({ pin_hash: hashStaffPin(next) })
        .eq("staff_id", id)
        .eq("location_slug", locationSlug);

      if (error) {
        console.error("[supabase] setStaffPin error:", error);
        return { status: "not_found" };
      }
      return {
        status: "set",
        staff: mapDbStaff(staff, slugs),
        locationSlug,
        pin: next,
      };
    },

    async setStaffActive(id: string, active: boolean): Promise<SetStaffActiveResult> {
      const { data, error } = await client
        .from("staff_users")
        .update({ active })
        .eq("id", id)
        .select()
        .single();

      if (error || !data) return { status: "not_found" };
      return {
        status: "saved",
        staff: mapDbStaff(data, await locationsForStaff(client, id)),
      };
    },

    async grantStaffLocation(
      id: string,
      locationSlug: string,
      pin?: string,
    ): Promise<GrantStaffLocationResult> {
      const staff = await staffRow(client, id);
      if (!staff) return { status: "not_found" };
      if (staff.shared) return { status: "shared_account" };

      const { data: location } = await client
        .from("locations")
        .select("slug")
        .eq("slug", locationSlug)
        .single();
      if (!location) return { status: "unknown_location" };

      const slugs = await locationsForStaff(client, id);
      if (slugs.includes(locationSlug)) return { status: "already_granted" };

      const next = await resolveNewPin(client, locationSlug, pin, id);
      if (next === "invalid") return { status: "invalid_pin" };
      if (next === "taken" || next === "exhausted") return { status: "pin_taken" };

      const { error } = await client.from("staff_pins").insert({
        staff_id: id,
        location_slug: locationSlug,
        pin_hash: hashStaffPin(next),
      });

      if (error) {
        console.error("[supabase] grantStaffLocation error:", error);
        return { status: "not_found" };
      }
      return {
        status: "granted",
        staff: mapDbStaff(staff, [...slugs, locationSlug].sort()),
        locationSlug,
        pin: next,
      };
    },

    async revokeStaffLocation(
      id: string,
      locationSlug: string,
    ): Promise<RevokeStaffLocationResult> {
      const staff = await staffRow(client, id);
      if (!staff) return { status: "not_found" };
      if (staff.shared) return { status: "shared_account" };

      const slugs = await locationsForStaff(client, id);
      if (!slugs.includes(locationSlug)) return { status: "no_access" };

      const { error } = await client
        .from("staff_pins")
        .delete()
        .eq("staff_id", id)
        .eq("location_slug", locationSlug);

      if (error) {
        console.error("[supabase] revokeStaffLocation error:", error);
        return { status: "not_found" };
      }
      return {
        status: "revoked",
        staff: mapDbStaff(
          staff,
          slugs.filter((slug) => slug !== locationSlug),
        ),
        locationSlug,
      };
    },

    /* -------------------------------------------------------- menu --- */
    async listLocations(): Promise<Location[]> {
      const { data, error } = await client.from("locations").select("*");
      if (error || !data) return [];
      const LOCATION_SLUG_ORDER = ["era", "gara", "oraselul", "rogerius", "lazar"];
      const locations = data.map(mapDbLocation);
      return locations.sort((a, b) => {
        const ia = LOCATION_SLUG_ORDER.indexOf(a.slug);
        const ib = LOCATION_SLUG_ORDER.indexOf(b.slug);
        return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
      });
    },

    async getLocationBySlug(slug: string): Promise<Location | null> {
      const { data, error } = await client.from("locations").select("*").eq("slug", slug).single();
      if (error || !data) return null;
      return mapDbLocation(data);
    },

    async listCategories(): Promise<Category[]> {
      const { data, error } = await client.from("categories").select("*").order("sort_order", { ascending: true });
      if (error || !data) return [];
      return data.map(mapDbCategory);
    },

    async listProducts(): Promise<Product[]> {
      const { data, error } = await client
        .from("products")
        .select("*, product_availability(location_slug)")
        .eq("active", true)
        .order("sort_order", { ascending: true });

      if (error || !data) return [];
      return data.map(mapDbProduct);
    },

    async listAdminProducts(): Promise<AdminProduct[]> {
      const { data, error } = await client
        .from("products")
        .select("*, product_availability(location_slug)")
        .order("sort_order", { ascending: true });

      if (error || !data) return [];
      return data.map((p) => ({
        ...mapDbProduct(p),
        active: p.active,
      }));
    },

    async createProduct(input: NewProductInput): Promise<AdminProduct> {
      const newProduct = {
        category_slug: input.categorySlug,
        name_ro: input.name.ro,
        name_hu: input.name.hu ?? null,
        name_en: input.name.en ?? null,
        description_ro: input.description?.ro ?? null,
        description_hu: input.description?.hu ?? null,
        description_en: input.description?.en ?? null,
        price: input.price ?? null,
        price_from: input.priceFrom ?? null,
        photo_url: input.photo ?? null,
        alcohol: input.alcohol ?? false,
        active: true,
      };

      const { data, error } = await client.from("products").insert(newProduct).select().single();
      if (error || !data) throw new Error(`Create product failed: ${error?.message}`);

      if (input.locations && input.locations.length > 0) {
        const availRows = input.locations.map((loc) => ({
          product_id: data.id,
          location_slug: loc,
        }));
        await client.from("product_availability").insert(availRows);
      }

      return {
        ...mapDbProduct(data),
        active: true,
      };
    },

    async updateProduct(id: string, patch: ProductPatch): Promise<AdminProduct | null> {
      const updatePayload: Record<string, any> = {};
      if (patch.categorySlug !== undefined) updatePayload.category_slug = patch.categorySlug;
      if (patch.name !== undefined) {
        updatePayload.name_ro = patch.name.ro;
        updatePayload.name_hu = patch.name.hu ?? null;
        updatePayload.name_en = patch.name.en ?? null;
      }
      if (patch.description !== undefined) {
        updatePayload.description_ro = patch.description?.ro ?? null;
        updatePayload.description_hu = patch.description?.hu ?? null;
        updatePayload.description_en = patch.description?.en ?? null;
      }
      if (patch.price !== undefined) updatePayload.price = patch.price;
      if (patch.priceFrom !== undefined) updatePayload.price_from = patch.priceFrom;
      if (patch.photo !== undefined) updatePayload.photo_url = patch.photo;
      if (patch.alcohol !== undefined) updatePayload.alcohol = patch.alcohol;
      if (patch.seasonal !== undefined) updatePayload.seasonal = patch.seasonal;
      if (patch.active !== undefined) updatePayload.active = patch.active;

      const { data, error } = await client
        .from("products")
        .update(updatePayload)
        .eq("id", id)
        .select()
        .single();

      if (error || !data) return null;

      if (patch.locations !== undefined) {
        await client.from("product_availability").delete().eq("product_id", id);
        if (patch.locations && patch.locations.length > 0) {
          const availRows = patch.locations.map((loc) => ({
            product_id: id,
            location_slug: loc,
          }));
          await client.from("product_availability").insert(availRows);
        }
      }

      return {
        ...mapDbProduct(data),
        active: data.active,
      };
    },

    async setSeasonalProduct(id: string, seasonal: boolean): Promise<AdminProduct | null> {
      if (seasonal) {
        await client.from("products").update({ seasonal: false }).neq("id", id);
      }
      return this.updateProduct(id, { seasonal });
    },

    async updateCategory(slug: string, patch: CategoryPatch): Promise<Category | null> {
      const { data, error } = await client
        .from("categories")
        .update({ photo_url: patch.photo })
        .eq("slug", slug)
        .select()
        .single();

      if (error || !data) return null;
      return mapDbCategory(data);
    },

    async updateLocation(slug: string, patch: LocationPatch): Promise<Location | null> {
      const updatePayload: Record<string, any> = {};
      if (patch.hours !== undefined) {
        updatePayload.hours_ro = patch.hours?.ro ?? null;
        updatePayload.hours_hu = patch.hours?.hu ?? null;
        updatePayload.hours_en = patch.hours?.en ?? null;
      }
      if (patch.woltUrl !== undefined) updatePayload.wolt_url = patch.woltUrl;
      if (patch.servesAlcohol !== undefined) updatePayload.serves_alcohol = patch.servesAlcohol;
      if (patch.googleRating !== undefined) updatePayload.google_rating = patch.googleRating;
      if (patch.googleReviewCount !== undefined) updatePayload.google_review_count = patch.googleReviewCount;
      if (patch.googlePlaceId !== undefined) updatePayload.google_place_id = patch.googlePlaceId;
      if (patch.reviewUrl !== undefined) updatePayload.review_url = patch.reviewUrl;
      if (patch.comingSoon !== undefined) updatePayload.coming_soon = patch.comingSoon;
      if (patch.photo !== undefined) updatePayload.photo_url = patch.photo;
      if (patch.heroPhoto !== undefined) updatePayload.hero_photo_url = patch.heroPhoto;

      const { data, error } = await client
        .from("locations")
        .update(updatePayload)
        .eq("slug", slug)
        .select()
        .single();

      if (error || !data) return null;
      return mapDbLocation(data);
    },

    async createLocation(input: NewLocationInput): Promise<CreateLocationResult> {
      const slug = input.name.toLowerCase().replace(/[^a-z0-9]+/g, "-");

      const { data, error } = await client
        .from("locations")
        .insert({
          slug,
          name: input.name,
          address_ro: input.addressRo ?? null,
          hours_ro: input.hoursRo ?? null,
          hours_hu: input.hoursHu ?? null,
          coming_soon: input.comingSoon ?? true,
        })
        .select()
        .single();

      if (error || !data) return { status: "name_exists" };

      // A brand new cafenea holds no codes yet, so the only collisions to
      // avoid are between these two and the reserved env codes.
      const taken = new Set<string>();
      const isTaken = (pin: string) => taken.has(hashStaffPin(pin));
      const staffPins: { name: string; pin: string }[] = [];

      for (const role of ["barista", "manager"] as const) {
        const name = `${role === "barista" ? "Barista" : "Manager"} ${input.name}`;
        const pin = generateStaffPin(isTaken);
        if (!pin) continue;
        taken.add(hashStaffPin(pin));

        // staff_users.id has no database default — it mirrors auth.users.id —
        // so it is generated here. Without it the insert is rejected and the
        // cafenea is created with nobody able to log into it.
        const staffId = crypto.randomUUID();
        const { error: staffError } = await client.from("staff_users").insert({
          id: staffId,
          name,
          location_slug: slug,
          role,
          active: true,
          shared: false,
        });
        if (staffError) {
          console.error("[supabase] createLocation staff error:", staffError);
          continue;
        }

        const { error: pinError } = await client.from("staff_pins").insert({
          staff_id: staffId,
          location_slug: slug,
          pin_hash: hashStaffPin(pin),
        });
        if (pinError) {
          console.error("[supabase] createLocation pin error:", pinError);
          await client.from("staff_users").delete().eq("id", staffId);
          continue;
        }

        staffPins.push({ name, pin });
      }

      return {
        status: "created",
        location: mapDbLocation(data),
        staffPins,
      };
    },

    /* -------------------------------------------------------- push --- */
    async createPushCampaign(input: NewPushCampaignInput): Promise<PushCampaign> {
      const now = input.now ?? new Date();
      const validStaffId =
        input.staffId &&
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(input.staffId)
          ? input.staffId
          : null;

      const { data, error } = await client
        .from("push_campaigns")
        .insert({
          message_ro: input.messageRo,
          message_hu: input.messageHu ?? null,
          segment: input.segment,
          created_by: validStaffId,
          created_at: now.toISOString(),
          sent_at: now.toISOString(),
        })
        .select()
        .single();

      if (error || !data) throw new Error(`Create push campaign failed: ${error?.message}`);

      return {
        id: data.id,
        messageRo: data.message_ro,
        messageHu: data.message_hu,
        segment: data.segment,
        sentAt: data.sent_at,
        passesUpdated: data.passes_updated,
        createdBy: data.created_by,
        createdAt: data.created_at,
      };
    },

    async listPushCampaigns(): Promise<PushCampaign[]> {
      const { data, error } = await client
        .from("push_campaigns")
        .select("*")
        .order("created_at", { ascending: false });

      if (error || !data) return [];
      return data.map((p) => ({
        id: p.id,
        messageRo: p.message_ro,
        messageHu: p.message_hu,
        segment: p.segment,
        sentAt: p.sent_at,
        passesUpdated: p.passes_updated,
        createdBy: p.created_by,
        createdAt: p.created_at,
      }));
    },

    /* ------------------------------------------------------- audit --- */
    async recordAudit(input: NewAuditInput): Promise<AuditEvent> {
      const now = input.now ?? new Date();
      const { data, error } = await client
        .from("audit_log")
        .insert({
          at: now.toISOString(),
          // A shift started on the shared env code has no row of its own, so
          // getStaffForSession answers with a synthetic id ("shared-era-
          // manager"). audit_log.staff_id is a uuid foreign key, so handing
          // that over is rejected by Postgres and the whole entry is lost —
          // which is why the Jurnal stayed empty for every manager working
          // on the common code. The name is snapshotted anyway, so the row
          // still says who did it.
          staff_id: isUuid(input.staffId) ? input.staffId : null,
          staff_name: input.staffName,
          location_slug: input.locationSlug,
          action: input.action,
          target: input.target,
          summary: input.summary,
          details: input.details ?? null,
        })
        .select()
        .single();

      if (error || !data) throw new Error(`Record audit failed: ${error?.message}`);

      return {
        id: data.id,
        at: data.at,
        staffId: data.staff_id,
        staffName: data.staff_name,
        locationSlug: data.location_slug,
        action: data.action,
        target: data.target,
        summary: data.summary,
        details: data.details,
      };
    },

    async listAudit(options?: { limit?: number }): Promise<AuditEvent[]> {
      let query = client.from("audit_log").select("*").order("at", { ascending: false });
      if (options?.limit) query = query.limit(options.limit);

      const { data, error } = await query;
      if (error || !data) return [];

      return data.map((a) => ({
        id: a.id,
        at: a.at,
        staffId: a.staff_id,
        staffName: a.staff_name,
        locationSlug: a.location_slug,
        action: a.action,
        target: a.target,
        summary: a.summary,
        details: a.details,
      }));
    },

    /* ------------------------------------------------------- stats --- */
    async getStats(now: Date = new Date()): Promise<PlatformStats> {
      const members = await this.listMembers();
      // Every number on this page is counted from these two arrays, so a
      // silently short read does not show up as an error — it shows up as a
      // total that stops moving. Both tables grow forever; both must be paged.
      const stampsRes = await fetchAllRows<StampRow>((from, to) =>
        client
          .from("stamp_events")
          .select("*")
          .order("created_at", { ascending: true })
          .range(from, to),
      );
      const redemptionsRes = await fetchAllRows<RedemptionRow>((from, to) =>
        client
          .from("redemptions")
          .select("*")
          .order("created_at", { ascending: true })
          .range(from, to),
      );
      const campaigns = await this.listPushCampaigns();
      const locations = await this.listLocations();
      const baristas = await this.listStaff();
      const config = await this.getLoyaltyConfig();

      if (stampsRes.error) {
        console.error(`[stats] stamp_events read failed: ${stampsRes.error}`);
      }
      if (redemptionsRes.error) {
        console.error(`[stats] redemptions read failed: ${redemptionsRes.error}`);
      }

      const stamps: StampEvent[] = stampsRes.rows.map((s) => ({
        id: s.id,
        memberId: s.member_id,
        locationSlug: s.location_slug,
        staffId: s.staff_id,
        kind: s.kind as StampKind,
        createdAt: s.created_at,
      }));

      const redemptions: Redemption[] = redemptionsRes.rows.map((r) => ({
        id: r.id,
        memberId: r.member_id,
        rewardId: r.reward_id,
        locationSlug: r.location_slug,
        staffId: r.staff_id,
        createdAt: r.created_at,
      }));

      const DAY = 24 * 60 * 60 * 1000;
      const t7 = now.getTime() - 7 * DAY;
      const t30 = now.getTime() - 30 * DAY;
      const since = (iso: string, t: number) => new Date(iso).getTime() >= t;

      const byReward = new Map<string, number>();
      for (const r of redemptions) {
        byReward.set(r.rewardId, (byReward.get(r.rewardId) ?? 0) + 1);
      }

      /**
       * Gold is derived, never stored, so counting it means replaying each
       * member's own history through goldStatus — the same function the card
       * and the barista panel use, so the number here cannot drift from what
       * the staff see at the till.
       *
       * The events are already loaded for the totals above; grouping them by
       * member costs one pass and no extra queries. Events detached from a
       * deleted member (member_id null) belong to nobody and are skipped.
       */
      const stampsByMember = new Map<string, StampEvent[]>();
      for (const s of stamps) {
        if (!s.memberId) continue;
        const list = stampsByMember.get(s.memberId);
        if (list) list.push(s);
        else stampsByMember.set(s.memberId, [s]);
      }

      const redemptionsByMember = new Map<string, Redemption[]>();
      for (const r of redemptions) {
        if (!r.memberId) continue;
        const list = redemptionsByMember.get(r.memberId);
        if (list) list.push(r);
        else redemptionsByMember.set(r.memberId, [r]);
      }

      const goldMembers = members.filter(
        (m) =>
          goldStatus(
            stampsByMember.get(m.id) ?? [],
            redemptionsByMember.get(m.id) ?? [],
            now,
            config.gold,
          ).isGold,
      ).length;

      const locationStatsList: LocationStats[] = locations.map((loc) => {
        const locStamps = stamps.filter((s) => s.locationSlug === loc.slug);
        const locRedemptions = redemptions.filter((r) => r.locationSlug === loc.slug);

        return {
          slug: loc.slug,
          name: loc.name,
          stamps7d: locStamps.filter((s) => since(s.createdAt, t7)).length,
          stamps30d: locStamps.filter((s) => since(s.createdAt, t30)).length,
          redemptions30d: locRedemptions.filter((r) => since(r.createdAt, t30)).length,
          googleRating: loc.googleRating,
          googleReviewCount: loc.googleReviewCount,
        };
      });

      const baristaStatsList = baristas
        .filter((b) => b.role === "barista")
        .map((b) => {
          const locName = locations.find((l) => l.slug === b.locationSlug)?.name ?? b.locationSlug;
          const mine30d = stamps.filter(
            (e) => e.staffId === b.id && since(e.createdAt, t30),
          );

          // Where the scanning actually happened. Totals alone would hide a
          // covered shift inside the home cafenea's line — the whole reason
          // someone can hold codes at more than one cafenea.
          const perLocation = new Map<string, number>();
          for (const event of mine30d) {
            perLocation.set(
              event.locationSlug,
              (perLocation.get(event.locationSlug) ?? 0) + 1,
            );
          }

          return {
            staffId: b.id,
            name: b.name,
            locationSlug: b.locationSlug,
            locationName: locName,
            stamps7d: stamps.filter((e) => e.staffId === b.id && since(e.createdAt, t7)).length,
            stamps30d: mine30d.length,
            redemptions30d: redemptions.filter((r) => r.staffId === b.id && since(r.createdAt, t30)).length,
            byLocation: [...perLocation.entries()]
              .map(([slug, stamps30d]) => ({
                slug,
                name: locations.find((l) => l.slug === slug)?.name ?? slug,
                stamps30d,
              }))
              .sort((x, y) => y.stamps30d - x.stamps30d),
          };
        })
        .sort((a, b) => b.stamps30d - a.stamps30d);

      return {
        membersTotal: members.length,
        members30d: members.filter((m) => since(m.createdAt, t30)).length,
        studentsTotal: members.filter((m) => m.isStudent).length,
        studentsVerified: members.filter((m) => m.studentVerifiedAt !== null).length,
        goldMembers,
        // Still not computed here — see the memory adapter for the shape they
        // should take when someone picks them up.
        consentOutdated: 0,
        retentionDue: 0,
        stampsTotal: stamps.length,
        stamps7d: stamps.filter((s) => since(s.createdAt, t7)).length,
        stamps30d: stamps.filter((s) => since(s.createdAt, t30)).length,
        redemptionsTotal: redemptions.length,
        redemptionsByReward: [...byReward.entries()].map(([rewardId, count]) => ({
          rewardId: rewardId as any,
          name: config.names[rewardId as keyof typeof config.names]?.ro ?? rewardId,
          count,
        })),
        reviewBonuses: stamps.filter((s) => s.kind === "review_bonus").length,
        campaignsSent: campaigns.length,
        locations: locationStatsList,
        baristas: baristaStatsList,
      };
    },
  };
}

/* ----------------------------------------------------- Mappers --- */

function mapDbMember(row: any): Member {
  return {
    id: row.id,
    name: row.name,
    phone: row.phone,
    blockedAt: row.blocked_at,
    birthDay: row.birth_day,
    birthMonth: row.birth_month,
    birthYear: row.birth_year,
    lang: row.lang,
    isStudent: row.is_student,
    studentVerifiedAt: row.student_verified_at,
    passSerial: row.pass_serial,
    consentAt: row.consent_at,
    consentVersion: row.consent_version,
    marketingConsentAt: row.marketing_consent_at,
    marketingConsentVersion: row.marketing_consent_version,
    reviewIntentAt: row.review_intent_at,
    reviewBonusGiven: row.review_bonus_given,
    createdAt: row.created_at,
  };
}

/** The service-role client, after the adapter has proved it exists. */
type DbClient = NonNullable<typeof supabaseClient>;

/** Every cafenea one person holds a code for, sorted. */
async function locationsForStaff(
  client: DbClient,
  staffId: string,
): Promise<string[]> {
  const { data } = await client
    .from("staff_pins")
    .select("location_slug")
    .eq("staff_id", staffId);
  return (data ?? [])
    .map((row: { location_slug: string }) => row.location_slug)
    .sort();
}

/** The same thing for the whole team, in one read instead of N. */
async function staffLocationIndex(
  client: DbClient,
): Promise<Map<string, string[]>> {
  const index = new Map<string, string[]>();
  const { data, error } = await client
    .from("staff_pins")
    .select("staff_id, location_slug");
  if (error) {
    console.error("[supabase] staff_pins read error:", error);
    return index;
  }
  for (const row of data ?? []) {
    const slugs = index.get(row.staff_id) ?? [];
    slugs.push(row.location_slug);
    index.set(row.staff_id, slugs);
  }
  for (const slugs of index.values()) slugs.sort();
  return index;
}

/**
 * Only a real staff_users row has a uuid; the shared accounts are synthesised
 * on the fly with ids like "shared-era-manager".
 */
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isUuid(value: string | null | undefined): value is string {
  return typeof value === "string" && UUID_RE.test(value);
}

/** One raw staff_users row, or null. */
async function staffRow(client: DbClient, id: string): Promise<any | null> {
  const { data } = await client
    .from("staff_users")
    .select("*")
    .eq("id", id)
    .single();
  return data ?? null;
}

/**
 * The hashes already answering at one cafenea, except this person's own.
 *
 * The stored hash is a deterministic HMAC, so "same code" means "same hash":
 * collisions are detected without ever recovering a code.
 */
async function takenHashesAt(
  client: DbClient,
  locationSlug: string,
  ignoreStaffId?: string,
): Promise<Set<string>> {
  let query = client
    .from("staff_pins")
    .select("staff_id, pin_hash")
    .eq("location_slug", locationSlug);
  if (ignoreStaffId) query = query.neq("staff_id", ignoreStaffId);
  const { data } = await query;
  return new Set(
    (data ?? []).map((row: { pin_hash: string }) => row.pin_hash),
  );
}

/** What a code request can come back as, besides the code itself. */
type PinOutcome = string | "invalid" | "taken" | "exhausted";

/**
 * Settles on the code to store at one cafenea: the manager's, if it is four
 * digits and free, otherwise a generated one that is.
 *
 * Nothing else may issue a code. Two people at one cafenea sharing a code
 * means login returns whichever row it reads first — stamps credited to the
 * wrong person, silently, with no error anywhere to notice.
 */
async function resolveNewPin(
  client: DbClient,
  locationSlug: string,
  pin: string | undefined,
  ignoreStaffId?: string,
): Promise<PinOutcome> {
  const taken = await takenHashesAt(client, locationSlug, ignoreStaffId);
  const isTaken = (candidate: string) => taken.has(hashStaffPin(candidate));

  if (pin === undefined) {
    return generateStaffPin(isTaken) ?? "exhausted";
  }
  if (!/^\d{4}$/.test(pin)) return "invalid";
  if (reservedPins().has(pin) || isTaken(pin)) return "taken";
  return pin;
}

/**
 * `locationSlugs` lives in staff_pins, a second table, so callers that read
 * it pass it in. The fallback is the home cafenea rather than an empty list:
 * a caller that never looked at staff_pins should read like the old
 * single-cafenea world, not like somebody locked out everywhere.
 */
function mapDbStaff(row: any, locationSlugs?: string[]): StaffUser {
  return {
    id: row.id,
    name: row.name,
    role: row.role,
    locationSlug: row.location_slug,
    locationSlugs:
      locationSlugs ?? (row.location_slug ? [row.location_slug] : []),
    active: row.active,
    shared: row.shared,
  };
}

function mapDbLocation(row: any): Location {
  const name = row.slug === "gara" && row.name === "Gara Mare" ? "Palatul Copiilor" : row.name;
  return {
    slug: row.slug,
    name,
    address: {
      ro: row.address_ro,
      hu: row.address_hu,
      en: row.address_en,
    },
    hours: row.hours_ro
      ? {
          ro: row.hours_ro,
          hu: row.hours_hu,
          en: row.hours_en,
        }
      : null,
    comingSoon: row.coming_soon,
    seasonalNote: row.seasonal_note_ro
      ? {
          ro: row.seasonal_note_ro,
          hu: row.seasonal_note_hu,
          en: row.seasonal_note_en,
        }
      : null,
    googlePlaceId: row.google_place_id,
    googleRating: row.google_rating,
    googleReviewCount: row.google_review_count,
    reviewUrl: row.review_url,
    woltUrl: row.wolt_url,
    servesAlcohol: row.serves_alcohol,
    photo: row.photo_url,
    heroPhoto: row.hero_photo_url,
  };
}

function mapDbCategory(row: any): Category {
  return {
    slug: row.slug,
    name: {
      ro: row.name_ro,
      hu: row.name_hu,
      en: row.name_en,
    },
    order: row.sort_order,
    photo: row.photo_url,
  };
}

function mapDbProduct(row: any): Product {
  const locations = row.product_availability
    ? row.product_availability.map((pa: any) => pa.location_slug)
    : null;

  return {
    id: row.id,
    categorySlug: row.category_slug,
    name: {
      ro: row.name_ro,
      hu: row.name_hu,
      en: row.name_en,
    },
    description: row.description_ro
      ? {
          ro: row.description_ro,
          hu: row.description_hu,
          en: row.description_en,
        }
      : null,
    price: row.price,
    priceFrom: row.price_from,
    locations: locations && locations.length > 0 ? locations : null,
    alcohol: row.alcohol,
    seasonal: row.seasonal,
    photo: row.photo_url,
  };
}
