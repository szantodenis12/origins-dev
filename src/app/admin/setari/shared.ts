import type { PerkId } from "@/lib/program";

/**
 * Shared between the program form and its server action — a plain module, not
 * "use server", so the page can import it without turning a lookup table into
 * a POST endpoint.
 */

export const PERK_ROTATIONS: Record<string, PerkId[]> = {
  addon_then_coffee: ["gold_addon", "gold_coffee"],
  coffee_then_addon: ["gold_coffee", "gold_addon"],
  addon_only: ["gold_addon"],
  coffee_only: ["gold_coffee"],
};

/** Staff screen: Romanian only. */
export const ROTATION_LABELS: Record<string, string> = {
  addon_then_coffee: "Întâi extra, apoi cafeaua în plus",
  coffee_then_addon: "Întâi cafeaua în plus, apoi extra",
  addon_only: "Doar extra, în fiecare perioadă",
  coffee_only: "Doar cafeaua în plus, în fiecare perioadă",
};

/** Which rotation option matches what is saved. */
export function rotationKey(rotation: PerkId[]): string {
  const match = Object.entries(PERK_ROTATIONS).find(
    ([, value]) =>
      value.length === rotation.length &&
      value.every((id, i) => id === rotation[i]),
  );
  return match ? match[0] : "addon_then_coffee";
}

export const WEEKDAY_OPTIONS = [
  { value: 1, label: "Luni" },
  { value: 2, label: "Marți" },
  { value: 3, label: "Miercuri" },
  { value: 4, label: "Joi" },
  { value: 5, label: "Vineri" },
  { value: 6, label: "Sâmbătă" },
  { value: 0, label: "Duminică" },
];
