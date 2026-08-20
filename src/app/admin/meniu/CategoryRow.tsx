"use client";

import { useActionState, useState } from "react";
import Image from "next/image";
import { Check, ChevronDown, Loader2 } from "lucide-react";
import ImageField from "./ImageField";
import { saveCategoryAction } from "./actions";
import { SaveNotice, pillClass, primaryButton } from "./ui";
import type { Category } from "@/lib/types";

/**
 * Categories are seed data — the name and the order are not the manager's to
 * change. The banner photo is, and it is the biggest thing on the menu, so it
 * gets its own row here.
 */

/** Staff screen: Romanian only. */
const strings = {
  noPhoto: "Fără poză",
  banner: "Poza categoriei",
  bannerHint:
    "Banda lată de deasupra produselor. Numele categoriei se scrie peste ea, așa că lasă loc jos. Fără poză = doar titlu scris.",
  save: "Salvează",
};

export default function CategoryRow({
  category,
  library,
}: {
  category: Category;
  library: string[];
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(saveCategoryAction, null);

  return (
    <div className="border-b border-line">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="flex w-full items-center gap-3 py-3 text-left"
      >
        <span className="size-[42px] shrink-0 overflow-hidden rounded-btn bg-cream">
          {category.photo && (
            <Image
              src={category.photo}
              alt=""
              width={120}
              height={120}
              sizes="42px"
              className="size-full object-cover"
            />
          )}
        </span>

        <span className="min-w-0 flex-1">
          <span className="block truncate text-[14.5px] font-semibold text-ink">
            {category.name.ro}
          </span>
          {!category.photo && (
            <span className="mt-1.5 flex">
              <span className={`${pillClass} text-muted`}>
                {strings.noPhoto}
              </span>
            </span>
          )}
        </span>

        <ChevronDown
          className={`size-4 shrink-0 text-muted ${open ? "rotate-180" : ""}`}
          strokeWidth={2}
        />
      </button>

      {open && (
        <form action={formAction} className="pb-5">
          <input type="hidden" name="slug" value={category.slug} />

          <ImageField
            name="poza"
            label={strings.banner}
            hint={strings.bannerHint}
            value={category.photo}
            library={library}
            ratio="wide"
          />

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
