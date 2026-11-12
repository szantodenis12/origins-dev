import type { CampaignDb, Db, LoyaltyDb } from "./index.ts";
import { createMemoryDb, redactDrawingAudit } from "./memory.ts";
import { createSupabaseCampaignStore } from "./supabase.ts";

/**
 * How `getDb()` is assembled. Loyalty stays exactly as it is (memory
 * adapter); every campaign method comes from the campaign store picked by
 * the environment. Pure apart from the adapters it builds, so the tests can
 * drive it with a fake env.
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
  options: { redactAudit?: (ids: Set<string>) => void } = {},
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
      redact(ids);
      return result;
    };
  }
  return db;
}

/** What `getDb()` returns for a given environment. */
export function createDb(env: Record<string, string | undefined>): Db {
  const memory = createMemoryDb();
  const backend = campaignBackend(env);
  switch (backend.kind) {
    case "memory":
      return composeDb(memory, memory);
    case "supabase":
      return composeDb(
        memory,
        createSupabaseCampaignStore({ url: backend.url, serviceRoleKey: backend.serviceRoleKey }),
        { redactAudit: redactDrawingAudit },
      );
    case "unavailable":
      return composeDb(memory, createUnavailableCampaignStore(backend.reason));
  }
}
