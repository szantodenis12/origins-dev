"use client";

import { Check, Star } from "lucide-react";

/**
 * The card as a row of stamps: collected ones ticked, the last one starred
 * because it is the free drink. Length comes from the program settings
 * (`LoyaltyConfig.cycleLength`, 4 on a Gold card), never hardcoded.
 */
export default function StampRow({
  filled = 0,
  total = 5,
  bonusAt = null,
}: {
  filled?: number;
  total?: number;
  /** Optional mid-card reward, when the manager turned one on. */
  bonusAt?: number | null;
}) {
  return (
    <div className="my-3.5 flex gap-2" aria-hidden="true">
      {Array.from({ length: Math.max(1, total) }, (_, i) => {
        const index = i + 1;
        const isFull = index <= filled;
        return (
          <span
            key={index}
            className={
              isFull
                ? "flex size-[26px] items-center justify-center rounded-full border-[1.5px] border-sage bg-sage"
                : "flex size-[26px] items-center justify-center rounded-full border-[1.5px] border-sage"
            }
          >
            {isFull && (
              <Check className="size-[13px] text-olive" strokeWidth={3} />
            )}
            {!isFull && index === bonusAt && (
              <span className="text-[9px] font-extrabold text-sage-deep">
                +1
              </span>
            )}
            {!isFull && index === total && (
              <Star
                className="size-[11px] fill-sage-deep text-sage-deep"
                strokeWidth={1.5}
              />
            )}
          </span>
        );
      })}
    </div>
  );
}
