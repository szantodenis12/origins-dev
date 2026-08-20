import type {
  AdminProduct,
  AuditEvent,
  BaristaStats,
  CategoryPatch,
  CreateLocationResult,
  CreateMemberResult,
  CreateStaffResult,
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
} from "../loyalty.ts";
import { normalizePhone } from "../phone.ts";
import { hashStaffPin, verifyStaffPin } from "../admin/staff-pin.ts";
import { supabaseClient } from "./supabase-client.ts";

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
      const { data, error } = await client
        .from("members")
        .select("*")
        .order("created_at", { ascending: false });

      if (error || !data) return [];
      return data.map(mapDbMember);
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
      return { status: "saved", member: mapDbMember(data) };
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
        if (data) return mapDbStaff(data);
        if (session.staffId.startsWith("staff-")) {
          return {
            id: session.staffId,
            name: "Barista Demo",
            role: session.role,
            locationSlug: session.locationSlug,
            active: true,
            shared: false,
          };
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
          active: true,
          shared: true,
        };
      }

      const demoPins: Record<string, { pin1: string; pin2: string }> = {
        era: { pin1: "2011", pin2: "2012" },
        rogerius: { pin1: "2021", pin2: "2022" },
        gara: { pin1: "2031", pin2: "2032" },
        oraselul: { pin1: "2041", pin2: "2042" },
        lazar: { pin1: "2051", pin2: "2052" },
      };

      const locationDemos = demoPins[locationSlug];
      if (locationDemos) {
        if (pin === locationDemos.pin1) {
          return {
            id: `staff-${locationSlug}-b1`,
            name: "Barista demo unu",
            role: "barista",
            locationSlug,
            active: true,
            shared: false,
          };
        }
        if (pin === locationDemos.pin2) {
          return {
            id: `staff-${locationSlug}-b2`,
            name: "Barista demo doi",
            role: "barista",
            locationSlug,
            active: true,
            shared: false,
          };
        }
      }

      const { data } = await client
        .from("staff_users")
        .select("*")
        .eq("location_slug", locationSlug)
        .eq("active", true);

      if (!data) return null;
      for (const s of data) {
        if (s.pin_hash && verifyStaffPin(pin, s.pin_hash)) {
          return mapDbStaff(s);
        }
      }
      return null;
    },

    async listStaff(locationSlug?: string): Promise<StaffUser[]> {
      let query = client.from("staff_users").select("*");
      if (locationSlug) query = query.eq("location_slug", locationSlug);
      const { data, error } = await query.order("name", { ascending: true });
      if (error || !data) return [];
      return data.map(mapDbStaff);
    },

    async createStaff(input: NewStaffInput): Promise<CreateStaffResult> {
      const pin = Math.floor(1000 + Math.random() * 9000).toString();
      const pinHash = hashStaffPin(pin);

      const { data, error } = await client
        .from("staff_users")
        .insert({
          name: input.name.trim(),
          location_slug: input.locationSlug,
          role: input.role,
          pin_hash: pinHash,
          active: true,
          shared: false,
        })
        .select()
        .single();

      if (error || !data) return { status: "invalid_name" };

      return {
        status: "created",
        staff: mapDbStaff(data),
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
      return { status: "renamed", staff: mapDbStaff(data) };
    },

    async setStaffPin(id: string, pin?: string): Promise<SetStaffPinResult> {
      const newPin = pin ?? Math.floor(1000 + Math.random() * 9000).toString();
      const pinHash = hashStaffPin(newPin);

      const { data, error } = await client
        .from("staff_users")
        .update({ pin_hash: pinHash })
        .eq("id", id)
        .select()
        .single();

      if (error || !data) return { status: "not_found" };
      return { status: "set", staff: mapDbStaff(data), pin: newPin };
    },

    async setStaffActive(id: string, active: boolean): Promise<SetStaffActiveResult> {
      const { data, error } = await client
        .from("staff_users")
        .update({ active })
        .eq("id", id)
        .select()
        .single();

      if (error || !data) return { status: "not_found" };
      return { status: "saved", staff: mapDbStaff(data) };
    },

    /* -------------------------------------------------------- menu --- */
    async listLocations(): Promise<Location[]> {
      const { data, error } = await client.from("locations").select("*").order("slug");
      if (error || !data) return [];
      return data.map(mapDbLocation);
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

      const baristaPin = Math.floor(1000 + Math.random() * 9000).toString();
      const managerPin = Math.floor(1000 + Math.random() * 9000).toString();

      await client.from("staff_users").insert([
        {
          name: `Barista ${input.name}`,
          location_slug: slug,
          role: "barista",
          pin_hash: hashStaffPin(baristaPin),
          active: true,
          shared: false,
        },
        {
          name: `Manager ${input.name}`,
          location_slug: slug,
          role: "manager",
          pin_hash: hashStaffPin(managerPin),
          active: true,
          shared: false,
        },
      ]);

      return {
        status: "created",
        location: mapDbLocation(data),
        staffPins: [
          { name: `Barista ${input.name}`, pin: baristaPin },
          { name: `Manager ${input.name}`, pin: managerPin },
        ],
      };
    },

    /* -------------------------------------------------------- push --- */
    async createPushCampaign(input: NewPushCampaignInput): Promise<PushCampaign> {
      const now = input.now ?? new Date();
      const { data, error } = await client
        .from("push_campaigns")
        .insert({
          message_ro: input.messageRo,
          message_hu: input.messageHu ?? null,
          segment: input.segment,
          created_by: input.staffId ?? null,
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
        .from("audit_events")
        .insert({
          at: now.toISOString(),
          staff_id: input.staffId ?? null,
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
      let query = client.from("audit_events").select("*").order("at", { ascending: false });
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
      const stamps = await client.from("stamp_events").select("*");
      const redemptions = await client.from("redemptions").select("*");
      const campaigns = await this.listPushCampaigns();
      const locations = await this.listLocations();
      const baristas = await this.listStaff();

      return {
        membersTotal: members.length,
        members30d: members.length,
        studentsTotal: members.filter((m) => m.isStudent).length,
        studentsVerified: members.filter((m) => m.studentVerifiedAt).length,
        goldMembers: 0,
        consentOutdated: 0,
        retentionDue: 0,
        stampsTotal: stamps.data?.length ?? 0,
        stamps7d: stamps.data?.length ?? 0,
        stamps30d: stamps.data?.length ?? 0,
        redemptionsTotal: redemptions.data?.length ?? 0,
        redemptionsByReward: [],
        reviewBonuses: members.filter((m) => m.reviewBonusGiven).length,
        campaignsSent: campaigns.length,
        locations: locations.map((l) => ({
          slug: l.slug,
          name: l.name,
          stamps7d: 0,
          stamps30d: 0,
          redemptions30d: 0,
          googleRating: l.googleRating,
          googleReviewCount: l.googleReviewCount,
        })),
        baristas: baristas.map((b) => ({
          staffId: b.id,
          name: b.name,
          locationSlug: b.locationSlug,
          locationName: b.locationSlug,
          stamps7d: 0,
          stamps30d: 0,
          redemptions30d: 0,
        })),
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

function mapDbStaff(row: any): StaffUser {
  return {
    id: row.id,
    name: row.name,
    role: row.role,
    locationSlug: row.location_slug,
    active: row.active,
    shared: row.shared,
  };
}

function mapDbLocation(row: any): Location {
  return {
    slug: row.slug,
    name: row.name,
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
