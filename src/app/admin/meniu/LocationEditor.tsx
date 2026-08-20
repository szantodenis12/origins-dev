"use client";

import { useActionState, useId, useState } from "react";
import { Check, ChevronDown, Loader2 } from "lucide-react";
import ImageField from "./ImageField";
import { saveLocationAction } from "./actions";
import {
  CheckField,
  SaveNotice,
  fieldClass,
  hintClass,
  labelClass,
  pillClass,
  primaryButton,
} from "./ui";
import type { Location } from "@/lib/types";
import { formatRating } from "@/lib/format";

/** Staff screen: Romanian only. */
const strings = {
  comingSoon: "În curând",
  hoursMissing: "Orar de confirmat",
  hoursRo: "Orar în română",
  hoursHu: "Orar în maghiară",
  hoursHint: "Gol = de confirmat, nu apare public.",
  hoursSeasonal: "Orar pe luni",
  hoursSeasonalHint:
    "Cafeneaua are orar diferit pe luni; public se afișează luna curentă. Câmpul de mai jos e orarul pentru lunile nelistate.",
  wolt: "Link Wolt",
  woltHint: "Gol = butonul Wolt nu apare.",
  alcohol: "Alcool",
  yes: "Da",
  no: "Nu",
  unknown: "Neconfirmat",
  alcoholHint:
    "Neconfirmat ascunde produsele cu alcool, la fel ca Nu.",
  google: "Google",
  googleHint: "manual, până la sincronizarea automată",
  rating: "Rating",
  reviews: "Număr recenzii",
  placeId: "Google Place ID",
  placeIdHint:
    "ID-ul din Google Maps generează automat linkul corect pentru recenzie. Gol = butonul de recenzie este ascuns.",
  heroPhoto: "Poza mare de pe pagina cafenelei",
  heroPhotoHint:
    "Apare pe toată lățimea, cu numele cafenelei scris peste ea. Fără poză = fundal verde închis, doar cu text.",
  cardPhoto: "Poza din listă",
  cardPhotoHint:
    "Apare pe prima pagină, în lista de cafenele, și în banda de atmosferă de sub meniu.",
  openPublicly: "Deschisă publicului",
  openHint:
    "Nebifat înseamnă în curând: pagina există, dar cafeneaua nu apare în meniuri și în disponibilitate.",
  save: "Salvează",
};

const MONTHS_RO = [
  "ian.", "feb.", "mar.", "apr.", "mai", "iun.",
  "iul.", "aug.", "sept.", "oct.", "nov.", "dec.",
];

/**
 * "iul. 09:00 - 21:00 · aug. 10:00 - 22:00 · ..." for a cafenea whose clock
 * moves through the season, so the manager sees the schedule that is actually
 * live instead of the empty `hours` field it falls back to.
 */
function seasonalSummary(location: Location): string | null {
  const byMonth = location.hoursByMonth;
  if (!byMonth) return null;

  const parts = Object.entries(byMonth)
    .map(([month, hours]) => [Number(month), hours] as const)
    .sort((a, b) => a[0] - b[0])
    .map(([month, hours]) => `${MONTHS_RO[month - 1]} ${hours.ro}`);

  return parts.length > 0 ? parts.join(" · ") : null;
}

function alcoholValue(serves: boolean | null): string {
  if (serves === true) return "da";
  if (serves === false) return "nu";
  return "neconfirmat";
}

export default function LocationEditor({
  location,
  library,
}: {
  location: Location;
  library: string[];
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(saveLocationAction, null);
  const fieldId = useId();

  return (
    <div className="border-b border-line">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="flex w-full items-center gap-3 py-3 text-left"
      >
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[14.5px] font-semibold text-ink">
            {location.name}
          </span>
          <span className="mt-1.5 flex flex-wrap items-center gap-1.5">
            {location.comingSoon && (
              <span className={`${pillClass} text-sage-deep`}>
                {strings.comingSoon}
              </span>
            )}
            <span className={`${pillClass} text-muted`}>
              {location.hours?.ro ?? seasonalSummary(location) ?? strings.hoursMissing}
            </span>
          </span>
        </span>

        <ChevronDown
          className={`size-4 shrink-0 text-muted ${open ? "rotate-180" : ""}`}
          strokeWidth={2}
        />
      </button>

      {open && (
        <form action={formAction} className="pb-5">
          <input type="hidden" name="slug" value={location.slug} />

          {seasonalSummary(location) && (
            <p className={`mb-3 ${hintClass}`}>
              <b className="font-semibold">{strings.hoursSeasonal}:</b>{" "}
              {seasonalSummary(location)}. {strings.hoursSeasonalHint}
            </p>
          )}

          <label className={labelClass} htmlFor={`${fieldId}-orar-ro`}>
            {strings.hoursRo}
          </label>
          <input
            id={`${fieldId}-orar-ro`}
            name="orarRo"
            type="text"
            autoComplete="off"
            placeholder="L-D 09:00 - 21:00"
            defaultValue={location.hours?.ro ?? ""}
            className={`mt-1.5 ${fieldClass}`}
          />

          <label
            className={`mt-3 ${labelClass}`}
            htmlFor={`${fieldId}-orar-hu`}
          >
            {strings.hoursHu}
          </label>
          <input
            id={`${fieldId}-orar-hu`}
            name="orarHu"
            type="text"
            autoComplete="off"
            placeholder="H-V 09:00 - 21:00"
            defaultValue={location.hours?.hu ?? ""}
            className={`mt-1.5 ${fieldClass}`}
          />
          <p className={hintClass}>{strings.hoursHint}</p>

          <label className={`mt-4 ${labelClass}`} htmlFor={`${fieldId}-wolt`}>
            {strings.wolt}
          </label>
          <input
            id={`${fieldId}-wolt`}
            name="wolt"
            type="url"
            autoComplete="off"
            spellCheck={false}
            placeholder="https://wolt.com/..."
            defaultValue={location.woltUrl ?? ""}
            className={`mt-1.5 ${fieldClass}`}
          />
          <p className={hintClass}>{strings.woltHint}</p>

          <label className={`mt-4 ${labelClass}`} htmlFor={`${fieldId}-alcool`}>
            {strings.alcohol}
          </label>
          <select
            id={`${fieldId}-alcool`}
            name="alcool"
            defaultValue={alcoholValue(location.servesAlcohol)}
            className={`mt-1.5 appearance-none ${fieldClass}`}
          >
            <option value="da">{strings.yes}</option>
            <option value="nu">{strings.no}</option>
            <option value="neconfirmat">{strings.unknown}</option>
          </select>
          <p className={hintClass}>{strings.alcoholHint}</p>

          <div className="mt-4">
            <span className={labelClass}>{strings.google}</span>
            <p className={hintClass}>{strings.googleHint}</p>
            <div className="mt-2 flex gap-2">
              <div className="flex-1">
                <label
                  className="block text-[11.5px] font-semibold text-muted"
                  htmlFor={`${fieldId}-rating`}
                >
                  {strings.rating}
                </label>
                <input
                  id={`${fieldId}-rating`}
                  name="rating"
                  type="text"
                  inputMode="decimal"
                  autoComplete="off"
                  placeholder="4,9"
                  defaultValue={
                    location.googleRating === null
                      ? ""
                      : formatRating(location.googleRating)
                  }
                  className={`mt-1 ${fieldClass}`}
                />
              </div>
              <div className="flex-1">
                <label
                  className="block text-[11.5px] font-semibold text-muted"
                  htmlFor={`${fieldId}-recenzii`}
                >
                  {strings.reviews}
                </label>
                <input
                  id={`${fieldId}-recenzii`}
                  name="recenzii"
                  type="text"
                  inputMode="numeric"
                  autoComplete="off"
                  placeholder="73"
                  defaultValue={location.googleReviewCount ?? ""}
                  className={`mt-1 ${fieldClass}`}
                />
              </div>
            </div>

            <label
              className={`mt-3 ${labelClass}`}
              htmlFor={`${fieldId}-place-id`}
            >
              {strings.placeId}
            </label>
            <input
              id={`${fieldId}-place-id`}
              name="googlePlaceId"
              type="text"
              autoComplete="off"
              spellCheck={false}
              placeholder="ChIJ..."
              defaultValue={location.googlePlaceId ?? ""}
              className={`mt-1.5 ${fieldClass}`}
            />
            <p className={hintClass}>{strings.placeIdHint}</p>
          </div>

          <ImageField
            name="pozaHero"
            label={strings.heroPhoto}
            hint={strings.heroPhotoHint}
            value={location.heroPhoto}
            library={library}
            ratio="wide"
          />

          <ImageField
            name="poza"
            label={strings.cardPhoto}
            hint={strings.cardPhotoHint}
            value={location.photo}
            library={library}
            ratio="card"
          />

          <div className="mt-4">
            <CheckField
              name="deschisa"
              label={strings.openPublicly}
              defaultChecked={!location.comingSoon}
            />
            <p className={hintClass}>{strings.openHint}</p>
          </div>

          <button
            type="submit"
            disabled={pending}
            className={`mt-4 ${primaryButton}`}
          >
            {pending ? (
              <Loader2 className="size-[17px] animate-spin" strokeWidth={2} />
            ) : (
              <Check className="size-[17px]" strokeWidth={2.25} />
            )}
            {strings.save}
          </button>

          <SaveNotice state={state} />
        </form>
      )}
    </div>
  );
}
