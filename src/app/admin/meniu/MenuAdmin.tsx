"use client";

import { useActionState, useId, useState } from "react";
import { Check, Loader2, Plus, X } from "lucide-react";
import CategoryRow from "./CategoryRow";
import ImageField from "./ImageField";
import LocationEditor from "./LocationEditor";
import ProductRow from "./ProductRow";
import { createLocationAction, createProductAction } from "./actions";
import {
  CheckField,
  SaveNotice,
  fieldClass,
  hintClass,
  labelClass,
  primaryButton,
  secondaryButton,
} from "./ui";
import type { AdminProduct } from "@/lib/db";
import type { Category, Location } from "@/lib/types";

/** Staff screen: Romanian only. */
const strings = {
  title: "Meniu",
  intro:
    "Prețurile, produsele ascunse și disponibilitatea se schimbă aici. Meniul public se actualizează imediat.",
  add: "Adaugă produs",
  cancel: "Renunță",
  nameRo: "Nume în română",
  nameHu: "Nume în maghiară",
  nameHuHint: "Gol = se afișează numele în română și la clienții maghiari.",
  descriptionRo: "Descriere în română (opțional)",
  descriptionHu: "Descriere în maghiară (opțional)",
  category: "Categoria",
  alcohol: "Conține alcool",
  priceType: "Preț",
  exact: "Preț exact",
  from: "De la",
  none: "Fără preț",
  priceHint: "Lei, zecimale cu virgulă. Gol = preț de confirmat, nu apare public.",
  where: "Disponibil în",
  everywhere: "În toate cafenelele",
  save: "Adaugă în meniu",
  uncategorized: "Fără categorie",
  photo: "Poza produsului",
  photoHint:
    "Pătrată, apare lângă nume în meniu. Fără poză = rând doar cu text.",
  categoriesTitle: "Categorii",
  categoriesIntro: "Pozele late de deasupra fiecărei categorii din meniu.",
  cafes: "Cafenele",
  cafesIntro: "Orar, link Wolt, alcool și ratingul Google.",
  addCafe: "Adaugă cafenea",
  cafeName: "Numele cafenelei",
  cafeNameHint: "Așa apare public. Exemplu: Aurel Lazăr.",
  cafeAddress: "Adresa (opțional)",
  cafeOpenNow: "Deschisă publicului de acum",
  cafeOpenHint:
    "Nebifat înseamnă în curând. Produsele disponibile în toate cafenelele intră automat în meniul ei; cele cu listă de cafenele se bifează manual după deschidere.",
  cafeSave: "Adaugă cafeneaua",
};

type PriceMode = "exact" | "dela" | "fara";

export default function MenuAdmin({
  categories,
  products,
  locations,
  library,
}: {
  categories: Category[];
  products: AdminProduct[];
  locations: Location[];
  /** Photos the manager can pick from, newest upload first. */
  library: string[];
}) {
  const [adding, setAdding] = useState(false);
  const [addingCafe, setAddingCafe] = useState(false);

  // Availability is only ever offered for cafes that are actually open.
  const openLocations = locations.filter((l) => !l.comingSoon);
  const known = new Set(categories.map((c) => c.slug));
  const orphans = products.filter((p) => !known.has(p.categorySlug));

  return (
    <div className="px-5 pt-4 pb-10">
      <h1 className="text-[26px] font-extrabold tracking-[-0.02em]">
        {strings.title}
      </h1>
      <p className="mt-1.5 text-[13px] leading-[1.5] text-ink/72">
        {strings.intro}
      </p>

      <button
        type="button"
        onClick={() => setAdding((value) => !value)}
        className={`mt-4 ${secondaryButton}`}
      >
        {adding ? (
          <X className="size-[17px] text-muted" strokeWidth={2} />
        ) : (
          <Plus className="size-[17px] text-sage-deep" strokeWidth={2.25} />
        )}
        {adding ? strings.cancel : strings.add}
      </button>

      {adding && (
        <NewProductForm
          categories={categories}
          locations={openLocations}
          library={library}
        />
      )}

      {categories.map((category) => {
        const items = products.filter(
          (p) => p.categorySlug === category.slug,
        );
        if (items.length === 0) return null;

        return (
          <section key={category.slug} className="mt-7">
            <h2 className="text-[11px] font-bold tracking-[0.18em] text-sage-deep uppercase">
              {category.name.ro}
            </h2>
            <div className="mt-1.5 border-t border-line">
              {items.map((product) => (
                <ProductRow
                  key={product.id}
                  product={product}
                  locations={locations}
                  categories={categories}
                  library={library}
                />
              ))}
            </div>
          </section>
        );
      })}

      {orphans.length > 0 && (
        <section className="mt-7">
          <h2 className="text-[11px] font-bold tracking-[0.18em] text-sage-deep uppercase">
            {strings.uncategorized}
          </h2>
          <div className="mt-1.5 border-t border-line">
            {orphans.map((product) => (
              <ProductRow
                key={product.id}
                product={product}
                locations={locations}
                categories={categories}
                library={library}
              />
            ))}
          </div>
        </section>
      )}

      <section className="mt-9">
        <h2 className="text-[11px] font-bold tracking-[0.18em] text-sage-deep uppercase">
          {strings.categoriesTitle}
        </h2>
        <p className="mt-1 text-[12.5px] text-muted">
          {strings.categoriesIntro}
        </p>
        <div className="mt-2 border-t border-line">
          {categories.map((category) => (
            <CategoryRow
              key={category.slug}
              category={category}
              library={library}
            />
          ))}
        </div>
      </section>

      <section className="mt-9">
        <h2 className="text-[11px] font-bold tracking-[0.18em] text-sage-deep uppercase">
          {strings.cafes}
        </h2>
        <p className="mt-1 text-[12.5px] text-muted">{strings.cafesIntro}</p>
        <div className="mt-2 border-t border-line">
          {locations.map((location) => (
            <LocationEditor
              key={location.slug}
              location={location}
              library={library}
            />
          ))}
        </div>

        <button
          type="button"
          onClick={() => setAddingCafe((value) => !value)}
          className={`mt-4 ${secondaryButton}`}
        >
          {addingCafe ? (
            <X className="size-[17px] text-muted" strokeWidth={2} />
          ) : (
            <Plus className="size-[17px] text-sage-deep" strokeWidth={2.25} />
          )}
          {addingCafe ? strings.cancel : strings.addCafe}
        </button>

        {addingCafe && <NewLocationForm />}
      </section>
    </div>
  );
}

function NewLocationForm() {
  const [state, formAction, pending] = useActionState(
    createLocationAction,
    null,
  );
  const fieldId = useId();

  return (
    <form
      action={formAction}
      className="mt-3 rounded-card border border-line p-4"
    >
      <label className={labelClass} htmlFor={`${fieldId}-nume`}>
        {strings.cafeName}
      </label>
      <input
        id={`${fieldId}-nume`}
        name="numeCafenea"
        type="text"
        autoComplete="off"
        placeholder="Aurel Lazăr"
        className={`mt-1.5 ${fieldClass}`}
      />
      <p className={hintClass}>{strings.cafeNameHint}</p>

      <label className={`mt-3 ${labelClass}`} htmlFor={`${fieldId}-adresa`}>
        {strings.cafeAddress}
      </label>
      <input
        id={`${fieldId}-adresa`}
        name="adresa"
        type="text"
        autoComplete="off"
        placeholder="Str. Aurel Lazăr 21"
        className={`mt-1.5 ${fieldClass}`}
      />

      <label className={`mt-3 ${labelClass}`} htmlFor={`${fieldId}-orar-ro`}>
        Orar în română (opțional)
      </label>
      <input
        id={`${fieldId}-orar-ro`}
        name="orarRo"
        type="text"
        autoComplete="off"
        placeholder="L-D 09:00 - 21:00"
        className={`mt-1.5 ${fieldClass}`}
      />

      <label className={`mt-3 ${labelClass}`} htmlFor={`${fieldId}-orar-hu`}>
        Orar în maghiară (opțional)
      </label>
      <input
        id={`${fieldId}-orar-hu`}
        name="orarHu"
        type="text"
        autoComplete="off"
        placeholder="H-V 09:00 - 21:00"
        className={`mt-1.5 ${fieldClass}`}
      />

      <div className="mt-4">
        <CheckField name="deschisa" label={strings.cafeOpenNow} />
        <p className={hintClass}>{strings.cafeOpenHint}</p>
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
        {strings.cafeSave}
      </button>

      <SaveNotice state={state} />
    </form>
  );
}

function NewProductForm({
  categories,
  locations,
  library,
}: {
  categories: Category[];
  locations: Location[];
  library: string[];
}) {
  const [mode, setMode] = useState<PriceMode>("exact");
  const [everywhere, setEverywhere] = useState(true);
  const [state, formAction, pending] = useActionState(createProductAction, null);
  const fieldId = useId();

  return (
    <form
      action={formAction}
      className="mt-3 rounded-card border border-line p-4"
    >
      <label className={labelClass} htmlFor={`${fieldId}-ro`}>
        {strings.nameRo}
      </label>
      <input
        id={`${fieldId}-ro`}
        name="numeRo"
        type="text"
        autoComplete="off"
        placeholder="Limonadă de pepene"
        className={`mt-1.5 ${fieldClass}`}
      />

      <label className={`mt-3 ${labelClass}`} htmlFor={`${fieldId}-hu`}>
        {strings.nameHu}
      </label>
      <input
        id={`${fieldId}-hu`}
        name="numeHu"
        type="text"
        autoComplete="off"
        placeholder="Görögdinnyés limonádé"
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
        className={`mt-1.5 resize-y ${fieldClass}`}
      />

      <label className={`mt-4 ${labelClass}`} htmlFor={`${fieldId}-cat`}>
        {strings.category}
      </label>
      <select
        id={`${fieldId}-cat`}
        name="categorie"
        defaultValue={categories[0]?.slug}
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
            className={fieldClass}
          />
          <p className={hintClass}>{strings.priceHint}</p>
        </div>
      )}

      <ImageField
        name="poza"
        label={strings.photo}
        hint={strings.photoHint}
        library={library}
      />

      <div className="mt-4">
        <CheckField name="alcool" label={strings.alcohol} />
      </div>

      <div className="mt-4">
        <span className={labelClass}>{strings.where}</span>
        <div className="mt-2 flex flex-col gap-2.5">
          <CheckField
            name="toateLocatiile"
            label={strings.everywhere}
            checked={everywhere}
            onChange={setEverywhere}
          />
          {locations.map((location) => (
            <CheckField
              key={location.slug}
              name="locatii"
              value={location.slug}
              label={location.name}
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
  );
}
