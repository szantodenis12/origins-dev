import type { PushSegment } from "@/lib/db";
import { TIMEZONE } from "@/lib/loyalty";

/**
 * Shared between the page, the server functions and the client composer.
 * Plain module on purpose: no "use server", no "use client".
 */

/** Apple shows very little of a pass message on the lock screen. */
export const MAX_MESSAGE = 178;

/**
 * The segments the manager may pick. `families` exists in the type but is not
 * offered here: nothing in the signup flow marks a member as a family yet.
 */
export const SEGMENTS: { value: PushSegment; label: string }[] = [
  { value: "all", label: "Toți membrii" },
  { value: "students", label: "Elevi și studenți" },
  { value: "gold", label: "Membri Gold" },
  { value: "ro", label: "Membri RO" },
  { value: "hu", label: "Membri HU" },
];

export function isOfferedSegment(value: string): value is PushSegment {
  return SEGMENTS.some((segment) => segment.value === value);
}

export function segmentLabel(value: PushSegment): string {
  return SEGMENTS.find((segment) => segment.value === value)?.label ?? value;
}

const dateParts = new Intl.DateTimeFormat("en-GB", {
  timeZone: TIMEZONE,
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

/**
 * "25.07.2026" in Bucharest time, whatever the server timezone is. Same Intl
 * approach as `formatBucharestTime`, built from parts so the separator is ours
 * and server and client render the identical string.
 */
export function formatBucharestDate(at: Date | string): string {
  const date = typeof at === "string" ? new Date(at) : at;
  const parts = dateParts.formatToParts(date);
  const find = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? "";
  return `${find("day")}.${find("month")}.${find("year")}`;
}

const dateTimeParts = new Intl.DateTimeFormat("en-GB", {
  timeZone: TIMEZONE,
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

/** "25.07.2026 · 16:30" in Bucharest, including the exact Gold deadline. */
export function formatBucharestDateTime(at: Date | string): string {
  const date = typeof at === "string" ? new Date(at) : at;
  const parts = dateTimeParts.formatToParts(date);
  const find = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? "";
  return `${find("day")}.${find("month")}.${find("year")} · ${find("hour")}:${find("minute")}`;
}
