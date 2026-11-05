"use client";

import { useLayoutEffect, useRef } from "react";

const STORAGE_KEY = "origins-staff-location";

/**
 * The cafenea picker on the shift screen, remembering the last choice.
 *
 * The phone lives on one counter, so the cafenea is a property of the device,
 * not of the person holding it — but the list is ordered for the public site
 * and opens on ERA, which is wrong everywhere else. A personal code only
 * works at the cafenea it was issued for, so a forgotten selection reads as
 * "Cod greșit" with a perfectly good code in hand.
 *
 * The saved value is written to the DOM after mount rather than rendered, so
 * the server HTML and the first client render stay identical and localStorage
 * being unavailable (private mode, blocked storage) costs nothing.
 *
 * Restoring it must never overrule the person. The select works from the
 * moment the HTML lands, which is before React hydrates, so somebody can
 * already have chosen a cafenea by the time this runs — and silently putting
 * it back would send a perfectly good code to the wrong cafenea, the exact
 * failure this component exists to prevent. Hence: run before paint, and only
 * when the select is untouched and still sitting on the server's default.
 */
export default function LocationSelect({
  locations,
  className,
}: {
  locations: { slug: string; name: string }[];
  className?: string;
}) {
  const ref = useRef<HTMLSelectElement>(null);
  const touched = useRef(false);
  const serverDefault = locations[0]?.slug;

  useLayoutEffect(() => {
    const select = ref.current;
    if (!select || touched.current) return;
    // Changed before hydration: that choice is the person's, and it stands.
    if (select.value !== serverDefault) return;
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      // A cafenea that was removed or set to "în curând" since the last shift
      // is no longer in the list; the default stands.
      if (saved && [...select.options].some((o) => o.value === saved)) {
        select.value = saved;
      }
    } catch {
      // Storage unavailable: the default selection is still perfectly usable.
    }
  }, [serverDefault]);

  return (
    <select
      ref={ref}
      id="locationSlug"
      name="locationSlug"
      defaultValue={serverDefault}
      onPointerDown={() => {
        touched.current = true;
      }}
      onKeyDown={() => {
        touched.current = true;
      }}
      onChange={(event) => {
        touched.current = true;
        try {
          window.localStorage.setItem(STORAGE_KEY, event.target.value);
        } catch {
          // Not remembering is a small annoyance, not a failure.
        }
      }}
      className={className}
    >
      {locations.map((location) => (
        <option key={location.slug} value={location.slug}>
          {location.name}
        </option>
      ))}
    </select>
  );
}
