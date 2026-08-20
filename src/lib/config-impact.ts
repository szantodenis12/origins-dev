import { memberCard } from "./card.ts";
import type {
  BirthDate,
  Redemption,
  StampEvent,
  // Explicit .ts extensions: tests import this module under plain Node,
  // whose type stripping resolves relative paths literally.
} from "./loyalty.ts";
import type { LoyaltyConfig } from "./program.ts";

/**
 * What a program change does to the members who already exist. Everything on
 * the card is derived, so an edit in /admin/setari is retroactive: lengthening
 * the card instantly moves every member backwards. The save flow in
 * `app/admin/setari/actions.ts` runs this first and demands a second press
 * when anything gets worse for anyone.
 *
 * Pure: no I/O, no React. Tests run it directly under `node --test`.
 */

export interface MemberSnapshot {
  stamps: StampEvent[];
  redemptions: Redemption[];
  birth: BirthDate | null;
}

export interface ConfigImpact {
  /** Members holding an earned reward that the new settings take back. */
  losesReward: number;
  /** Members whose missing-stamp count grows under the new settings. */
  needsMoreStamps: number;
}

/**
 * Walks real members under the old and the new config — there are few, so
 * resolving every card twice is cheaper than being clever about it.
 */
export function configImpact(
  members: MemberSnapshot[],
  oldConfig: LoyaltyConfig,
  newConfig: LoyaltyConfig,
  now: Date = new Date(),
): ConfigImpact {
  let losesReward = 0;
  let needsMoreStamps = 0;

  for (const member of members) {
    const before = memberCard(
      member.stamps,
      member.redemptions,
      oldConfig,
      now,
      member.birth,
    );
    const after = memberCard(
      member.stamps,
      member.redemptions,
      newConfig,
      now,
      member.birth,
    );

    // "Earned and taken back" is by reward id: a reward on the table before
    // the save and gone after it, whatever the mechanism (longer card,
    // disabled perk, narrower birthday window).
    const kept = new Set(after.rewards.map((reward) => reward.id));
    if (before.rewards.some((reward) => !kept.has(reward.id))) {
      losesReward += 1;
    }

    if (after.remaining > before.remaining) needsMoreStamps += 1;
  }

  return { losesReward, needsMoreStamps };
}

/** Anything worse for anyone means the save needs a second press. */
export function impactIsHarmful(impact: ConfigImpact): boolean {
  return impact.losesReward > 0 || impact.needsMoreStamps > 0;
}

/**
 * The confirmation sentence, stated plainly: "Cu setările astea, 12 membri
 * pierd recompensa deja câștigată și 40 au nevoie de mai multe ștampile.
 * Salvezi?" Only the nonzero parts are worded.
 */
export function impactSentence(impact: ConfigImpact): string {
  const parts: string[] = [];
  if (impact.losesReward > 0) {
    parts.push(
      impact.losesReward === 1
        ? "un membru pierde recompensa deja câștigată"
        : `${impact.losesReward} membri pierd recompensa deja câștigată`,
    );
  }
  if (impact.needsMoreStamps > 0) {
    parts.push(
      impact.needsMoreStamps === 1
        ? "un membru are nevoie de mai multe ștampile"
        : `${impact.needsMoreStamps} membri au nevoie de mai multe ștampile`,
    );
  }
  return `Cu setările astea, ${parts.join(" și ")}. Salvezi?`;
}

/* ---------------------------------------------------------------- diff --- */

export interface ConfigChange {
  /** Dotted path, e.g. "gold.cycleLength" or "names.free_coffee.ro". */
  field: string;
  from: string;
  to: string;
}

/** How a leaf value reads in the Jurnal. */
function leaf(value: unknown): string {
  if (value === null || value === undefined) return "gol";
  if (typeof value === "boolean") return value ? "da" : "nu";
  if (Array.isArray(value)) return value.map(String).join(", ");
  return String(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * The leaves that differ between two configs, for the audit row of a save.
 * `updatedAt` is bookkeeping, not a decision, so it never shows up.
 */
export function configChanges(
  before: LoyaltyConfig,
  after: LoyaltyConfig,
): ConfigChange[] {
  const changes: ConfigChange[] = [];

  const walk = (a: unknown, b: unknown, path: string) => {
    if (isRecord(a) && isRecord(b)) {
      for (const key of new Set([...Object.keys(a), ...Object.keys(b)])) {
        walk(a[key], b[key], path === "" ? key : `${path}.${key}`);
      }
      return;
    }
    if (leaf(a) !== leaf(b)) changes.push({ field: path, from: leaf(a), to: leaf(b) });
  };

  walk({ ...before, updatedAt: null }, { ...after, updatedAt: null }, "");
  return changes;
}

/** "Program modificat: cycleLength: 5 -> 10; rewardValueCap: gol -> 25." */
export function configChangeSummary(changes: ConfigChange[]): string {
  if (changes.length === 0) return "Program salvat, fără modificări.";
  const listed = changes
    .map((change) => `${change.field}: ${change.from} -> ${change.to}`)
    .join("; ");
  return `Program modificat: ${listed}.`;
}
