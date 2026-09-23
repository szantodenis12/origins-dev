import type { Member } from "../db";
import type { MemberCard } from "../card";
import { getWalletAccessToken, googleWalletConfigured } from "./google-auth.ts";
import {
  buildLoyaltyClass,
  buildLoyaltyObject,
  legacyLoyaltyObjectIds,
  loyaltyClassId,
  loyaltyObjectId,
  stampBalance,
  tierKeyFor,
  TIER_CLASS,
  type TierKey,
} from "./google.ts";

/**
 * Updating a pass that is already on someone's phone.
 *
 * Google needs no device registration and no push certificate: the object
 * lives on Google's side, and every phone that saved it follows whatever we
 * PATCH here. `notifyPreference: NOTIFY_ON_UPDATE` turns a change of
 * `loyaltyPoints.balance` into a lock-screen notification — the counterpart of
 * Apple's `changeMessage`.
 *
 * Google allows three notifying updates per pass per 24h and answers a fourth
 * with a quota error. That must not cost the member their stamp count, so a
 * refused notification is retried immediately as a silent update.
 */

const BASE = "https://walletobjects.googleapis.com/walletobjects/v1";
const REQUEST_TIMEOUT_MS = 8_000;

interface WalletResponse {
  ok: boolean;
  status: number;
  body: string;
}

async function walletFetch(
  method: "GET" | "POST" | "PATCH" | "PUT",
  path: string,
  body?: unknown,
): Promise<WalletResponse | null> {
  const token = await getWalletAccessToken();
  if (!token) return null;

  try {
    const res = await fetch(`${BASE}/${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    return { ok: res.ok, status: res.status, body: await res.text() };
  } catch (err) {
    console.error(`[google-wallet] ${method} ${path} failed:`, err);
    return null;
  }
}

/** Google reports the daily notification cap as 429, or 403 with a quota reason. */
function isQuotaError(res: WalletResponse): boolean {
  return (
    res.status === 429 ||
    (res.status === 403 && /quota/i.test(res.body)) ||
    /QuotaExceeded/i.test(res.body)
  );
}

/** A class swap can be refused on its own; the rest of the patch still applies. */
function isClassIdError(res: WalletResponse): boolean {
  return res.status === 400 && /classId|class_id|classReference/i.test(res.body);
}

/**
 * Every object this member has on Google's side.
 *
 * Normally exactly one. But cards saved before the tier left the object id
 * live under a tier-suffixed id, and a member who saved again after the change
 * ends up holding two. We cannot tell which one their phone shows, so an
 * update goes to all of them — the stale one costs a write and nothing else.
 *
 * The four candidates are probed together: one round trip instead of four,
 * which matters because the barista's scan waits on this.
 */
async function resolveObjectIds(member: Member): Promise<string[]> {
  const candidates = [loyaltyObjectId(member), ...legacyLoyaltyObjectIds(member)];

  const results = await Promise.all(
    candidates.map(async (id) => {
      const res = await walletFetch("GET", `loyaltyObject/${id}`);
      return res?.ok ? id : null;
    }),
  );

  return results.filter((id): id is string => id !== null);
}

export interface GoogleUpdateResult {
  status: "updated" | "not_saved" | "skipped" | "error";
  notified?: boolean;
  tierChanged?: boolean;
}

/**
 * Push the member's current stamp count and tier to their Google Wallet card.
 *
 * `notify` asks for a lock-screen notification; it is dropped silently when
 * the daily quota is spent so the card still ends up showing the right number.
 */
export async function notifyGooglePassUpdated(
  member: Member,
  card: MemberCard,
  options: { notify?: boolean } = {},
): Promise<GoogleUpdateResult> {
  if (!googleWalletConfigured()) return { status: "skipped" };

  const notify = options.notify ?? true;
  const tier = tierKeyFor(member, card);

  const objectIds = await resolveObjectIds(member);
  if (objectIds.length === 0) {
    // Nobody saved this card to Google Wallet — not an error.
    return { status: "not_saved" };
  }

  const results = await Promise.all(
    objectIds.map((id) => patchOne(id, member, card, tier, notify)),
  );

  // One object is the normal case. With more than one, the member's card is
  // correct as long as any write landed.
  const updated = results.find((r) => r.status === "updated");
  return updated ?? results[0];
}

async function patchOne(
  objectId: string,
  member: Member,
  card: MemberCard,
  tier: TierKey,
  notify: boolean,
): Promise<GoogleUpdateResult> {
  const full = buildLoyaltyObject(member, card, tier);
  const patch: Record<string, unknown> = {
    classId: loyaltyClassId(tier),
    state: full.state,
    heroImage: full.heroImage,
    loyaltyPoints: full.loyaltyPoints,
    textModulesData: full.textModulesData,
  };

  const send = (extra: Record<string, unknown>) =>
    walletFetch("PATCH", `loyaltyObject/${objectId}`, { ...patch, ...extra });

  const notifying = () =>
    notify ? { notifyPreference: "NOTIFY_ON_UPDATE" } : {};

  let res = await send(notifying());
  if (!res) return { status: "error" };

  let notified = notify;
  let tierChanged = true;

  // A refused class swap must not cost the member their stamp count, so drop
  // the tier move and keep the numbers. The object-level hero still changes.
  if (!res.ok && isClassIdError(res)) {
    console.warn(
      `[google-wallet] class swap to ${tier} refused for ${objectId}, patching fields only`,
    );
    delete patch.classId;
    tierChanged = false;
    const retry = await send(notifying());
    if (!retry) return { status: "error" };
    res = retry;
  }

  if (!res.ok && isQuotaError(res)) {
    console.warn(
      `[google-wallet] daily notification quota spent for ${objectId}, updating silently`,
    );
    notified = false;
    const retry = await send({});
    if (!retry) return { status: "error" };
    res = retry;
  }

  if (!res.ok) {
    console.error(
      `[google-wallet] PATCH ${objectId} -> ${res.status}: ${res.body.slice(0, 300)}`,
    );
    return { status: "error" };
  }

  return { status: "updated", notified, tierChanged };
}

/**
 * A message on the back of the card, optionally with a notification. Used by
 * the manager's push composer — the Google counterpart of an APNs broadcast.
 */
export async function addGoogleMessage(
  member: Member,
  header: string,
  body: string,
  notify = true,
): Promise<"sent" | "not_saved" | "skipped" | "error"> {
  if (!googleWalletConfigured()) return "skipped";

  const objectIds = await resolveObjectIds(member);
  if (objectIds.length === 0) return "not_saved";

  const outcomes = await Promise.all(
    objectIds.map((id) => messageOne(id, header, body, notify)),
  );
  return outcomes.includes("sent") ? "sent" : outcomes[0];
}

async function messageOne(
  objectId: string,
  header: string,
  body: string,
  notify: boolean,
): Promise<"sent" | "error"> {
  const message = {
    message: {
      header,
      body,
      id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      messageType: notify ? "TEXT_AND_NOTIFY" : "TEXT",
    },
  };

  let res = await walletFetch(
    "POST",
    `loyaltyObject/${objectId}/addMessage`,
    message,
  );
  if (!res) return "error";

  if (!res.ok && isQuotaError(res)) {
    // Out of notifications for today — still put the text on the card.
    message.message.messageType = "TEXT";
    const retry = await walletFetch(
      "POST",
      `loyaltyObject/${objectId}/addMessage`,
      message,
    );
    if (!retry) return "error";
    res = retry;
  }

  if (!res.ok) {
    console.error(
      `[google-wallet] addMessage ${objectId} -> ${res.status}: ${res.body.slice(0, 300)}`,
    );
    return "error";
  }
  return "sent";
}

/**
 * Create or refresh the three tier classes. Idempotent, and meant to be run
 * from the setup script rather than on a request path.
 */
export async function upsertLoyaltyClasses(): Promise<
  Record<TierKey, string>
> {
  const out = {} as Record<TierKey, string>;
  for (const tier of Object.keys(TIER_CLASS) as TierKey[]) {
    const id = loyaltyClassId(tier);

    const existing = await walletFetch("GET", `loyaltyClass/${id}`);
    if (!existing) {
      out[tier] = "no credentials";
      continue;
    }

    // An existing class keeps whatever review state it has earned; only a
    // brand-new one is submitted for review.
    const res = existing.ok
      ? await walletFetch("PATCH", `loyaltyClass/${id}`, buildLoyaltyClass(tier))
      : await walletFetch(
          "POST",
          "loyaltyClass",
          buildLoyaltyClass(tier, "UNDER_REVIEW"),
        );

    out[tier] = res?.ok
      ? existing.ok
        ? "updated"
        : "created"
      : `error ${res?.status}: ${res?.body.slice(0, 200)}`;
  }
  return out;
}

/** Exposed for the diagnostics route so Denis can see what Google holds. */
export async function inspectGoogleObject(member: Member): Promise<{
  objectId: string | null;
  classId?: string;
  balance?: string;
  /** More than one means the member saved the card under two id schemes. */
  allObjectIds?: string[];
}> {
  const objectIds = await resolveObjectIds(member);
  if (objectIds.length === 0) return { objectId: null };

  const objectId = objectIds[0];
  const res = await walletFetch("GET", `loyaltyObject/${objectId}`);
  if (!res?.ok) return { objectId, allObjectIds: objectIds };
  try {
    const parsed = JSON.parse(res.body);
    return {
      objectId,
      allObjectIds: objectIds,
      classId: parsed.classId,
      balance: parsed.loyaltyPoints?.balance?.string,
    };
  } catch {
    return { objectId, allObjectIds: objectIds };
  }
}

export { stampBalance };
