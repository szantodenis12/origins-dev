"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, Printer, RotateCcw } from "lucide-react";
import DrawingForm, { type DrawingFormStrings } from "@/components/DrawingForm";
import type { DrawingLocation } from "@/lib/drawing";
import { registerCounterDrawingAction } from "../actions";
import SheetKindPicker from "@/components/campaign-admin/SheetKindPicker";
import type { SheetKind } from "@/lib/db/campaign-rules";
import type { DrawingSignupState } from "@/lib/drawing-form";

/**
 * The same fields as /desen, Romanian only, posted by a barista with the
 * parent in front of them. After the save the screen turns into the label:
 * the code in 48px for the sticker, plus a print button.
 */

/** Staff screen: Romanian only. Shared with the campaign panel's counter form. */
export const counterStrings = {
  eyebrow: "Origins · concurs de desene",
  title: "Înscrie un desen",
  intro:
    "Completezi formularul împreună cu părintele, în cafenea. Formularul semnat pe hârtie rămâne la cafenea.",
  back: "Înapoi la listă",
  done: "Desen înscris",
  label: "Scrie codul pe eticheta de pe spatele desenului.",
  years: "ani",
  exhibitOnly:
    "Fără acord de reproducere sau desenat pe altă foaie: doar expus, nu poate ajunge pe pahar.",
  print: "Printează eticheta",
  another: "Înscrie alt desen",
  form: {
    parentName: "Numele părintelui sau al tutorelui",
    phone: "Telefon",
    phoneHint: "Îl folosim ca să sunăm părintele dacă desenul e selectat și ca să-l identificăm când ridică desenul sau premiul.",
    childName: "Prenumele copilului",
    childAge: "Vârsta",
    ageHint: "Între 3 și 14 ani. Categoria se stabilește automat: 3–5, 6–9, 10–14.",
    category: "Categoria",
    categoryYears: "ani",
    location: "Cafeneaua unde rămâne desenul",
    consentParticipation:
      "Părintele sau tutorele e de acord cu participarea copilului la concurs și cu regulamentul.",
    consentReproduction:
      "E de acord ca, dacă desenul e selectat și acceptă premiul, să fie tipărit pe paharele Origins și folosit în materialele de comunicare ale campaniei.",
    reproductionNote:
      "Fără acest acord, desenul va fi expus în cafenea, dar nu poate fi ales pentru pahare sau alte materiale.",
    consentAttribution:
      "E de acord ca prenumele și vârsta copilului să apară pe pahar, în galerie și în anunțul rezultatelor. Fără bifă, apar doar codul desenului și grupa de vârstă.",
    consentGallery:
      "E de acord ca desenul să fie publicat în galeria online xmas.originscafe.ro. Pagina lui o poate vedea oricine are linkul.",
    galleryNote:
      "Online apar desenul, codul desenului și grupa de vârstă; prenumele și vârsta, doar cu acordul pentru nume. Fără acordul pentru galerie, desenul nu apare pe internet și nu intră la votul public; juriul îl vede oricum.",
    consentPhoto:
      "E de acord să fie fotografiați sau filmați (copilul și/sau părintele) la anunțarea rezultatelor și la evenimentul de premiere, pentru comunicarea campaniei pe canalele Origins.",
    circleOptIn: "E de acord să primească informații despre Origins Circle, programul de fidelitate Origins, la telefonul de mai sus.",
    submit: "Înscrie desenul",
    pending: "Se înscrie...",
    errors: {
      parent: "Scrie numele părintelui sau al tutorelui (3–60 de caractere).",
      phone: "Numărul de telefon nu arată a număr românesc. Exemplu: 07xx xxx xxx.",
      child: "Scrie prenumele copilului (2–40 de caractere).",
      age: "Vârsta copilului este un număr întreg între 3 și 14.",
      location: "Alege cafeneaua.",
      consent: "Bifează acordul de participare.",
      rate: "Prea multe înscrieri. Mai încearcă peste câteva minute.",
      failed: "Nu am putut salva înscrierea. Sesiunea a expirat sau datele nu sunt valide.",
      not_open: "Depunerile încep pe 16.11.2026. Până atunci nu se înscrie niciun desen.",
      closed: "Depunerile s-au încheiat pe 01.12.2026. Desenul se poate expune, dar nu mai intră în concurs.",
    },
  } satisfies DrawingFormStrings,
};

/** A bare page with the label, so the browser's print dialog prints only that. */
export function printLabel(code: string, line: string, location: string) {
  const w = window.open("", "_blank", "width=420,height=320");
  if (!w) return;
  const esc = (s: string) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  w.document.write(
    `<!doctype html><html lang="ro"><head><meta charset="utf-8"><title>${esc(code)}</title>` +
      `<style>body{margin:0;padding:24px;font-family:system-ui,sans-serif;color:#1d1d1f}` +
      `.code{font-size:48px;font-weight:800;letter-spacing:-0.02em}` +
      `.line{margin-top:8px;font-size:16px}.loc{margin-top:4px;font-size:13px;color:#6a7355}</style></head>` +
      `<body><div class="code">${esc(code)}</div><div class="line">${esc(line)}</div>` +
      `<div class="loc">${esc(location)}</div><script>window.print()</script></body></html>`,
  );
  w.document.close();
}

const strings = counterStrings;

export default function DrawingCounterForm({
  locations,
  defaultLocation,
}: {
  locations: { slug: DrawingLocation; name: string }[];
  defaultLocation: DrawingLocation | null;
}) {
  // The drawing is in the café: registering also records it as handed in.
  const [sheetKind, setSheetKind] = useState<SheetKind>("oficiala");
  const register = (prev: DrawingSignupState, formData: FormData) => {
    formData.set("sheetKind", sheetKind);
    return registerCounterDrawingAction(prev, formData);
  };
  return (
    <div className="pb-8">
      <div className="px-5 pt-[22px] pb-1.5">
        <Link
          href="/admin/desene"
          className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-sage-deep"
        >
          <ArrowLeft className="size-[14px]" strokeWidth={2.25} />
          {strings.back}
        </Link>
        <div className="mt-3 text-[11px] font-bold tracking-[0.18em] text-sage-deep uppercase">
          {strings.eyebrow}
        </div>
        <h1 className="mt-1 mb-2 text-[28px] font-extrabold tracking-[-0.02em]">
          {strings.title}
        </h1>
        <p className="text-[13.5px] leading-[1.5] text-ink/72">{strings.intro}</p>
        <div className="mt-4">
          <SheetKindPicker value={sheetKind} onChange={setSheetKind} tone="origins" />
        </div>
      </div>

      <DrawingForm
        action={register}
        strings={strings.form}
        locations={locations}
        defaultLocation={defaultLocation}
        renderDone={(done, reset) => {
          const line = `${done.childFirstName}, ${done.childAge} ${strings.years} · ${done.category}`;
          const locationName =
            locations.find((item) => item.slug === done.location)?.name ?? done.location;
          return (
            <section className="px-5 pt-2">
              <div className="text-[11px] font-bold tracking-[0.18em] text-sage-deep uppercase">
                {strings.done}
              </div>
              {/* The label block: what goes on the sticker, at sticker size. */}
              <div className="mt-2 rounded-card border-[1.5px] border-sage p-5">
                <div className="text-[48px] leading-none font-extrabold tracking-[-0.02em] tabular-nums">
                  {done.code}
                </div>
                <div className="mt-2 text-[15px] font-semibold text-ink">{line}</div>
                <div className="mt-0.5 text-[12.5px] text-sage-deep">{locationName}</div>
              </div>
              <p className="mt-3 text-[13px] leading-[1.5] text-ink/72">{strings.label}</p>
              {!done.eligible && (
                <p className="mt-2 rounded-card bg-cream px-4 py-3 text-[12.5px] leading-[1.5] text-ink/72">
                  {strings.exhibitOnly}
                </p>
              )}
              <button
                type="button"
                onClick={() => printLabel(done.code, line, locationName)}
                className="mt-4 flex w-full items-center justify-center gap-2 rounded-btn bg-ink p-[13px] text-[14px] font-semibold text-paper"
              >
                <Printer className="size-[16px]" strokeWidth={2} />
                {strings.print}
              </button>
              <button
                type="button"
                onClick={reset}
                className="mt-2.5 flex w-full items-center justify-center gap-2 rounded-btn border border-line bg-paper p-[13px] text-[14px] font-semibold text-ink"
              >
                <RotateCcw className="size-[16px] text-sage-deep" strokeWidth={2} />
                {strings.another}
              </button>
            </section>
          );
        }}
      />
    </div>
  );
}
