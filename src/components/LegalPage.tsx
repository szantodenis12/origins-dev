"use client";

import { tx, useLang } from "@/lib/i18n";
import type { I18nText } from "@/lib/types";
import Header from "./Header";
import PhoneFrame from "./PhoneFrame";
import SiteFooter from "./SiteFooter";

/**
 * Shared shell for /regulament and /confidentialitate — plain reading pages
 * in the three public languages. Content lives with each route.
 */

export interface LegalSection {
  heading: I18nText | null;
  /** Each entry renders as one paragraph. */
  body: I18nText[];
}

export default function LegalPage({
  eyebrow,
  title,
  sections,
}: {
  eyebrow: I18nText;
  title: I18nText;
  sections: LegalSection[];
}) {
  const { lang } = useLang();

  return (
    <PhoneFrame>
      <Header />

      <div className="px-5 pt-[22px] pb-6">
        <div className="text-[11px] font-bold tracking-[0.18em] text-sage-deep uppercase">
          {tx(eyebrow, lang)}
        </div>
        <h1 className="mt-1 mb-4 text-[26px] font-extrabold tracking-[-0.02em]">
          {tx(title, lang)}
        </h1>

        {sections.map((section, i) => (
          <section key={i} className={i > 0 ? "mt-5" : undefined}>
            {section.heading && (
              <h2 className="mb-1.5 text-[15px] font-bold text-ink">
                {tx(section.heading, lang)}
              </h2>
            )}
            {section.body.map((paragraph, j) => (
              <p
                key={j}
                className="mt-1.5 text-[13.5px] leading-[1.55] text-ink/80"
              >
                {tx(paragraph, lang)}
              </p>
            ))}
          </section>
        ))}
      </div>

      <SiteFooter />
    </PhoneFrame>
  );
}
