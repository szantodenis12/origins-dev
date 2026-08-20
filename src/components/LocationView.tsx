"use client";

import type { ComponentProps } from "react";
import Image from "next/image";
import Link from "next/link";
import { Bike, ChevronRight, Star, Wallet } from "lucide-react";
import { formatRating, priceLabel, priceParts } from "@/lib/format";
import { tx, ui, useLang } from "@/lib/i18n";
import type { Category, Location, Product } from "@/lib/types";
import Header from "./Header";
import LoyaltyBlock from "./LoyaltyBlock";
import MenuBrowser from "./MenuBrowser";
import PhoneFrame from "./PhoneFrame";
import SiteFooter from "./SiteFooter";
import StudentBanner from "./StudentBanner";

/** Curated order for the house-favourites rail; falls back to photo order. */
const PICKS = ["cappuccino", "limonada-mango", "ice-coffee", "croissant", "flat-white"];

export default function LocationView({
  location,
  categories,
  products,
  seasonal,
  loyalty,
}: {
  location: Location;
  categories: Category[];
  /** Already filtered for this location by the page. */
  products: Product[];
  seasonal: Product | undefined;
  /** Program copy + numbers, generated on the server from the settings. */
  loyalty: ComponentProps<typeof LoyaltyBlock>;
}) {
  const { lang } = useLang();
  const hours = tx(location.hours, lang);
  const seasonalPrice = seasonal ? priceLabel(seasonal, lang) : null;

  const withPhoto = products.filter((p) => p.photo);
  const picks = [
    ...PICKS.map((id) => withPhoto.find((p) => p.id === id)).filter(
      (p): p is Product => p !== undefined,
    ),
    ...withPhoto.filter((p) => !PICKS.includes(p.id)),
  ].slice(0, 5);

  // "Lasă o recenzie" stays visible but inert until the place id is confirmed;
  // Wolt disappears entirely where there is no venue.
  const actionCount = 2 + (location.woltUrl ? 1 : 0);

  return (
    <PhoneFrame>
      <Header />

      {location.comingSoon ? (
        <div className="px-5 pt-[22px] pb-1.5">
          <div className="text-[11px] font-bold tracking-[0.18em] text-sage-deep uppercase">
            {tx(ui.location, lang)}
          </div>
          <h1 className="mt-1 mb-2 font-[family-name:var(--font-serif)] text-[30px] font-medium tracking-[-0.01em]">
            {location.name}
          </h1>
          <span className="inline-flex items-center rounded-full border border-sage px-2.5 py-1 text-[11px] font-semibold text-sage-deep">
            {tx(ui.comingSoon, lang)}
          </span>
        </div>
      ) : (
        <>
          {/* Full-bleed editorial hero: the pour, the name, nothing else. */}
          <div className="relative mt-[14px] h-[400px] overflow-hidden bg-olive">
            {/* No hero photo set: the olive block carries the type on its own. */}
            {location.heroPhoto && (
              <Image
                src={location.heroPhoto}
                alt=""
                fill
                sizes="(max-width: 480px) 100vw, 414px"
                className="object-cover"
                preload
              />
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-black/72 via-black/18 to-black/10" />
            <div className="absolute right-5 bottom-[52px] left-5">
              <div className="text-[10.5px] font-bold tracking-[0.22em] text-sage uppercase">
                Origins · {tx(ui.location, lang)}
              </div>
              <h1 className="mt-1.5 font-[family-name:var(--font-serif)] text-[36px] leading-[1.04] font-medium text-paper">
                {location.name}
              </h1>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                {hours && (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-black/35 px-3 py-[7px] text-[11.5px] font-semibold text-paper backdrop-blur-sm">
                    <span className="inline-block size-[6px] rounded-full bg-open" />
                    {tx(ui.open, lang)} · {hours}
                  </span>
                )}
                {location.googleRating !== null && (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-black/35 px-3 py-[7px] text-[11.5px] font-semibold text-paper backdrop-blur-sm">
                    <Star className="size-3 fill-star text-star" strokeWidth={1} />
                    {formatRating(location.googleRating)}
                    {location.googleReviewCount !== null && (
                      <span className="font-medium text-paper/75">
                        · {location.googleReviewCount} {tx(ui.reviewsGoogle, lang)}
                      </span>
                    )}
                  </span>
                )}
                {location.seasonalNote && (
                  <span className="inline-flex items-center rounded-full bg-black/35 px-3 py-[7px] text-[11px] font-semibold text-paper backdrop-blur-sm">
                    {tx(location.seasonalNote, lang)}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Action card floating over the hero edge. */}
          <div
            className={`relative z-10 mx-5 -mt-9 grid gap-2 rounded-card bg-paper p-2.5 shadow-[0_18px_44px_rgba(19,20,16,0.16)] ${
              actionCount === 3 ? "grid-cols-3" : "grid-cols-2"
            }`}
          >
            <Link
              href="/card"
              className="rounded-2xl bg-ink px-2 py-3 text-center text-paper"
            >
              <Wallet className="mx-auto mb-1.5 size-5 text-sage" strokeWidth={2} />
              <b className="block text-[12px] leading-[1.25] font-semibold">
                {tx(ui.loyaltyCard, lang)}
              </b>
            </Link>

            {location.reviewUrl ? (
              <a
                href={location.reviewUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-2xl bg-cream px-2 py-3 text-center text-ink"
              >
                <Star className="mx-auto mb-1.5 size-5 text-sage-deep" strokeWidth={2} />
                <b className="block text-[12px] leading-[1.25] font-semibold">
                  {tx(ui.leaveReview, lang)}
                </b>
              </a>
            ) : (
              <span
                aria-disabled="true"
                className="rounded-2xl bg-cream px-2 py-3 text-center text-ink opacity-45"
              >
                <Star className="mx-auto mb-1.5 size-5 text-sage-deep" strokeWidth={2} />
                <b className="block text-[12px] leading-[1.25] font-semibold">
                  {tx(ui.leaveReview, lang)}
                </b>
              </span>
            )}

            {location.woltUrl && (
              <a
                href={location.woltUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-2xl bg-cream px-2 py-3 text-center text-ink"
              >
                <Bike className="mx-auto mb-1.5 size-5 text-sage-deep" strokeWidth={2} />
                <b className="block text-[12px] leading-[1.25] font-semibold">
                  {tx(ui.orderWolt, lang)}
                </b>
              </a>
            )}
          </div>
        </>
      )}

      {location.comingSoon && (
        <section className="mx-5 mt-1.5 mb-1 rounded-card bg-cream p-5">
          <p className="text-[13.5px] text-ink/72">
            {tx(ui.comingSoonBody, lang)}
          </p>
          <Link
            href="/"
            className="mt-3 inline-flex items-center gap-1.5 text-[13.5px] font-semibold text-sage-deep"
          >
            {tx(ui.seeLocations, lang)}
            <ChevronRight className="size-4" strokeWidth={2} />
          </Link>
        </section>
      )}

      {!location.comingSoon && seasonal && (
        /* Featured drink: arched photo card, the menu's centrepiece. */
        <section className="relative mx-5 mt-7 h-[400px] overflow-hidden rounded-t-[186px] rounded-b-card bg-cream">
          {seasonal.photo && (
            <Image
              src={seasonal.photo}
              alt={tx(seasonal.name, lang)}
              fill
              sizes="(max-width: 480px) 100vw, 374px"
              className="object-cover"
            />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/6 to-transparent" />
          <div className="absolute right-5 bottom-5 left-5 text-center">
            <div className="text-[10.5px] font-bold tracking-[0.22em] text-sage uppercase">
              {tx(ui.summerDrink, lang)}
            </div>
            <h2 className="mt-1 font-[family-name:var(--font-serif)] text-[28px] leading-[1.08] font-medium text-paper">
              {tx(seasonal.name, lang)}
            </h2>
            {seasonal.description && (
              <p className="mx-auto mt-1.5 max-w-[260px] text-[13px] leading-[1.45] text-paper/85">
                {tx(seasonal.description, lang)}
              </p>
            )}
            {seasonalPrice && (
              <div className="mt-3 inline-flex rounded-full bg-sage px-4 py-1.5 text-[13.5px] font-bold text-olive">
                {seasonalPrice}
              </div>
            )}
          </div>
        </section>
      )}

      {!location.comingSoon && picks.length >= 3 && (
        /* House favourites: arch-top cards on a horizontal rail. */
        <section className="mt-9">
          <h2 className="px-5 font-[family-name:var(--font-serif)] text-[24px] font-medium text-ink">
            {tx(ui.housePicks, lang)}
          </h2>
          <div className="flex gap-3 overflow-x-auto px-5 pt-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {picks.map((p) => (
              <PickCard key={p.id} product={p} />
            ))}
          </div>
        </section>
      )}

      {!location.comingSoon && (
        <>
          <h2 className="mt-9 px-5 font-[family-name:var(--font-serif)] text-[26px] font-medium text-ink">
            {tx(ui.menuOf, lang)}
          </h2>
          <MenuBrowser categories={categories} products={products} />
        </>
      )}

      {!location.comingSoon && location.photo && (
        /* A breath between the menu and the card: the cafe itself. */
        <div className="relative mt-6 h-[230px] overflow-hidden">
          <Image
            src={location.photo}
            alt={`Origins ${location.name}`}
            fill
            sizes="(max-width: 480px) 100vw, 414px"
            className="object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/55 via-transparent to-transparent" />
          <div className="absolute bottom-4 left-5 text-[11px] font-bold tracking-[0.22em] text-paper uppercase">
            Origins · {location.name}
          </div>
        </div>
      )}

      <LoyaltyBlock {...loyalty} />
      <StudentBanner />
      <SiteFooter location={location} />
    </PhoneFrame>
  );
}

function PickCard({ product }: { product: Product }) {
  const { lang } = useLang();
  const price = priceParts(product, lang);

  return (
    <div className="w-[148px] shrink-0">
      <div className="relative h-[168px] overflow-hidden rounded-t-full rounded-b-2xl bg-cream">
        {product.photo && (
          <Image
            src={product.photo}
            alt={tx(product.name, lang)}
            fill
            sizes="148px"
            className="object-cover"
          />
        )}
      </div>
      <div className="px-1 pt-2.5 text-center">
        <div className="text-[13.5px] leading-[1.25] font-semibold text-ink">
          {tx(product.name, lang)}
        </div>
        {price && (
          <div className="mt-0.5 text-[12.5px] font-bold text-sage-deep">
            {price.amount} {price.unit}
          </div>
        )}
      </div>
    </div>
  );
}
