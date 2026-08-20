/** Pure age math — tested under `node --test`, keep it dependency-free. */

export interface BirthDate {
  day: number;
  month: number;
  year: number;
}

/** Completed years on `now`, birthday counted from midnight local time. */
export function ageOn(birth: BirthDate, now: Date): number {
  const hadBirthdayThisYear =
    now.getMonth() + 1 > birth.month ||
    (now.getMonth() + 1 === birth.month && now.getDate() >= birth.day);
  return now.getFullYear() - birth.year - (hadBirthdayThisYear ? 0 : 1);
}

/** GDPR art. 8, Romanian threshold: below this age a parent must consent. */
export const PARENTAL_CONSENT_AGE = 16;
