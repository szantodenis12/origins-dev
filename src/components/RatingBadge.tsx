"use client";

import { Star } from "lucide-react";
import { tx, ui, useLang } from "@/lib/i18n";
import { formatRating } from "@/lib/format";
import type { Location } from "@/lib/types";

/**
 * Google rating pill. Renders nothing when the listing is not confirmed —
 * never show a rating we cannot back up.
 */
export default function RatingBadge({
  location,
  asLink = true,
}: {
  location: Location;
  asLink?: boolean;
}) {
  const { lang } = useLang();

  if (location.googleRating === null) return null;

  const inner = (
    <>
      <Star className="size-3.5 fill-star text-star" strokeWidth={1} />
      <b>{formatRating(location.googleRating)}</b>
      {location.googleReviewCount !== null && (
        <span className="font-medium text-muted">
          {location.googleReviewCount} {tx(ui.reviewsGoogle, lang)}
        </span>
      )}
    </>
  );

  const className =
    "inline-flex items-center gap-1.5 rounded-full border border-line px-3 py-[7px] text-[13px] font-semibold text-ink";

  if (asLink && location.reviewUrl) {
    return (
      <a
        href={location.reviewUrl}
        target="_blank"
        rel="noopener noreferrer"
        className={className}
      >
        {inner}
      </a>
    );
  }

  return <span className={className}>{inner}</span>;
}
