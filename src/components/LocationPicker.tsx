"use client";

import Image from "next/image";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { tx, ui, useLang } from "@/lib/i18n";
import type { Location } from "@/lib/types";
import Header from "./Header";
import PhoneFrame from "./PhoneFrame";
import RatingBadge from "./RatingBadge";
import SiteFooter from "./SiteFooter";

export default function LocationPicker({
  locations,
}: {
  locations: Location[];
}) {
  const { lang } = useLang();

  return (
    <PhoneFrame>
      <Header />

      <div className="px-5 pt-[22px] pb-1.5">
        <h1 className="text-[30px] font-extrabold tracking-[-0.02em]">
          {tx(ui.chooseLocation, lang)}
        </h1>
        <p className="mt-2 text-[13.5px] text-ink/72">
          {tx(ui.chooseLocationHint, lang)}
        </p>
      </div>

      <div className="flex flex-col gap-2.5 px-5 pt-4 pb-2">
        {locations.map((location) =>
          location.comingSoon ? (
            <div
              key={location.slug}
              className="rounded-card border border-line p-5 opacity-55"
            >
              <LocationCardBody location={location} />
            </div>
          ) : (
            <Link
              key={location.slug}
              href={`/${location.slug}`}
              className="rounded-card border border-line p-5"
            >
              <LocationCardBody location={location} withChevron />
            </Link>
          ),
        )}
      </div>

      <SiteFooter />
    </PhoneFrame>
  );
}

function LocationCardBody({
  location,
  withChevron = false,
}: {
  location: Location;
  withChevron?: boolean;
}) {
  const { lang } = useLang();
  const hours = tx(location.hours, lang);
  const address = tx(location.address, lang);

  return (
    <>
      <div className="flex items-start gap-3">
        <div className="flex-1">
          <h2 className="text-[18px] font-extrabold tracking-[-0.01em]">
            {location.name}
          </h2>
          {address && (
            <p className="mt-1 text-[13px] text-muted">{address}</p>
          )}
        </div>
        {location.photo ? (
          <Image
            src={location.photo}
            alt={`Origins ${location.name}`}
            width={72}
            height={72}
            sizes="72px"
            className="size-[72px] shrink-0 rounded-xl object-cover"
          />
        ) : (
          withChevron && (
            <ChevronRight
              className="mt-0.5 size-5 shrink-0 text-sage-deep"
              strokeWidth={2}
            />
          )
        )}
      </div>

      {hours && !location.comingSoon && (
        <div className="mt-2 flex items-center gap-1.5 text-[13px] text-muted">
          <span className="inline-block size-[7px] rounded-full bg-open" />
          <span>
            {tx(ui.open, lang)} · {hours}
          </span>
        </div>
      )}

      {location.googleRating !== null && (
        <div className="mt-2.5">
          <RatingBadge location={location} asLink={false} />
        </div>
      )}

      {(location.seasonalNote || location.comingSoon) && (
        <div className="mt-2.5 flex flex-wrap gap-2">
          {location.seasonalNote && (
            <span className="inline-flex items-center rounded-full bg-cream px-2.5 py-1 text-[11px] font-semibold text-sage-deep">
              {tx(location.seasonalNote, lang)}
            </span>
          )}
          {location.comingSoon && (
            <span className="inline-flex items-center rounded-full border border-sage px-2.5 py-1 text-[11px] font-semibold text-sage-deep">
              {tx(ui.comingSoon, lang)}
            </span>
          )}
        </div>
      )}
    </>
  );
}
