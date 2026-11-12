import { createHash } from "node:crypto";
import {
  canChangeDrawingStatus,
  drawingIsLive,
  drawingPublishBlock,
  normalizeDrawingCode,
  type DrawingLocation,
  type DrawingStatus,
} from "../drawing.ts";
import { EMPTY_CAMPAIGN_STATE, type CampaignState } from "../campaign-phase.ts";
import {
  isCampaignEventName,
  sanitizeEventProps,
  type CampaignEvent,
  type CampaignEventName,
} from "../campaign-metrics.ts";
import {
  campaignPrintable,
  isSheetKind,
  SUBMITTABLE_STATUSES,
  validateNewDrawingEntry,
  type SheetKind,
  type WinnerKind,
} from "./campaign-rules.ts";
import type {
  CampaignDb,
  CastVoteResult,
  CreateDrawingEntryResult,
  DrawingEntry,
  DrawingImageInput,
  DrawingVote,
  MarkDrawingSubmittedResult,
  NewCampaignEventInput,
  NewDrawingEntryInput,
  NewVoteCodeInput,
  PublishDrawingResult,
  RedeemVoteCodeResult,
  SetDrawingStatusResult,
  SetDrawingWinnerResult,
  SetReserveRankResult,
  SetVoteWinnerResult,
  SetWinnerAcceptedResult,
  StaffRole,
} from "./index.ts";

/**
 * Campaign store on Supabase: PostgREST over plain `fetch`, authenticated
 * with the SERVICE ROLE key. SERVER ONLY. The key is read from
 * `SUPABASE_SERVICE_ROLE_KEY` (no NEXT_PUBLIC_ prefix, so Next never ships
 * it to a browser) and the factory refuses to run in a browser. Parent
 * names and phones therefore leave the database only through this file;
 * the anon role has no grant on any campaign table (migration 0004).
 *
 * Behavioural reference: the memory adapter (memory.ts). Atomic steps are
 * Postgres functions (0002–0004): create_drawing_entry (row + sequential
 * code), redeem_drawing_vote_code, cast_drawing_vote, set_drawing_winner,
 * delete_drawing_campaign_data, campaign_rate_limit_hit. Plain updates are
 * conditional (`status=eq.<what we read>`), so a concurrent change makes
 * the second writer re-read instead of overwriting.
 *
 * Clock: `now` arguments are written as given (created/updated/published
 * timestamps, vote time). Vote-code expiry is checked by the database clock
 * inside redeem_drawing_vote_code (0003), not by `now`.
 *
 * Nothing here seeds data: demo drawings exist only in the memory adapter.
 */

export interface SupabaseCampaignStoreOptions {
  /** Project URL, e.g. https://xyz.supabase.co (no trailing /rest/v1). */
  url: string;
  /** Legacy service_role JWT or a new `sb_secret_…` key. */
  serviceRoleKey: string;
  /** Injected in tests. */
  fetch?: typeof fetch;
}

export class SupabaseRequestError extends Error {
  readonly status: number;
  readonly code: string | null;
  constructor(status: number, code: string | null, message: string) {
    super(message);
    this.name = "SupabaseRequestError";
    this.status = status;
    this.code = code;
  }
}

/** Headers for a service-role call, legacy JWT or new secret key alike. */
export function supabaseAuthHeaders(key: string): Record<string, string> {
  const headers: Record<string, string> = { apikey: key };
  // A legacy key is a JWT and also goes in Authorization; a new
  // `sb_secret_…` key is not a JWT and is accepted in `apikey` alone.
  if (key.split(".").length === 3) headers.Authorization = `Bearer ${key}`;
  return headers;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PAGE = 1000;

/* ------------------------------------------------------------- row maps --- */

interface EntryRow {
  id: string;
  code: string;
  location: DrawingLocation;
  child_first_name: string;
  child_age: number;
  category: DrawingEntry["category"];
  parent_name: string;
  phone: string;
  consent_participation: boolean;
  consent_reproduction: boolean;
  attribution: DrawingEntry["attribution"];
  consent_photo: boolean;
  consent_gallery: boolean;
  circle_opt_in: boolean;
  status: DrawingStatus;
  image_original: string | null;
  image_web: string | null;
  image_width: number | null;
  image_height: number | null;
  cup_mockup: string | null;
  published_at: string | null;
  unpublished_at: string | null;
  vote_winner: boolean;
  sheet_kind: SheetKind | null;
  submitted_at: string | null;
  submitted_by: string | null;
  winner_kind: WinnerKind | null;
  winner_accepted_at: string | null;
  reserve_rank: number | null;
  registered_via: "web" | "counter";
  registered_by: string | null;
  created_at: string;
  updated_at: string;
}

/** Postgres gives "…+00:00" with microseconds; the app compares "…Z" strings. */
function iso(value: string): string;
function iso(value: string | null): string | null;
function iso(value: string | null): string | null {
  return value === null ? null : new Date(value).toISOString();
}

function toEntry(row: EntryRow): DrawingEntry {
  return {
    id: row.id,
    code: row.code,
    location: row.location,
    childFirstName: row.child_first_name,
    childAge: row.child_age,
    category: row.category,
    parentName: row.parent_name,
    phone: row.phone,
    consentParticipation: row.consent_participation,
    consentReproduction: row.consent_reproduction,
    attribution: row.attribution,
    consentPhoto: row.consent_photo,
    consentGallery: row.consent_gallery,
    circleOptIn: row.circle_opt_in,
    status: row.status,
    imageOriginal: row.image_original,
    imageWeb: row.image_web,
    imageWidth: row.image_width,
    imageHeight: row.image_height,
    cupMockup: row.cup_mockup,
    publishedAt: iso(row.published_at),
    unpublishedAt: iso(row.unpublished_at),
    voteWinner: row.winner_kind === "vote",
    sheetKind: row.sheet_kind,
    submittedAt: iso(row.submitted_at),
    submittedBy: row.submitted_by,
    winnerKind: row.winner_kind,
    winnerAcceptedAt: iso(row.winner_accepted_at),
    reserveRank: row.reserve_rank,
    registeredVia: row.registered_via,
    ...(row.registered_by ? { registeredBy: row.registered_by } : {}),
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
  };
}

interface EventRow {
  name: CampaignEventName;
  location: string | null;
  channel: string | null;
  category: string | null;
  method: string | null;
  created_at: string;
}

function toEvent(row: EventRow): CampaignEvent {
  return {
    name: row.name,
    ...(row.location ? { location: row.location } : {}),
    ...(row.channel ? { channel: row.channel } : {}),
    ...(row.category ? { category: row.category } : {}),
    ...(row.method ? { method: row.method } : {}),
    createdAt: iso(row.created_at),
  };
}

/* -------------------------------------------------------------- adapter --- */

export function createSupabaseCampaignStore(options: SupabaseCampaignStoreOptions): CampaignDb {
  if (typeof window !== "undefined") {
    throw new Error("The Supabase campaign store is server-only.");
  }
  const base = `${options.url.replace(/\/+$/, "")}/rest/v1`;
  const doFetch = options.fetch ?? fetch;
  const auth = supabaseAuthHeaders(options.serviceRoleKey);

  async function request<T>(
    path: string,
    init: {
      method?: string;
      body?: unknown;
      prefer?: string;
      headers?: Record<string, string>;
    } = {},
  ): Promise<T> {
    const response = await doFetch(`${base}${path}`, {
      method: init.method ?? "GET",
      headers: {
        ...auth,
        Accept: "application/json",
        ...(init.body !== undefined ? { "Content-Type": "application/json" } : {}),
        ...(init.prefer ? { Prefer: init.prefer } : {}),
        ...init.headers,
      },
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
      cache: "no-store",
    });
    const text = await response.text();
    if (!response.ok) {
      let code: string | null = null;
      let message = text;
      try {
        const parsed = JSON.parse(text) as { code?: string; message?: string };
        code = parsed.code ?? null;
        message = parsed.message ?? text;
      } catch {
        // not JSON: keep the raw text
      }
      throw new SupabaseRequestError(
        response.status,
        code,
        `Supabase ${init.method ?? "GET"} ${path.split("?")[0]}: ${response.status} ${message}`,
      );
    }
    return (text ? JSON.parse(text) : null) as T;
  }

  /** Every row of a query, page by page (Supabase caps a response at 1000). */
  async function selectAll<T>(path: string): Promise<T[]> {
    const rows: T[] = [];
    for (let from = 0; ; from += PAGE) {
      const page = await request<T[]>(path, {
        headers: { "Range-Unit": "items", Range: `${from}-${from + PAGE - 1}` },
      });
      rows.push(...page);
      if (page.length < PAGE) return rows;
    }
  }

  const rpc = <T>(name: string, args: Record<string, unknown>) =>
    request<T>(`/rpc/${name}`, { method: "POST", body: args });

  async function getEntry(id: string): Promise<DrawingEntry | null> {
    if (!UUID.test(id)) return null;
    const rows = await request<EntryRow[]>(
      `/drawing_entries?id=eq.${id}&select=*&limit=1`,
    );
    return rows[0] ? toEntry(rows[0]) : null;
  }

  /** PATCH with filters; the updated entry, or null when no row matched. */
  async function patchEntry(
    filters: string,
    values: Record<string, unknown>,
  ): Promise<DrawingEntry | null> {
    const rows = await request<EntryRow[]>(`/drawing_entries?${filters}&select=*`, {
      method: "PATCH",
      body: values,
      prefer: "return=representation",
    });
    return rows[0] ? toEntry(rows[0]) : null;
  }

  async function setWinner(
    id: string,
    kind: WinnerKind | null,
    now: Date,
  ): Promise<SetDrawingWinnerResult> {
    if (!UUID.test(id)) return { status: "not_found" };
    const result = await rpc<{ status: string; replaced_id?: string | null }>(
      "set_drawing_winner",
      { p_entry_id: id, p_kind: kind, p_at: now.toISOString() },
    );
    if (result.status !== "saved") {
      return { status: result.status } as SetDrawingWinnerResult;
    }
    const entry = await getEntry(id);
    if (!entry) return { status: "not_found" };
    const replaced = result.replaced_id ? await getEntry(result.replaced_id) : null;
    return { status: "saved", entry, replaced };
  }

  async function readCampaignState(): Promise<CampaignState> {
    const rows = await request<
      { results_published_at: string | null; collection_confirmed_at: string | null }[]
    >("/campaign_state?id=eq.true&select=results_published_at,collection_confirmed_at");
    if (!rows[0]) return { ...EMPTY_CAMPAIGN_STATE };
    return {
      resultsPublishedAt: iso(rows[0].results_published_at),
      collectionConfirmedAt: iso(rows[0].collection_confirmed_at),
    };
  }

  return {
    /* -------------------------------------------------------- entries --- */

    async createDrawingEntry(input: NewDrawingEntryInput): Promise<CreateDrawingEntryResult> {
      const checked = validateNewDrawingEntry(input);
      if (!checked.ok) return { status: checked.status };
      const v = checked.values;
      const row = await rpc<EntryRow | EntryRow[]>("create_drawing_entry", {
        p: {
          location: v.location,
          child_first_name: v.childFirstName,
          child_age: v.childAge,
          category: v.category,
          parent_name: v.parentName,
          phone: v.phone,
          consent_participation: true,
          consent_reproduction: v.consentReproduction,
          attribution: v.attribution,
          consent_photo: v.consentPhoto,
          consent_gallery: v.consentGallery,
          circle_opt_in: v.circleOptIn,
          registered_via: input.registeredVia,
          registered_by: input.registeredBy ?? null,
          created_at: (input.now ?? new Date()).toISOString(),
        },
      });
      const created = Array.isArray(row) ? row[0] : row;
      return { status: "created", entry: toEntry(created) };
    },

    getDrawingEntry: getEntry,

    async findDrawingEntryByCode(code: string): Promise<DrawingEntry | null> {
      const wanted = normalizeDrawingCode(code);
      if (!wanted) return null;
      const rows = await request<EntryRow[]>(
        `/drawing_entries?code=eq.${encodeURIComponent(wanted)}&select=*&limit=1`,
      );
      return rows[0] ? toEntry(rows[0]) : null;
    },

    async listDrawingEntries(options?: { location?: DrawingLocation }): Promise<DrawingEntry[]> {
      const where = options?.location
        ? `location=eq.${encodeURIComponent(options.location)}&`
        : "";
      const rows = await selectAll<EntryRow>(
        `/drawing_entries?${where}select=*&order=created_at.desc,id.desc`,
      );
      return rows.map(toEntry);
    },

    async setDrawingStatus(
      id: string,
      status: DrawingStatus,
      role: StaffRole,
      now: Date = new Date(),
    ): Promise<SetDrawingStatusResult> {
      const entry = await getEntry(id);
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
      const saved = await patchEntry(`id=eq.${id}&status=eq.${entry.status}`, {
        status,
        updated_at: now.toISOString(),
      });
      // Somebody else moved it in between: their change stands.
      if (!saved) return { status: "invalid_transition" };
      return { status: "saved", entry: saved, from: entry.status };
    },

    async deleteDrawingEntries(): Promise<{ deleted: number }> {
      const deleted = await rpc<number>("delete_drawing_campaign_data", {});
      return { deleted };
    },

    /* ------------------------------------------------- gallery + vote --- */

    async setDrawingImage(
      id: string,
      image: DrawingImageInput,
      now: Date = new Date(),
    ): Promise<DrawingEntry | null> {
      if (!UUID.test(id)) return null;
      return patchEntry(`id=eq.${id}`, {
        image_original: image.original,
        image_web: image.web,
        image_width: image.width,
        image_height: image.height,
        cup_mockup: image.cupMockup,
        updated_at: now.toISOString(),
      });
    },

    async publishDrawing(id: string, now: Date = new Date()): Promise<PublishDrawingResult> {
      const entry = await getEntry(id);
      if (!entry) return { status: "not_found" };
      const block = drawingPublishBlock(entry);
      if (block) return { status: "blocked", reason: block };
      const saved = await patchEntry(
        `id=eq.${id}&status=in.(depus,expus)&consent_gallery=is.true&image_web=not.is.null`,
        {
          // First publish only: a take-down and return keeps the original clock.
          published_at: entry.publishedAt ?? now.toISOString(),
          unpublished_at: null,
          updated_at: now.toISOString(),
        },
      );
      if (saved) return { status: "published", entry: saved };
      const fresh = await getEntry(id);
      if (!fresh) return { status: "not_found" };
      return { status: "blocked", reason: drawingPublishBlock(fresh) ?? "bad_status" };
    },

    async unpublishDrawing(id: string, now: Date = new Date()): Promise<DrawingEntry | null> {
      const entry = await getEntry(id);
      if (!entry) return null;
      if (!drawingIsLive(entry)) return entry;
      return (
        (await patchEntry(`id=eq.${id}&published_at=not.is.null&unpublished_at=is.null`, {
          unpublished_at: now.toISOString(),
          updated_at: now.toISOString(),
        })) ?? getEntry(id)
      );
    },

    async listPublishedDrawings(): Promise<DrawingEntry[]> {
      const rows = await selectAll<EntryRow>(
        "/drawing_entries?published_at=not.is.null&unpublished_at=is.null" +
          "&image_web=not.is.null&select=*&order=published_at.desc,id.desc",
      );
      return rows.map(toEntry);
    },

    async setDrawingVoteWinner(
      id: string,
      winner: boolean,
      now: Date = new Date(),
    ): Promise<SetVoteWinnerResult> {
      const entry = await getEntry(id);
      if (!entry) return { status: "not_found" };
      // Unmarking only ever clears a VOTE win; a jury pick is left alone.
      if (!winner && entry.winnerKind !== "vote") {
        return { status: "saved", entry, replaced: null };
      }
      return (await setWinner(id, winner ? "vote" : null, now)) as SetVoteWinnerResult;
    },

    async createVoteCode(input: NewVoteCodeInput): Promise<void> {
      if (!UUID.test(input.drawingId)) return;
      try {
        await request("/drawing_vote_codes?on_conflict=entry_id,email_hash", {
          method: "POST",
          prefer: "resolution=merge-duplicates,return=minimal",
          body: {
            entry_id: input.drawingId,
            email_hash: input.emailHash,
            code_hash: input.codeHash,
            expires_at: input.expiresAt,
            attempts: 0,
            created_at: new Date().toISOString(),
          },
        });
      } catch (error) {
        // No such drawing: nothing to store, redeem answers "no_code".
        if (error instanceof SupabaseRequestError && error.code === "23503") return;
        throw error;
      }
    },

    async redeemVoteCode(input: {
      drawingId: string;
      emailHash: string;
      codeHash: string;
      maxAttempts: number;
      now?: Date;
    }): Promise<RedeemVoteCodeResult> {
      if (!UUID.test(input.drawingId)) return { status: "no_code" };
      const status = await rpc<string>("redeem_drawing_vote_code", {
        p_entry_id: input.drawingId,
        p_email_hash: input.emailHash,
        p_code_hash: input.codeHash,
        p_max_attempts: input.maxAttempts,
      });
      if (status === "wrong_code") {
        const rows = await request<{ attempts: number }[]>(
          `/drawing_vote_codes?entry_id=eq.${input.drawingId}` +
            `&email_hash=eq.${encodeURIComponent(input.emailHash)}&select=attempts`,
        );
        const used = rows[0]?.attempts ?? 1;
        return { status: "wrong_code", attemptsLeft: Math.max(1, input.maxAttempts - used) };
      }
      return { status } as RedeemVoteCodeResult;
    },

    async castVote(input: {
      drawingId: string;
      emailHash: string;
      now?: Date;
    }): Promise<CastVoteResult> {
      if (!UUID.test(input.drawingId)) return { status: "not_live" };
      const status = await rpc<CastVoteResult["status"]>("cast_drawing_vote", {
        p_entry_id: input.drawingId,
        p_email_hash: input.emailHash,
        p_at: (input.now ?? new Date()).toISOString(),
      });
      return { status };
    },

    async hasVoted(drawingId: string, emailHash: string): Promise<boolean> {
      if (!UUID.test(drawingId)) return false;
      const rows = await request<unknown[]>(
        `/drawing_votes?entry_id=eq.${drawingId}` +
          `&email_hash=eq.${encodeURIComponent(emailHash)}&select=entry_id&limit=1`,
      );
      return rows.length > 0;
    },

    async listDrawingVotes(): Promise<DrawingVote[]> {
      const rows = await selectAll<{ entry_id: string; email_hash: string; created_at: string }>(
        "/drawing_votes?select=entry_id,email_hash,created_at&order=created_at.asc,id.asc",
      );
      return rows.map((r) => ({
        drawingId: r.entry_id,
        emailHash: r.email_hash,
        createdAt: iso(r.created_at),
      }));
    },

    /* ------------------------------------------------ campaign phases --- */

    async markDrawingSubmitted(
      id: string,
      input: { sheetKind: SheetKind; staffId: string | null },
      now: Date = new Date(),
    ): Promise<MarkDrawingSubmittedResult> {
      const entry = await getEntry(id);
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
      const saved = await patchEntry(`id=eq.${id}&status=eq.${entry.status}`, {
        sheet_kind: input.sheetKind,
        submitted_at: entry.submittedAt ?? now.toISOString(),
        submitted_by: entry.submittedBy ?? input.staffId,
        status: entry.status === "inregistrat" ? "depus" : entry.status,
        updated_at: now.toISOString(),
      });
      if (!saved) return { status: "invalid_transition" };
      return { status: "saved", entry: saved, from: entry.status };
    },

    async setDrawingWinner(
      id: string,
      kind: WinnerKind | null,
      now: Date = new Date(),
    ): Promise<SetDrawingWinnerResult> {
      return setWinner(id, kind, now);
    },

    async setWinnerAccepted(id: string, acceptedAt: Date | null): Promise<SetWinnerAcceptedResult> {
      const entry = await getEntry(id);
      if (!entry) return { status: "not_found" };
      if (entry.winnerKind === null) return { status: "not_winner" };
      const saved = await patchEntry(`id=eq.${id}&winner_kind=not.is.null`, {
        winner_accepted_at: acceptedAt ? acceptedAt.toISOString() : null,
        updated_at: (acceptedAt ?? new Date()).toISOString(),
      });
      return saved ? { status: "saved", entry: saved } : { status: "not_winner" };
    },

    async setReserveRank(
      id: string,
      rank: number | null,
      now: Date = new Date(),
    ): Promise<SetReserveRankResult> {
      const entry = await getEntry(id);
      if (!entry) return { status: "not_found" };
      if (rank !== null) {
        if (!Number.isInteger(rank) || rank < 1) return { status: "invalid_rank" };
        if (entry.winnerKind !== null) return { status: "is_winner" };
        if (!campaignPrintable(entry)) return { status: "not_eligible" };
      }
      try {
        const saved = await patchEntry(`id=eq.${id}`, {
          reserve_rank: rank,
          updated_at: now.toISOString(),
        });
        return saved ? { status: "saved", entry: saved } : { status: "not_found" };
      } catch (error) {
        if (error instanceof SupabaseRequestError && error.code === "23505") {
          return { status: "rank_taken" };
        }
        // 23514: a check failed because the row changed in between.
        if (error instanceof SupabaseRequestError && error.code === "23514") {
          return { status: "not_eligible" };
        }
        throw error;
      }
    },

    getCampaignState: readCampaignState,

    async updateCampaignState(patch: Partial<CampaignState>): Promise<CampaignState> {
      const values: Record<string, unknown> = { id: true, updated_at: new Date().toISOString() };
      if (patch.resultsPublishedAt !== undefined) {
        values.results_published_at = patch.resultsPublishedAt;
      }
      if (patch.collectionConfirmedAt !== undefined) {
        values.collection_confirmed_at = patch.collectionConfirmedAt;
      }
      await request("/campaign_state?on_conflict=id", {
        method: "POST",
        prefer: "resolution=merge-duplicates,return=minimal",
        body: values,
      });
      return readCampaignState();
    },

    async recordCampaignEvent(event: NewCampaignEventInput): Promise<void> {
      if (!isCampaignEventName(event.name)) {
        throw new Error(`Eveniment de campanie necunoscut: ${String(event.name)}`);
      }
      const props = sanitizeEventProps(event as unknown as Record<string, unknown>);
      await request("/campaign_events", {
        method: "POST",
        prefer: "return=minimal",
        body: {
          name: event.name,
          location: props.location ?? null,
          channel: props.channel ?? null,
          category: props.category ?? null,
          method: props.method ?? null,
          created_at: (event.now ?? new Date()).toISOString(),
        },
      });
    },

    async listCampaignEvents(options?: {
      from?: Date;
      to?: Date;
      name?: CampaignEventName;
    }): Promise<CampaignEvent[]> {
      const filters: string[] = [];
      if (options?.from) filters.push(`created_at=gte.${encodeURIComponent(options.from.toISOString())}`);
      if (options?.to) filters.push(`created_at=lt.${encodeURIComponent(options.to.toISOString())}`);
      if (options?.name) filters.push(`name=eq.${encodeURIComponent(options.name)}`);
      const rows = await selectAll<EventRow>(
        `/campaign_events?${[...filters, "select=name,location,channel,category,method,created_at", "order=created_at.asc,id.asc"].join("&")}`,
      );
      return rows.map(toEvent);
    },

    async rateLimitHit(
      key: string,
      options: { limit: number; windowMs: number },
      now: Date = new Date(),
    ): Promise<boolean> {
      // Only a hash is stored: the key may carry an IP address.
      const keyHash = createHash("sha256").update(`origins-rl:${key}`).digest("hex");
      return rpc<boolean>("campaign_rate_limit_hit", {
        p_key_hash: keyHash,
        p_limit: options.limit,
        p_window_ms: options.windowMs,
        p_now: now.toISOString(),
      });
    },
  };
}
