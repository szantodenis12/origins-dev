import assert from "node:assert/strict";
import test from "node:test";

// Calendarul campaniei (lib/campaign-phase.ts): the instants are checked
// against the Bucharest wall clock, every boundary is checked one
// millisecond on each side, and the manual switches cannot skip the dates.
import {
  CAMPAIGN_INSTANTS,
  campaignNow,
  campaignPhase,
  canConfirmCollection,
  canPreregister,
  canPublishResults,
  canPublishToGallery,
  canSelectWinners,
  canSubmitAtCafe,
  canVote,
} from "../src/lib/campaign-phase.ts";
import { VOTE_CLOSES_AT } from "../src/lib/drawing.ts";
import { bucharestInstant } from "../src/lib/drawing-vote.ts";
import { sanitizeEventProps, isClientEventName } from "../src/lib/campaign-metrics.ts";

const at = (iso, deltaMs = 0) => new Date(new Date(iso).getTime() + deltaMs);

test("instants are the Bucharest wall-clock boundaries", () => {
  assert.equal(CAMPAIGN_INSTANTS.opensAt, bucharestInstant(2026, 11, 16).toISOString());
  assert.equal(CAMPAIGN_INSTANTS.submissionsCloseAt, bucharestInstant(2026, 12, 2).toISOString());
  assert.equal(CAMPAIGN_INSTANTS.voteClosesAt, bucharestInstant(2026, 12, 4).toISOString());
  assert.equal(CAMPAIGN_INSTANTS.announceFrom, bucharestInstant(2026, 12, 6).toISOString());
  // One close instant for the whole codebase.
  assert.equal(CAMPAIGN_INSTANTS.voteClosesAt, VOTE_CLOSES_AT);
});

test("date-driven phases flip exactly at each boundary", () => {
  const { opensAt, submissionsCloseAt, voteClosesAt } = CAMPAIGN_INSTANTS;
  assert.equal(campaignPhase(at(opensAt, -1)), "before_open");
  assert.equal(campaignPhase(at(opensAt)), "submissions_open");
  assert.equal(campaignPhase(at(submissionsCloseAt, -1)), "submissions_open");
  assert.equal(campaignPhase(at(submissionsCloseAt)), "voting_only");
  assert.equal(campaignPhase(at(voteClosesAt, -1)), "voting_only");
  assert.equal(campaignPhase(at(voteClosesAt)), "voting_closed");
});

test("results and collection are manual switches, never dates alone", () => {
  const late = new Date("2026-12-20T10:00:00Z");
  assert.equal(campaignPhase(late), "voting_closed");
  const published = { resultsPublishedAt: "2026-12-06T08:00:00Z", collectionConfirmedAt: null };
  assert.equal(campaignPhase(late, published), "results");
  assert.equal(
    campaignPhase(late, { ...published, collectionConfirmedAt: "2026-12-17T12:00:00Z" }),
    "collection",
  );
  // A stored switch cannot pull the campaign out of an earlier date phase.
  assert.equal(
    campaignPhase(at(CAMPAIGN_INSTANTS.voteClosesAt, -1), published),
    "voting_only",
  );
});

test("what each phase allows", () => {
  const table = {
    before_open: [false, false, false, false, false, false],
    submissions_open: [true, true, true, true, false, false],
    voting_only: [false, false, true, true, false, false],
    voting_closed: [false, false, false, false, true, false],
    results: [false, false, false, false, true, true],
    collection: [false, false, false, false, false, false],
  };
  for (const [phase, expected] of Object.entries(table)) {
    assert.deepEqual(
      [
        canPreregister(phase),
        canSubmitAtCafe(phase),
        canPublishToGallery(phase),
        canVote(phase),
        canSelectWinners(phase),
        canConfirmCollection(phase),
      ],
      expected,
      phase,
    );
  }
});

test("results cannot be published before the announcement day", () => {
  const { announceFrom } = CAMPAIGN_INSTANTS;
  assert.equal(canPublishResults(at(announceFrom, -1), "voting_closed"), false);
  assert.equal(canPublishResults(at(announceFrom), "voting_closed"), true);
  assert.equal(canPublishResults(at(announceFrom), "results"), false);
});

test("the test clock never applies in production", () => {
  const forced = "2026-12-02T10:00:00.000Z";
  assert.equal(
    campaignNow({ NODE_ENV: "development", CAMPAIGN_CLOCK: forced }).toISOString(),
    forced,
  );
  assert.notEqual(
    campaignNow({ NODE_ENV: "production", CAMPAIGN_CLOCK: forced }).toISOString(),
    forced,
  );
  // Garbage falls back to real time instead of throwing.
  assert.ok(Math.abs(campaignNow({ CAMPAIGN_CLOCK: "nope" }).getTime() - Date.now()) < 5000);
});

test("measurement props keep slugs and drop anything personal", () => {
  assert.deepEqual(
    sanitizeEventProps({
      location: "era",
      channel: "Instagram",
      category: "6-9",
      method: "whatsapp",
      name: "Ana",
    }),
    { location: "era", channel: "instagram", category: "6-9", method: "whatsapp" },
  );
  assert.deepEqual(sanitizeEventProps({ channel: "ana-0740038569" }), {});
  assert.deepEqual(sanitizeEventProps({ channel: "ana@gmail.com" }), {});
  assert.deepEqual(sanitizeEventProps({ channel: "Ana Pop" }), {});
  assert.equal(isClientEventName("share"), true);
  assert.equal(isClientEventName("vote_confirmed"), false); // server-only
});
