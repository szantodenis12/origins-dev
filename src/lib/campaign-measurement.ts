import { normalizePhone } from "./phone.ts";
import {
  CLIENT_EVENTS,
  SERVER_EVENTS,
  type CampaignEvent,
  type CampaignEventName,
} from "./campaign-metrics.ts";

/**
 * The manager's "Măsurare" screen, computed once, pure. Events give the
 * funnel (totals per event, per day, per channel, per café); the stored
 * entries give what events cannot: how many preregistrations turned into a
 * drawing in a café, and how many FAMILIES took part (distinct parent
 * phones among physically submitted drawings: two children of one parent
 * are one family). Only numbers come out of here, never a phone.
 */

export interface MeasurementEntry {
  phone: string;
  location: string;
  registeredVia: "web" | "counter";
  submittedAt: string | null;
  status: string;
}

export interface CampaignMeasurement {
  totals: Record<CampaignEventName, number>;
  /** "2026-11-16" (Bucharest day) -> event -> count, oldest day first. */
  perDay: { day: string; counts: Partial<Record<CampaignEventName, number>> }[];
  /** Channel slug ("fara-canal" when none) -> event -> count, biggest first. */
  perChannel: { channel: string; counts: Partial<Record<CampaignEventName, number>> }[];
  /** Café slug ("fara-cafenea" when none) -> event -> count. */
  perLocation: { location: string; counts: Partial<Record<CampaignEventName, number>> }[];
  entries: {
    preregistered: number;
    walkIns: number;
    submitted: number;
    preregisteredSubmitted: number;
    /** preregisteredSubmitted / preregistered, 0..1; null with no preregistration. */
    conversion: number | null;
    families: number;
    perLocation: { location: string; preregistered: number; submitted: number; families: number }[];
  };
}

export const NO_CHANNEL = "fara-canal";
export const NO_LOCATION = "fara-cafenea";

const ALL_EVENTS: CampaignEventName[] = [...SERVER_EVENTS, ...CLIENT_EVENTS];

/** The Bucharest calendar day of an instant, "YYYY-MM-DD". */
export function bucharestDay(iso: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Bucharest",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(iso));
}

function submitted(entry: MeasurementEntry): boolean {
  return entry.submittedAt !== null || entry.status !== "inregistrat";
}

/** Distinct parent phones among the given entries; the phones never leave. */
export function countFamilies(entries: { phone: string }[]): number {
  const phones = new Set<string>();
  for (const entry of entries) phones.add(normalizePhone(entry.phone) ?? entry.phone.trim());
  return phones.size;
}

function bump(
  map: Map<string, Partial<Record<CampaignEventName, number>>>,
  key: string,
  name: CampaignEventName,
) {
  const counts = map.get(key) ?? {};
  counts[name] = (counts[name] ?? 0) + 1;
  map.set(key, counts);
}

const sum = (counts: Partial<Record<CampaignEventName, number>>) =>
  Object.values(counts).reduce((a, b) => a + (b ?? 0), 0);

export function campaignMeasurement(
  events: CampaignEvent[],
  entries: MeasurementEntry[],
): CampaignMeasurement {
  const totals = Object.fromEntries(ALL_EVENTS.map((name) => [name, 0])) as Record<
    CampaignEventName,
    number
  >;
  const days = new Map<string, Partial<Record<CampaignEventName, number>>>();
  const channels = new Map<string, Partial<Record<CampaignEventName, number>>>();
  const locations = new Map<string, Partial<Record<CampaignEventName, number>>>();
  for (const event of events) {
    totals[event.name] = (totals[event.name] ?? 0) + 1;
    bump(days, bucharestDay(event.createdAt), event.name);
    bump(channels, event.channel ?? NO_CHANNEL, event.name);
    bump(locations, event.location ?? NO_LOCATION, event.name);
  }

  const web = entries.filter((entry) => entry.registeredVia === "web");
  const handedIn = entries.filter(submitted);
  const webHandedIn = web.filter(submitted);
  const locationSlugs = [...new Set(entries.map((entry) => entry.location))].sort();

  return {
    totals,
    perDay: [...days.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([day, counts]) => ({ day, counts })),
    perChannel: [...channels.entries()]
      .sort(([a, x], [b, y]) => sum(y) - sum(x) || a.localeCompare(b))
      .map(([channel, counts]) => ({ channel, counts })),
    perLocation: [...locations.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([location, counts]) => ({ location, counts })),
    entries: {
      preregistered: web.length,
      walkIns: entries.length - web.length,
      submitted: handedIn.length,
      preregisteredSubmitted: webHandedIn.length,
      conversion: web.length > 0 ? webHandedIn.length / web.length : null,
      families: countFamilies(handedIn),
      perLocation: locationSlugs.map((location) => {
        const here = entries.filter((entry) => entry.location === location);
        const hereIn = here.filter(submitted);
        return {
          location,
          preregistered: here.filter((entry) => entry.registeredVia === "web").length,
          submitted: hereIn.length,
          families: countFamilies(hereIn),
        };
      }),
    },
  };
}
