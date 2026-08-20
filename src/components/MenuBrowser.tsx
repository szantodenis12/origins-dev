"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import { priceParts } from "@/lib/format";
import { tx, ui, useLang } from "@/lib/i18n";
import type { Category, Product } from "@/lib/types";

const ALL = "toate";

export default function MenuBrowser({
  categories,
  products,
}: {
  categories: Category[];
  /** Already filtered for the location by the page. */
  products: Product[];
}) {
  const { lang } = useLang();
  const [active, setActive] = useState<string>(ALL);

  const groups = useMemo(
    () =>
      [...categories]
        .sort((a, b) => a.order - b.order)
        .map((category) => ({
          category,
          items: products.filter((p) => p.categorySlug === category.slug),
        }))
        .filter((group) => group.items.length > 0),
    [categories, products],
  );

  const shown = groups.filter(
    (group) => active === ALL || group.category.slug === active,
  );

  return (
    <>
      <nav
        aria-label={tx(ui.menuOf, lang)}
        className="flex gap-2 overflow-x-auto px-5 pt-5 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        <Chip
          label={tx(ui.allCategories, lang)}
          on={active === ALL}
          onClick={() => setActive(ALL)}
        />
        {groups.map(({ category }) => (
          <Chip
            key={category.slug}
            label={tx(category.name, lang)}
            on={active === category.slug}
            onClick={() => setActive(category.slug)}
          />
        ))}
      </nav>

      <div className="px-5 py-2.5">
        {shown.map(({ category, items }) => (
          <div key={category.slug}>
            {category.photo ? (
              /* The category name lives on the photo, set in the serif. */
              <div className="relative mt-[22px] h-[148px] overflow-hidden rounded-2xl bg-cream">
                <Image
                  src={category.photo}
                  alt=""
                  fill
                  sizes="(max-width: 480px) 100vw, 374px"
                  className="object-cover"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/58 via-black/8 to-transparent" />
                <h2 className="absolute bottom-3 left-4 font-[family-name:var(--font-serif)] text-[23px] font-medium text-paper">
                  {tx(category.name, lang)}
                </h2>
              </div>
            ) : (
              <h2 className="mt-[22px] mb-1 font-[family-name:var(--font-serif)] text-[20px] font-medium text-ink">
                {tx(category.name, lang)}
              </h2>
            )}
            {items.map((product, i) => (
              <MenuItem
                key={product.id}
                product={product}
                last={i === items.length - 1}
              />
            ))}
          </div>
        ))}

        <p className="mt-5 text-[11.5px] leading-[1.45] text-muted">
          {tx(ui.allergens, lang)}
        </p>
      </div>
    </>
  );
}

function Chip({
  label,
  on,
  onClick,
}: {
  label: string;
  on: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className={
        on
          ? "shrink-0 rounded-full border border-ink bg-ink px-4 py-2 text-[13.5px] font-semibold text-paper"
          : "shrink-0 rounded-full border border-line bg-cream/60 px-4 py-2 text-[13.5px] font-semibold text-ink/65"
      }
    >
      {label}
    </button>
  );
}

function MenuItem({ product, last }: { product: Product; last: boolean }) {
  const { lang } = useLang();
  const price = priceParts(product, lang);
  const description = tx(product.description, lang);

  // Rows with a thumb centre on the image; text-only rows keep the original
  // baseline alignment so the two kinds still read as one list.
  const align = product.photo ? "items-center" : "items-baseline";

  return (
    <div
      className={
        last
          ? `flex ${align} justify-between gap-3.5 py-[13px]`
          : `flex ${align} justify-between gap-3.5 border-b border-line py-[13px]`
      }
    >
      <div className="flex items-center gap-3">
        {product.photo && (
          <Image
            src={product.photo}
            alt={tx(product.name, lang)}
            width={68}
            height={68}
            sizes="68px"
            className="size-[68px] shrink-0 rounded-2xl object-cover"
          />
        )}
        <div>
          <div className="text-[15.5px] font-semibold">
            {tx(product.name, lang)}
          </div>
          {description && (
            <div className="mt-0.5 text-[12.5px] text-muted">{description}</div>
          )}
        </div>
      </div>
      {price && (
        <div className="text-[15px] font-bold whitespace-nowrap">
          {price.amount}{" "}
          <small className="text-[11px] font-medium text-muted">
            {price.unit}
          </small>
        </div>
      )}
    </div>
  );
}
