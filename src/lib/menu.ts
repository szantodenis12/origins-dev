import type { Location, Product } from "./types";

/**
 * Pure menu rules, shared by the public pages and the admin. Since phase 5
 * the product list comes from the Db (`getDb().listProducts()`), not from
 * `data.ts` — these helpers only filter what they are given.
 */

/** Products visible at a location: availability + alcohol rules. */
export function productsForLocation(
  products: Product[],
  location: Location,
): Product[] {
  return products.filter((p) => {
    if (p.locations && !p.locations.includes(location.slug)) return false;
    if (p.alcohol && location.servesAlcohol !== true) return false;
    return true;
  });
}

/** The seasonal hero drink (summer: limonada cu mango). */
export function seasonalHero(products: Product[]): Product | undefined {
  return products.find((p) => p.seasonal);
}
