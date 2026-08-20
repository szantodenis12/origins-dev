import { tx, ui } from "./i18n";
import type { Lang, Product } from "./types";

/**
 * Romanian number formatting: comma decimals, no trailing ",00" on
 * whole numbers. Deterministic (no Intl) so server and client match.
 */
export function formatAmount(value: number): string {
  return Number.isInteger(value)
    ? String(value)
    : value.toFixed(2).replace(".", ",");
}

/** Google rating: 4.9 → "4,9". */
export function formatRating(value: number): string {
  return String(value).replace(".", ",");
}

export interface PriceParts {
  /** "de la 16" / "from 16" / "16" — the leading, bold part. */
  amount: string;
  /** "lei" / "lej" / "lejtől" — the small, muted part. */
  unit: string;
}

/** null when neither price nor priceFrom is confirmed → render nothing. */
export function priceParts(product: Product, lang: Lang): PriceParts | null {
  if (product.price !== null) {
    return { amount: formatAmount(product.price), unit: tx(ui.lei, lang) };
  }
  if (product.priceFrom !== null) {
    // Not tx(): ui.fromPrice.hu is intentionally empty ("16 lejtől" carries the
    // preposition in the unit) and tx() would fall back to the RO string.
    const prefix = lang === "ro" ? ui.fromPrice.ro : (ui.fromPrice[lang] ?? "");
    const amount = formatAmount(product.priceFrom);
    return {
      amount: prefix ? `${prefix} ${amount}` : amount,
      unit: tx(ui.fromUnit, lang),
    };
  }
  return null;
}

/** Same value as a single string, for the seasonal hero card. */
export function priceLabel(product: Product, lang: Lang): string | null {
  const parts = priceParts(product, lang);
  return parts ? `${parts.amount} ${parts.unit}` : null;
}
