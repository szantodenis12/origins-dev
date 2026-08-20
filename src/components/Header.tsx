"use client";

import Image from "next/image";
import Link from "next/link";
import type { Lang } from "@/lib/types";
import { useLang } from "@/lib/i18n";

const LANGS: Lang[] = ["ro", "hu", "en"];

export default function Header() {
  const { lang, setLang } = useLang();

  return (
    <header className="flex items-center justify-between px-5 pt-[18px]">
      <Link href="/" aria-label="Origins Coffee & Drinks">
        <Image
          src="/brand/logo-ink.png"
          alt="Origins Coffee & Drinks"
          width={334}
          height={178}
          priority
          className="h-[46px] w-auto"
        />
      </Link>

      <div className="flex overflow-hidden rounded-full border border-line text-[12px] font-semibold">
        {LANGS.map((l) => (
          <button
            key={l}
            type="button"
            onClick={() => setLang(l)}
            aria-pressed={lang === l}
            className={
              lang === l
                ? "bg-ink px-3 py-1.5 text-paper"
                : "px-3 py-1.5 text-muted"
            }
          >
            {l.toUpperCase()}
          </button>
        ))}
      </div>
    </header>
  );
}
