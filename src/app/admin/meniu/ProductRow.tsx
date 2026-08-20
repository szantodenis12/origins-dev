"use client";

import { useActionState, useId, useState } from "react";
import Image from "next/image";
import { Check, ChevronDown, EyeOff, Loader2, Sun } from "lucide-react";
import ImageField from "./ImageField";
import { saveProductAction } from "./actions";
import {
  CheckField,
  SaveNotice,
  fieldClass,
  hintClass,
  labelClass,
  pillClass,
  primaryButton,
} from "./ui";
import type { AdminProduct } from "@/lib/db";
import type { Category, Location } from "@/lib/types";
import { formatAmount, priceParts } from "@/lib/format";

/** Staff screen: Romanian only. */
const strings = {
  noPrice: "preț de confirmat",
  hidden: "Ascuns",
  seasonal: "Sezon",
  nameRo: "Nume în română",
  nameHu: "Nume în maghiară",
  nameHuHint: "Gol = se folosește numele în română.",
  descriptionRo: "Descriere în română (opțional)",
  descriptionHu: "Descriere în maghiară (opțional)",
  category: "Categoria",
  priceType: "Preț",
  exact: "Preț exact",
  from: "De la",
  none: "Fără preț",
  priceHint: "Lei, zecimale cu virgulă. Gol = preț de confirmat, nu apare public.",
  active: "Activ pe meniu",
  alcohol: "Conține alcool",
  seasonalField: "Băutura de sezon",
  seasonalHint:
    "O singură băutură de sezon pe meniu. Dacă o bifezi aici, se scoate de pe cealaltă.",
  photo: "Poza produsului",
  photoHint:
    "Pătrată, apare lângă nume în meniu. Băutura de sezon o folosește mare, pe toată lățimea. Fără poză = rând doar cu text.",
  where: "Disponibil în",
  everywhere: "În toate cafenelele",
  save: "Salvează",
  cafes: (count: number) => `${count} cafenele`,
};

type PriceMode = "exact" | "dela" | "fara";

function initialMode(product: AdminProduct): PriceMode {
  if (product.price !== null) return "exact";
  if (product.priceFrom !== null) return "dela";
  return "fara";
}

function initialAmount(product: AdminProduct): string {
  const value = product.price ?? product.priceFrom;
  return value === null ? "" : formatAmount(value);
}

function priceText(product: AdminProduct): string {
  const parts = priceParts(product, "ro");
  return parts ? `${parts.amount} ${parts.unit}` : strings.noPrice;
}

export default function ProductRow({
  product,
  locations,
  categories,
  library,
}: {
  product: AdminProduct;
  locations: Location[];
  categories: Category[];
  library: string[];
}) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<PriceMode>(() => initialMode(product));
  const [everywhere, setEverywhere] = useState(product.locations === null);
  const [state, formAction, pending] = useActionState(saveProductAction, null);
  const fieldId = useId();
  const openLocations = locations.filter((location) => !location.comingSoon);
  const closedAssigned =
    product.locations?.filter((slug) =>
      locations.some(
        (location) => location.slug === slug && location.comingSoon,
      ),
    ) ?? [];

  const where = product.locations;
  const whereLabel =
    where === null
      ? null
      : where.length === 1
        ? (locations.find((l) => l.slug === where[0])?.name ?? where[0])
        : strings.cafes(where.length);

  return (
    <div className="border-b border-line">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="flex w-full items-center gap-3 py-3 text-left"
      >
        <span
          className={`size-[42px] shrink-0 overflow-hidden rounded-btn bg-cream ${
            product.active ? "" : "opacity-55"
          }`}
        >
          {product.photo && (
            <Image
              src={product.photo}
              alt=""
              width={120}
              height={120}
              sizes="42px"
              className="size-full object-cover"
            />
          )}
        </span>

        <span className={`min-w-0 flex-1 ${product.active ? "" : "opacity-55"}`}>
          <span className="block truncate text-[14.5px] font-semibold text-ink">
            {product.name.ro}
          </span>
          {product.name.hu && (
            <span className="block truncate text-[12px] text-muted">
              {product.name.hu}
            </span>
          )}
          {(!product.active || product.seasonal || whereLabel) && (
            <span className="mt-1.5 flex flex-wrap items-center gap-1.5">
              {!product.active && (
                <span className={`${pillClass} text-muted`}>
                  <EyeOff className="size-[11px]" strokeWidth={2.25} />
                  {strings.hidden}
                </span>
              )}
              {product.seasonal && (
                <span className={`${pillClass} text-sage-deep`}>
                  <Sun className="size-[11px]" strokeWidth={2.25} />
                  {strings.seasonal}
                </span>
              )}
              {whereLabel && (
                <span className={`${pillClass} text-muted`}>{whereLabel}</span>
              )}
            </span>
          )}
        </span>

        <span
          className={`shrink-0 text-[13px] font-semibold ${
            product.price === null && product.priceFrom === null
              ? "text-muted"
              : "text-ink"
          } ${product.active ? "" : "opacity-55"}`}
        >
          {priceText(product)}
        </span>

        <ChevronDown
          className={`size-4 shrink-0 text-muted ${open ? "rotate-180" : ""}`}
          strokeWidth={2}
        />
      </button>

      {open && (
        <form action={formAction} className="pb-5">
          <input type="hidden" name="productId" value={product.id} />
          {!everywhere &&
            closedAssigned.map((slug) => (
              <input key={slug} type="hidden" name="locatii" value={slug} />
            ))}

          <label className={labelClass} htmlFor={`${fieldId}-nume-ro`}>
            {strings.nameRo}
          </label>
          <input
            id={`${fieldId}-nume-ro`}
            name="numeRo"
            type="text"
            autoComplete="off"
            defaultValue={product.name.ro}
            className={`mt-1.5 ${fieldClass}`}
          />

          <label
            className={`mt-3 ${labelClass}`}
            htmlFor={`${fieldId}-nume-hu`}
          >
            {strings.nameHu}
          </label>
          <input
            id={`${fieldId}-nume-hu`}
            name="numeHu"
            type="text"
            autoComplete="off"
            defaultValue={product.name.hu ?? ""}
            className={`mt-1.5 ${fieldClass}`}
          />
          <p className={hintClass}>{strings.nameHuHint}</p>

          <label
            className={`mt-3 ${labelClass}`}
            htmlFor={`${fieldId}-descriere-ro`}
          >
            {strings.descriptionRo}
          </label>
          <textarea
            id={`${fieldId}-descriere-ro`}
            name="descriereRo"
            rows={2}
            defaultValue={product.description?.ro ?? ""}
            className={`mt-1.5 resize-y ${fieldClass}`}
          />

          <label
            className={`mt-3 ${labelClass}`}
            htmlFor={`${fieldId}-descriere-hu`}
          >
            {strings.descriptionHu}
          </label>
          <textarea
            id={`${fieldId}-descriere-hu`}
            name="descriereHu"
            rows={2}
            defaultValue={product.description?.hu ?? ""}
            className={`mt-1.5 resize-y ${fieldClass}`}
          />

          <label className={`mt-4 ${labelClass}`} htmlFor={`${fieldId}-cat`}>
            {strings.category}
          </label>
          <select
            id={`${fieldId}-cat`}
            name="categorie"
            defaultValue={product.categorySlug}
            className={`mt-1.5 appearance-none ${fieldClass}`}
          >
            {categories.map((category) => (
              <option key={category.slug} value={category.slug}>
                {category.name.ro}
              </option>
            ))}
          </select>

          <label className={`mt-4 ${labelClass}`} htmlFor={`${fieldId}-tip`}>
            {strings.priceType}
          </label>
          <select
            id={`${fieldId}-tip`}
            name="tipPret"
            value={mode}
            onChange={(event) => setMode(event.target.value as PriceMode)}
            className={`mt-1.5 appearance-none ${fieldClass}`}
          >
            <option value="exact">{strings.exact}</option>
            <option value="dela">{strings.from}</option>
            <option value="fara">{strings.none}</option>
          </select>

          {mode !== "fara" && (
            <div className="mt-2.5">
              <input
                id={`${fieldId}-pret`}
                name="pret"
                type="text"
                inputMode="decimal"
                autoComplete="off"
                placeholder="16,50"
                defaultValue={initialAmount(product)}
                className={fieldClass}
              />
              <p className={hintClass}>{strings.priceHint}</p>
            </div>
          )}

          <ImageField
            name="poza"
            label={strings.photo}
            hint={strings.photoHint}
            value={product.photo}
            library={library}
          />

          <div className="mt-4 flex flex-col gap-2.5">
            <CheckField
              name="active"
              label={strings.active}
              defaultChecked={product.active}
            />
            <CheckField
              name="alcool"
              label={strings.alcohol}
              defaultChecked={product.alcohol}
            />
            <CheckField
              name="seasonal"
              label={strings.seasonalField}
              defaultChecked={product.seasonal}
            />
          </div>
          <p className={hintClass}>{strings.seasonalHint}</p>

          <div className="mt-4">
            <span className={labelClass}>{strings.where}</span>
            <div className="mt-2 flex flex-col gap-2.5">
              <CheckField
                name="toateLocatiile"
                label={strings.everywhere}
                checked={everywhere}
                onChange={setEverywhere}
              />
              {openLocations.map((location) => (
                <CheckField
                  key={location.slug}
                  name="locatii"
                  value={location.slug}
                  label={location.name}
                  defaultChecked={where?.includes(location.slug) ?? false}
                  disabled={everywhere}
                />
              ))}
            </div>
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
