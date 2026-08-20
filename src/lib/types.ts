export type Lang = "ro" | "hu" | "en";

/** Text in the three public languages. HU and EN fall back to RO when absent. */
export interface I18nText {
  ro: string;
  hu?: string;
  en?: string;
}

export interface Location {
  slug: string;
  name: string;
  address: I18nText | null;
  /** Human-readable opening hours; null = "de confirmat" — render nothing. */
  hours: I18nText | null;
  /**
   * Hours that change with the season (Orășelul Copiilor: a park, open
   * March-October on a different clock each month). Keyed by month, 1-12; a
   * month that is not listed falls back to `hours`, so an unlisted month with
   * `hours: null` shows nothing rather than a guessed schedule.
   */
  hoursByMonth?: Record<number, I18nText>;
  /** True while the location is announced but not yet open. */
  comingSoon: boolean;
  /** Seasonal note (e.g. Orășelul: martie–octombrie). */
  seasonalNote: I18nText | null;
  googlePlaceId: string | null;
  /** Cached Google rating; null = no listing yet → show nothing, never fake. */
  googleRating: number | null;
  googleReviewCount: number | null;
  /** Write-review deep link; null until place id is confirmed. */
  reviewUrl: string | null;
  /** Wolt venue URL; null = not confirmed yet → hide button. */
  woltUrl: string | null;
  /** null = to confirm with client (never guess where alcohol is sold). */
  servesAlcohol: boolean | null;
  /** Card photo (home list + atmosphere band); undefined = no image band. */
  photo?: string;
  /** Full-bleed photo behind the name on the location page; undefined = flat olive. */
  heroPhoto?: string;
}

export interface Category {
  slug: string;
  name: I18nText;
  order: number;
  /** Banner photo behind the category name; undefined = plain serif heading. */
  photo?: string;
}

export interface Product {
  id: string;
  categorySlug: string;
  name: I18nText;
  description: I18nText | null;
  /** Price in lei; use priceFrom for unconfirmed exact prices. */
  price: number | null;
  /** "de la X lei" when only a range/minimum is verified. */
  priceFrom: number | null;
  /** Location slugs where available; null = all locations. */
  locations: string[] | null;
  /** Contains alcohol → only shown where servesAlcohol === true. */
  alcohol: boolean;
  seasonal: boolean;
  /** Square thumb on the menu row; undefined = text-only row. */
  photo?: string;
}
