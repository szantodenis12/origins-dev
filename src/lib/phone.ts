/**
 * Romanian phone numbers — pure helpers, no I/O (tests run this under
 * `node --test`, same as loyalty.ts).
 *
 * The phone is the member's unique identifier (one member = one card), so
 * "0740 038 569", "+40740038569" and "0040-740-038-569" must all collapse
 * to the same canonical form before any comparison.
 */

/** Canonical national format: "0740038569". Null when clearly not a RO number. */
export function normalizePhone(raw: string): string | null {
  let digits = raw.replace(/[\s.\-()]/g, "");
  if (digits.startsWith("+40")) digits = `0${digits.slice(3)}`;
  else if (digits.startsWith("0040")) digits = `0${digits.slice(4)}`;
  if (!/^0\d{9}$/.test(digits)) return null;
  return digits;
}

/** "0740038569" -> "0740 038 569" for display. */
export function formatPhone(canonical: string): string {
  return `${canonical.slice(0, 4)} ${canonical.slice(4, 7)} ${canonical.slice(7)}`;
}
