"use client";

import { useState } from "react";
import { Printer, RotateCcw } from "lucide-react";
import { registerCounterDrawingAction } from "@/app/admin/desene/actions";
import { counterStrings, printLabel } from "@/app/admin/desene/nou/DrawingCounterForm";
import DrawingForm from "@/components/DrawingForm";
import type { DrawingLocation } from "@/lib/drawing";
import type { DrawingSignupState } from "@/lib/drawing-form";
import type { SheetKind } from "@/lib/db/campaign-rules";
import SheetKindPicker from "./SheetKindPicker";
import { BTN_PRIMARY, BTN_QUIET, NOTE } from "./ui";

/**
 * Registration at the counter, from the campaign panel. The fields, the
 * texts of the consents and the server function are the ones the Origins
 * admin uses (one form, one set of words for the parent to hear); only the
 * frame around them and the "done" card belong to this panel. The drawing
 * is in the café, so the registration also records it as handed in, with
 * the sheet kind picked above the form.
 */
export default function CampaignCounterForm({
  locations,
}: {
  locations: { slug: DrawingLocation; name: string }[];
}) {
  const [sheetKind, setSheetKind] = useState<SheetKind>("oficiala");
  const register = (prev: DrawingSignupState, formData: FormData) => {
    formData.set("sheetKind", sheetKind);
    return registerCounterDrawingAction(prev, formData);
  };
  return (
    <div>
      <h1 className="text-[30px] leading-[1.1] font-extrabold tracking-[-0.02em]">
        {counterStrings.title}
      </h1>
      <p className="mt-2 text-[15.5px] leading-[1.5] text-o-ink/70">{counterStrings.intro}</p>

      <div className="mt-4">
        <SheetKindPicker value={sheetKind} onChange={setSheetKind} />
      </div>

      <div className="mt-4">
        <DrawingForm
          flush
          action={register}
          strings={counterStrings.form}
          locations={locations}
          defaultLocation={null}
          renderDone={(done, reset) => {
            const line = `${done.childFirstName}, ${done.childAge} ${counterStrings.years} · ${done.category}`;
            const locationName =
              locations.find((item) => item.slug === done.location)?.name ?? done.location;
            return (
              <section className="flex flex-col gap-3">
                <div className="rounded-3xl border-2 border-o-ink p-6">
                  <p className="text-[15px] font-semibold text-o-ink/65">{counterStrings.done}</p>
                  <p className="mt-2 text-[64px] leading-none font-extrabold tracking-[-0.02em] tabular-nums">
                    {done.code}
                  </p>
                  <p className="mt-3 text-[17px] font-semibold">{line}</p>
                  <p className="mt-0.5 text-[14.5px] text-o-ink/60">{locationName}</p>
                </div>
                <p className="text-[15px] leading-[1.5] text-o-ink/80">{counterStrings.label}</p>
                {!done.eligible && <p className={NOTE}>{counterStrings.exhibitOnly}</p>}
                <button
                  type="button"
                  onClick={() => printLabel(done.code, line, locationName)}
                  className={BTN_PRIMARY}
                >
                  <Printer className="size-[19px]" strokeWidth={1.75} />
                  {counterStrings.print}
                </button>
                <button type="button" onClick={reset} className={BTN_QUIET}>
                  <RotateCcw className="size-[18px]" strokeWidth={1.75} />
                  {counterStrings.another}
                </button>
              </section>
            );
          }}
        />
      </div>
    </div>
  );
}
