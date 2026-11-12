import type { CampaignDb, Db, LoyaltyDb } from "./index.ts";
import { createMemoryDb, redactDrawingAudit } from "./memory.ts";
import { createSupabaseCampaignStore } from "./supabase-campaign.ts";
import {
  createSupabaseDb,
  redactDrawingAudit as redactDrawingAuditInSupabase,
} from "./supabase.ts";

/**
 * How `getDb()` is assembled. Each half picks its own backend from the
 * environment: loyalty on Supabase wherever the project is configured,
 * every campaign method from the campaign store. Pure apart from the
 * adapters it builds, so the tests can drive it with a fake env.
 */

/**
 * Every `CampaignDb` method, checked by the compiler both ways: a method
 * added to the interface and not listed here is a type error, and so is a
 * name listed here that the interface does not have.
 */
const CAMPAIGN_METHOD_MAP: Record<keyof CampaignDb, true> = {
  createDrawingEntry: true,
  getDrawingEntry: true,
  findDrawingEntryByCode: true,
  listDrawingEntries: true,
  setDrawingStatus: true,
  deleteDrawingEntries: true,
  setDrawingImage: true,
  publishDrawing: true,
  unpublishDrawing: true,
  listPublishedDrawings: true,
  setDrawingVoteWinner: true,
  createVoteCode: true,
  redeemVoteCode: true,
  castVote: true,
  hasVoted: true,
  listDrawingVotes: true,
  markDrawingSubmitted: true,
  setDrawingWinner: true,
  setWinnerAccepted: true,
  setReserveRank: true,
  getCampaignState: true,
  updateCampaignState: true,
  recordCampaignEvent: true,
  listCampaignEvents: true,
  rateLimitHit: true,
};

export const CAMPAIGN_METHODS = Object.keys(CAMPAIGN_METHOD_MAP) as (keyof CampaignDb)[];

export type CampaignBackend =
  | { kind: "supabase"; url: string; serviceRoleKey: string }
  | { kind: "memory" }
  | { kind: "unavailable"; reason: string };

/** Reads the env; never throws. */
export function campaignBackend(env: Record<string, string | undefined>): CampaignBackend {
  const url = env.SUPABASE_URL?.trim();
  const key = env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (url && key) return { kind: "supabase", url, serviceRoleKey: key };
  if (url || key) {
    return {
      kind: "unavailable",
      reason: url
        ? "SUPABASE_SERVICE_ROLE_KEY lipsește (SUPABASE_URL e setat)."
        : "SUPABASE_URL lipsește (SUPABASE_SERVICE_ROLE_KEY e setat).",
    };
  }
  if (env.NODE_ENV === "production") {
    return {
      kind: "unavailable",
      reason: "SUPABASE_URL și SUPABASE_SERVICE_ROLE_KEY nu sunt setate în producție.",
    };
  }
  return { kind: "memory" };
}

/** Thrown by every campaign method when no persistent store is configured. */
export class CampaignStoreUnavailableError extends Error {
  constructor(reason: string) {
    super(
      `Baza de date a concursului nu este configurată: ${reason} ` +
        "Datele concursului nu se salvează în memorie în producție. / " +
        "Campaign store not configured: set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.",
    );
    this.name = "CampaignStoreUnavailableError";
  }
}

/** Fail closed: every method rejects, nothing is ever kept in RAM. */
export function createUnavailableCampaignStore(reason: string): CampaignDb {
  const store = {} as Record<string, () => Promise<never>>;
  for (const name of CAMPAIGN_METHODS) {
    store[name] = async () => {
      throw new CampaignStoreUnavailableError(reason);
    };
  }
  return store as unknown as CampaignDb;
}

/**
 * Loyalty from `loyalty`, every campaign method from `campaign`. When the
 * two are different stores, the end-of-campaign deletion also redacts the
 * Jurnal rows (which live with loyalty) that pointed at a deleted entry —
 * what the memory adapter does by itself.
 */
export function composeDb(
  loyalty: LoyaltyDb,
  campaign: CampaignDb,
  options: { redactAudit?: (ids: Set<string>) => void | Promise<void> } = {},
): Db {
  const db = { ...loyalty } as Db;
  for (const name of CAMPAIGN_METHODS) {
    const method = campaign[name] as (...args: unknown[]) => unknown;
    (db as unknown as Record<string, unknown>)[name] = method.bind(campaign);
  }
  if ((campaign as unknown) !== loyalty && options.redactAudit) {
    const redact = options.redactAudit;
    db.deleteDrawingEntries = async () => {
      const ids = new Set((await campaign.listDrawingEntries()).map((e) => e.id));
      const result = await campaign.deleteDrawingEntries();
      await redact(ids);
      return result;
    };
  }
  return db;
}

/**
 * Loyalty's backend, chosen the way `getDb()` always chose it: the project
 * URL, ignoring the placeholder a fresh checkout carries. The kind is
 * returned with it because the campaign half needs to know whether it is
 * looking at the same store.
 */
function loyaltyBackend(
  env: Record<string, string | undefined>,
): { kind: "supabase"; db: LoyaltyDb } | { kind: "memory"; db: Db } {
  const url = env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  if (url && !url.includes("YOUR_PROJECT_ID")) {
    return { kind: "supabase", db: createSupabaseDb() };
  }
  return { kind: "memory", db: createMemoryDb() };
}

/** What `getDb()` returns for a given environment. */
export function createDb(env: Record<string, string | undefined>): Db {
  const loyalty = loyaltyBackend(env);
  // One project holds both halves, and the loyalty adapter has always read
  // the URL under its NEXT_PUBLIC name. Accept that name here too, so a
  // deployment sets the pair of Supabase variables once.
  const backend = campaignBackend({
    ...env,
    SUPABASE_URL: env.SUPABASE_URL ?? env.NEXT_PUBLIC_SUPABASE_URL,
  });
  // Whichever store holds the Jurnal is the one the deletion has to redact.
  const redactAudit =
    loyalty.kind === "supabase" ? redactDrawingAuditInSupabase : redactDrawingAudit;

  switch (backend.kind) {
    case "memory":
      // Loyalty in memory too: one adapter for both halves, which redacts
      // the Jurnal by itself on the way out.
      return loyalty.kind === "memory"
        ? composeDb(loyalty.db, loyalty.db)
        : composeDb(loyalty.db, createMemoryDb(), { redactAudit });
    case "supabase":
      return composeDb(
        loyalty.db,
        createSupabaseCampaignStore({ url: backend.url, serviceRoleKey: backend.serviceRoleKey }),
        { redactAudit },
      );
    case "unavailable":
      return composeDb(loyalty.db, createUnavailableCampaignStore(backend.reason));
  }
}
