"use client";

import { SHEET_KIND_LABEL } from "@/lib/campaign-guards";
import { SHEET_KINDS, type SheetKind } from "@/lib/db/campaign-rules";

/**
 * "Pe ce e desenat?" for the counter forms of both panels. Controlled: the
 * caller adds the value to the registration it posts. "Altă foaie" is
 * accepted and exhibited, but never printable (regulament art. 6.4).
 */
export default function SheetKindPicker({
  value,
  onChange,
  tone = "campaign",
}: {
  value: SheetKind;
  onChange: (kind: SheetKind) => void;
  tone?: "campaign" | "origins";
}) {
  const on = tone === "campaign" ? "bg-o-ink text-white border-o-ink" : "bg-ink text-paper border-ink";
  const off = tone === "campaign" ? "border-o-ink/20 bg-white text-o-ink" : "border-line bg-paper text-ink";
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-2 text-[14px] font-semibold">Pe ce e desenat?</legend>
      <div className="grid grid-cols-3 gap-2">
        {SHEET_KINDS.map((kind) => (
          <button
            key={kind}
            type="button"
            aria-pressed={value === kind}
            onClick={() => onChange(kind)}
            className={`min-h-[48px] rounded-2xl border px-2 text-[14px] font-semibold ${value === kind ? on : off}`}
          >
            {SHEET_KIND_LABEL[kind]}
          </button>
        ))}
      </div>
      {value === "alta-foaie" && (
        <p className="text-[13.5px] leading-[1.45] opacity-75">
          Pe altă foaie desenul se expune și poate apărea online, dar nu poate ajunge pe pahar.
        </p>
      )}
    </fieldset>
  );
}
