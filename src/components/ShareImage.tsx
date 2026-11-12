"use client";

import { useEffect, useRef, useState } from "react";
import { Download, ImageDown, Loader2, Share2, TriangleAlert } from "lucide-react";
import { tx, ui, useLang } from "@/lib/i18n";
import type { PublicDrawing } from "@/lib/drawing";
import type { ShareFormat } from "@/lib/share-image";
import { trackEvent } from "./campaign-track";

/**
 * "Descarcă imaginea": a ready-made poster of this drawing for a story or a
 * post (lib/share-image.ts). That module (canvas code + the QR library) is
 * imported only when the panel is opened, so it is not part of the page a
 * visitor downloads. On phones the poster uses the stored cup JPEG; the
 * cut-out cup is rendered live only on a desktop (same rule as the page). The image is prepared when the panel opens or
 * the format changes, so the share button can call navigator.share at once:
 * iOS only allows it directly inside the tap.
 */

interface Ready {
  key: string;
  url: string;
  file: File;
}

export default function ShareImage({
  drawing,
  label,
  url,
}: {
  drawing: PublicDrawing;
  label: string;
  url: string;
}) {
  const { lang } = useLang();
  const t = (key: keyof typeof ui) => tx(ui[key], lang);

  const [open, setOpen] = useState(false);
  const [format, setFormat] = useState<ShareFormat>("story");
  const [ready, setReady] = useState<Ready | null>(null);
  const [failedKey, setFailedKey] = useState<string | null>(null);
  const lastUrl = useRef<string | null>(null);

  const key = `${drawing.code}:${format}:${lang}`;

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const desktop = window.matchMedia("(pointer: fine) and (min-width: 1024px)").matches;
    const cupImage = drawing.cupImage;
    (async () => {
      const { renderShareImage } = await import("@/lib/share-image");
      // The live cut-out only on a desktop; a phone gets the stored JPEG.
      const cup =
        cupImage === null
          ? ({ mode: "none" } as const)
          : desktop
            ? ({
                mode: "cutout",
                canvas: await (await import("@/lib/share-image-cutout")).renderCupCutout(
                  drawing.image,
                ),
              } as const)
            : ({ mode: "photo", url: cupImage } as const);
      return renderShareImage({
        format,
        drawingUrl: drawing.image,
        cup,
        label,
        url,
        text: {
          headline1: tx(ui.posterHeadline1, lang),
          headline2: tx(ui.posterHeadline2, lang),
          linkHint: tx(ui.posterLinkHint, lang),
          closes: tx(ui.galVoteBanner, lang),
        },
      });
    })()
      .then((blob) => {
        if (cancelled) return;
        if (lastUrl.current) URL.revokeObjectURL(lastUrl.current);
        const objectUrl = URL.createObjectURL(blob);
        lastUrl.current = objectUrl;
        setReady({
          key,
          url: objectUrl,
          file: new File([blob], `desen-${drawing.code}-${format}.jpg`, { type: "image/jpeg" }),
        });
      })
      .catch(() => {
        if (!cancelled) setFailedKey(key);
      });
    return () => {
      cancelled = true;
    };
  }, [open, key, format, lang, drawing.image, drawing.cupImage, drawing.code, label, url]);

  useEffect(
    () => () => {
      if (lastUrl.current) URL.revokeObjectURL(lastUrl.current);
    },
    [],
  );

  const current = ready?.key === key ? ready : null;
  const failed = failedKey === key;
  const canShare =
    current !== null &&
    typeof navigator !== "undefined" &&
    typeof navigator.canShare === "function" &&
    navigator.canShare({ files: [current.file] });

  const share = async () => {
    if (!current) return;
    trackEvent("share", { method: "native", category: drawing.category });
    try {
      await navigator.share({ files: [current.file] });
    } catch {
      // Closed by the person, or refused by the browser: the download stays.
    }
  };

  const action =
    "relative z-20 flex w-full items-center justify-center gap-2 rounded-full px-5 py-3.5 text-[12px] font-semibold tracking-[0.06em] uppercase transition-colors";

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`mt-2.5 border border-o-ink/25 text-o-ink hover:border-o-green hover:bg-o-green hover:text-white ${action}`}
      >
        <ImageDown className="size-[18px]" strokeWidth={1.75} />
        {t("posterDownload")}
      </button>
    );
  }

  return (
    <div className="relative z-20 mt-3 rounded-3xl border border-o-ink/15 bg-white p-5" data-share-image>
      <p className="text-[14px] leading-[1.5] text-o-ink/70">{t("posterIntro")}</p>

      <div
        role="tablist"
        aria-label={t("posterDownload")}
        className="mt-4 flex gap-2 text-[11.5px] font-semibold tracking-[0.04em] uppercase"
      >
        {(["story", "post"] as const).map((option) => (
          <button
            key={option}
            type="button"
            role="tab"
            aria-selected={format === option}
            onClick={() => setFormat(option)}
            className={`rounded-full px-4 py-2 ${
              format === option ? "bg-o-ink text-white" : "border border-o-ink/20 text-o-ink"
            }`}
          >
            {option === "story" ? t("posterStory") : t("posterPost")}
          </button>
        ))}
      </div>

      <div
        className="mx-auto mt-4 flex w-full max-w-[250px] items-center justify-center overflow-hidden rounded-2xl border border-o-ink/10 bg-o-wall"
        style={{ aspectRatio: format === "story" ? "1080 / 1920" : "1080 / 1350" }}
      >
        {current ? (
          // A blob: URL made in this browser; next/image cannot optimise it.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={current.url} alt={t("posterAlt")} className="h-full w-full" data-format={format} />
        ) : failed ? (
          <TriangleAlert className="size-[22px] text-o-ink" strokeWidth={1.75} />
        ) : (
          <Loader2 className="size-[22px] animate-spin text-o-ink/50" strokeWidth={1.75} />
        )}
      </div>

      {failed && (
        <p role="alert" className="mt-3 text-[14px] font-semibold text-o-ink">
          {t("posterFailed")}
        </p>
      )}

      <div className="mt-3 flex flex-col gap-2">
        {canShare && (
          <button type="button" onClick={share} className={`bg-o-ink text-white hover:bg-o-green ${action}`}>
            <Share2 className="size-[17px]" strokeWidth={2} />
            {t("posterShare")}
          </button>
        )}
        {current ? (
          <a
            href={current.url}
            download={current.file.name}
            onClick={() => trackEvent("share", { method: "download", category: drawing.category })}
            className={
              canShare
                ? `border border-o-ink/25 text-o-ink hover:border-o-green hover:bg-o-green hover:text-white ${action}`
                : `bg-o-ink text-white hover:bg-o-green ${action}`
            }
          >
            <Download className="size-[17px]" strokeWidth={2} />
            {t("posterDownload")}
          </a>
        ) : (
          !failed && (
            <div className={`bg-o-ink text-white opacity-55 ${action}`}>
              <Loader2 className="size-[17px] animate-spin" strokeWidth={2} />
              {t("posterPreparing")}
            </div>
          )
        )}
      </div>
      {format === "story" && current && (
        <p className="mt-3 text-[13px] leading-[1.5] text-o-ink/60">{t("posterStoryTip")}</p>
      )}
    </div>
  );
}
