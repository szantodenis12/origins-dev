import assert from "node:assert/strict";
import test from "node:test";

import { forPublic, hoursFor } from "../src/lib/hours.ts";
import { getLocation } from "../src/lib/data.ts";

/**
 * Orășelul Copiilor is a park kiosk on a different clock each month. The point
 * of these tests is the boundary: a month the client has NOT given must show
 * nothing, never the neighbouring month's schedule.
 */

const oraselul = getLocation("oraselul");
const era = getLocation("era");
const on = (month) => new Date(Date.UTC(2026, month - 1, 15, 12, 0, 0));

test("the seasonal cafenea shows the hours of the month you are in", () => {
  assert.equal(hoursFor(oraselul, on(7)).ro, "09:00 - 21:00");
  assert.equal(hoursFor(oraselul, on(8)).ro, "10:00 - 22:00");
  assert.equal(hoursFor(oraselul, on(9)).ro, "09:00 - 21:00");
  assert.equal(hoursFor(oraselul, on(10)).ro, "10:00 - 20:00");
});

test("a month with no confirmed schedule renders nothing, never a neighbour's", () => {
  // March-June are inside the open season but were never given to us, and
  // November-February the park is shut. Both must stay blank.
  for (const month of [1, 3, 5, 6, 11, 12]) {
    assert.equal(
      hoursFor(oraselul, on(month)),
      null,
      `month ${month} must not borrow another month's hours`,
    );
  }
});

test("a cafenea with one schedule is unaffected all year", () => {
  for (const month of [1, 7, 8, 12]) {
    assert.equal(hoursFor(era, on(month)).ro, "L-D 09:00 - 21:00");
  }
  // Nothing to resolve: the same object comes back, so the public pages do not
  // copy every location on every request.
  assert.equal(forPublic(era, on(8)), era);
});

test("forPublic resolves without mutating the stored row", () => {
  const august = forPublic(oraselul, on(8));
  assert.equal(august.hours.ro, "10:00 - 22:00");
  assert.equal(august.slug, oraselul.slug);

  // The seed row keeps its unresolved value, so the admin still edits the
  // stored field and not one month's projection of it.
  assert.equal(oraselul.hours, null);
  assert.equal(getLocation("oraselul").hours, null);
});
