"use client";

import { tx, ui, useLang } from "@/lib/i18n";
import type { Location } from "@/lib/types";

export default function SiteFooter({ location }: { location?: Location }) {
  const { lang } = useLang();
  const address = location ? tx(location.address, lang) : "";

  return (
    <footer className="mt-auto px-5 pt-[26px] pb-10 text-center text-[12.5px] leading-[1.6] text-muted">
      <b className="text-ink">{tx(ui.brandName, lang)}</b>
      {location && (
        <>
          <br />
          <span>
            {location.name}
            {address ? ` · ${address}` : ""}
          </span>
        </>
      )}
      <br />
      {tx(ui.site, lang)}
      <br />
      <span className="mt-1 block text-[11.5px] opacity-75">
        Creat de{" "}
        <a
          href="https://epicdigitalhub.ro"
          target="_blank"
          rel="noopener noreferrer"
          className="font-medium text-ink underline decoration-sage-deep underline-offset-2 hover:text-sage-deep"
        >
          Epic Digital Hub
        </a>
      </span>
    </footer>
  );
}
