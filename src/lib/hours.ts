import type { I18nText, Location } from "./types";

/**
 * Opening hours that depend on the month.
 *
 * Only Orășelul Copiilor needs this today: it is a park kiosk and its clock
 * moves through the season. The public pages show the hours in a small pill
 * next to "Deschis", so they show the month the visitor is actually standing
 * in — printing four months into that pill would be unreadable and would still
 * leave them working out which line applies to today.
 */

/** The hours in force in `now`'s month; null = nothing confirmed → render nothing. */
export function hoursFor(location: Location, now: Date): I18nText | null {
  return location.hoursByMonth?.[now.getMonth() + 1] ?? location.hours;
}

/**
 * The location as the public pages should render it. Resolving here, on the
 * server, keeps `new Date()` out of the client components — the month must not
 * be decided twice, or a page rendered either side of midnight on the 1st
 * would hydrate with two different schedules.
 *
 * The admin keeps reading the unresolved row, so the manager still edits the
 * stored value and never a month's projection of it.
 */
export function forPublic(location: Location, now: Date = new Date()): Location {
  const hours = hoursFor(location, now);
  return hours === location.hours ? location : { ...location, hours };
}
