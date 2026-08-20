"use client";

import Link from "next/link";
import { Wallet } from "lucide-react";
import { tx, ui, useLang } from "@/lib/i18n";
import type { I18nText } from "@/lib/types";
import StampRow from "./StampRow";

/**
 * The loyalty pitch on a location page. Every number in it is generated from
 * the program settings on the server (lib/program-copy.ts) — the block itself
 * states nothing it was not given.
 */
export default function LoyaltyBlock({
  summary,
  cycleLength,
  midRewardAt,
  doubleStampText,
}: {
  summary: I18nText;
  cycleLength: number;
  midRewardAt: number | null;
  doubleStampText: I18nText | null;
}) {
  const { lang } = useLang();

  return (
    <section className="mx-5 mt-3.5 mb-2.5 rounded-card border-[1.5px] border-sage p-5">
      <h3 className="font-[family-name:var(--font-serif)] text-[21px] font-medium tracking-[-0.01em]">
        {tx(ui.cardTitle, lang)}
      </h3>
      <p className="mt-1 text-[13.5px] text-ink/72">{tx(summary, lang)}</p>

      <StampRow total={cycleLength} bonusAt={midRewardAt} />

      <Link
        href="/card"
        className="flex w-full items-center justify-center gap-2 rounded-btn bg-ink p-[15px] text-[15px] font-semibold text-paper"
      >
        <Wallet className="size-[18px]" strokeWidth={2} />
        {tx(ui.addToWallet, lang)}
      </Link>

      {doubleStampText && (
        <p className="mt-2.5 text-center text-[12.5px] font-semibold text-sage-deep">
          {tx(doubleStampText, lang)}
        </p>
      )}
    </section>
  );
}
