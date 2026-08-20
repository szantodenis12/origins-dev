"use client";

import Link from "next/link";
import { ChevronRight, GraduationCap } from "lucide-react";
import { tx, ui, useLang } from "@/lib/i18n";

export default function StudentBanner() {
  const { lang } = useLang();

  return (
    <Link
      href="/card?student=1"
      className="mx-5 mt-1 mb-2.5 flex items-center gap-4 rounded-card bg-black p-5 text-paper"
    >
      <GraduationCap
        className="size-[30px] shrink-0 text-sage"
        strokeWidth={2}
      />
      <div>
        <h3 className="text-[16px] font-extrabold tracking-[-0.01em]">
          {tx(ui.studentTitle, lang)}
        </h3>
        <p className="mt-[3px] text-[13px] leading-[1.45] text-sage/85">
          {tx(ui.studentBody, lang)}
        </p>
      </div>
      <ChevronRight className="ml-auto size-5 shrink-0" strokeWidth={2} />
    </Link>
  );
}
