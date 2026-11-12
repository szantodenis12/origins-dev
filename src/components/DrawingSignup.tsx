"use client";

import Link from "next/link";
import { ArrowRight, CircleAlert, RotateCcw } from "lucide-react";
import { registerDrawingAction } from "@/app/desen/actions";
import { tx, ui, useLang } from "@/lib/i18n";
import type { CampaignPhase } from "@/lib/campaign-phase";
import type { DrawingLocation } from "@/lib/drawing";
import { trackEvent } from "./campaign-track";
import {
  CafeList,
  ContestFooter,
  ContestFrame,
  ContestHeader,
  type ContestDocLinks,
  FOCUS,
  PILL,
  PILL_OUTLINE,
  WRAP,
} from "./DrawingGallery";
import DrawingForm, { type DrawingFormStrings } from "./DrawingForm";

/**
 * Public /desen: the OPTIONAL online preregistration of a drawing, in the
 * contest's own frame. It prepares the code; the entry itself is confirmed
 * only when the drawing and the signed form reach a café (regulament art.
 * 5.3). The official sheet is handed out in the cafés with a purchase
 * (Roland, 10.11.2026): never a download. Open only while the campaign
 * phase allows it; otherwise the page says when / what now.
 */

export default function DrawingSignup({
  locations,
  links,
  phase,
  channel,
  drawingBase,
}: {
  locations: { slug: DrawingLocation; name: string }[];
  /** The CONTEST rules and privacy note, not the Origins Circle pages. */
  links: ContestDocLinks;
  phase: CampaignPhase;
  /** `?ch=` / utm_source of this visit, already sanitized; "" when none. */
  channel: string;
  /** The drawing's future public address without the code, e.g. "https://xmas.originscafe.ro/". */
  drawingBase: string;
}) {
  const { lang } = useLang();
  const t = (key: keyof typeof ui) => tx(ui[key], lang);
  const open = phase === "submissions_open";

  const errors = {
    parent: t("desenErrParent"),
    phone: t("desenErrPhone"),
    child: t("desenErrChild"),
    age: t("desenErrAge"),
    location: t("desenErrLocation"),
    consent: t("desenErrConsent"),
    rate: t("desenErrRate"),
    failed: t("desenErrFailed"),
    not_open: t("desenErrNotOpen"),
    closed: t("desenErrClosed"),
  } as DrawingFormStrings["errors"];

  const strings: DrawingFormStrings = {
    parentName: t("desenParentName"),
    phone: t("desenPhone"),
    phoneHint: t("desenPhoneHint"),
    childName: t("desenChildName"),
    childAge: t("desenChildAge"),
    ageHint: t("desenAgeHint"),
    category: t("desenCategory"),
    categoryYears: t("desenCategoryYears"),
    location: t("desenLocation"),
    consentParticipation: t("desenConsentParticipation"),
    consentReproduction: t("desenConsentReproduction"),
    reproductionNote: t("desenReproductionNote"),
    consentAttribution: t("desenConsentAttribution"),
    consentPhoto: t("desenConsentPhoto"),
    consentGallery: t("desenConsentGallery"),
    galleryNote: t("desenGalleryNote"),
    circleOptIn: t("desenCircleOptIn"),
    submit: t("desenSubmit"),
    pending: t("desenPending"),
    errors,
  };

  const linkClass = `underline decoration-o-ink/40 underline-offset-2 ${FOCUS}`;
  const legal = (
    <>
      {t("desenLegalBefore")}
      <Link href={links.rules} className={linkClass}>
        {t("desenLegalRules")}
      </Link>
      {t("desenLegalBetween")}
      <Link href={links.privacy} className={linkClass}>
        {t("desenLegalPrivacy")}
      </Link>
      .
    </>
  );

  const closedText =
    phase === "before_open"
      ? t("desenNotOpen")
      : phase === "voting_only"
        ? t("desenClosedVoting")
        : t("desenClosed");

  return (
    <ContestFrame links={links} phase={phase} snow={false}>
      <ContestHeader active={null} />

      <main id="continut" tabIndex={-1} className={`${WRAP} pt-4 pb-16 outline-none lg:pt-10 lg:pb-24`}>
        <div className="mx-auto max-w-[620px]">
          <h1 className="text-[clamp(26px,3.6vw,40px)] leading-[1.14] font-extrabold tracking-[-0.01em] uppercase">
            {t("desenSignupTitle")}
          </h1>

          {!open ? (
            <div className="mt-6 flex flex-col gap-5">
              <p className="text-[16px] leading-[1.6] text-o-ink/85">{closedText}</p>
              <div className="flex flex-wrap gap-2">
                <Link href={phase === "before_open" ? "/desene#cum-participi" : "/desene#galerie"} className={`${PILL} ${FOCUS}`}>
                  {phase === "before_open" ? t("btnJoin") : t("btnGallery")}
                  <ArrowRight className="size-[14px]" strokeWidth={2} aria-hidden />
                </Link>
              </div>
            </div>
          ) : (
            <DrawingForm
              action={registerDrawingAction}
              strings={strings}
              locations={locations}
              legal={legal}
              flush
              intro={
                <div className="mt-3 mb-2 flex flex-col gap-3 text-[15.5px] leading-[1.6] text-o-ink/85">
                  <p>
                    <b className="font-semibold text-o-ink">{t("desenIntro")}</b> {t("desenIntroConfirm")}
                  </p>
                  <p className="rounded-2xl bg-o-wall px-4 py-3 text-[14.5px]">{t("desenIntroSheet")}</p>
                  <p className="text-[14.5px] text-o-ink/75">{t("desenNoPrereg")}</p>
                </div>
              }
              hidden={channel ? { ch: channel } : undefined}
              onFirstInteraction={() => trackEvent("prereg_start")}
              renderDone={(done, reset, choices) => {
                return (
                  <section className="mt-6 flex flex-col gap-5" aria-labelledby="cod-titlu">
                    <div className="rounded-3xl border-2 border-o-ink p-5 text-center lg:p-7" role="status">
                      <p id="cod-titlu" className="text-[19px] leading-[1.3] font-bold">
                        {t("desenDoneTitle")}
                      </p>
                      <p className="mt-1.5 text-[15px] leading-[1.5] text-o-ink/80">{t("desenDoneLead")}</p>
                      <p className="mt-5 text-[13px] font-semibold text-o-ink/70">{t("desenDoneCode")}</p>
                      <p className="mt-1 text-[clamp(56px,16vw,84px)] leading-none font-extrabold tracking-[-0.01em] tabular-nums select-all">
                        {done.code}
                      </p>
                      <p className="mt-4 text-[15px] leading-[1.5] font-semibold">{t("desenDoneWrite")}</p>
                      <p className="mt-1 text-[13.5px] text-o-ink/70">{t("desenDonePhoto")}</p>
                    </div>

                    <ol className="flex flex-col gap-3 text-[15px] leading-[1.55] text-o-ink/85">
                      <li>{t("desenDoneSheet")}</li>
                      <li>{t("desenDoneDeadline")}</li>
                    </ol>
                    <CafeList only={done.location} />

                    {choices.gallery && (
                      <p className="text-[15px] leading-[1.55] text-o-ink/85">
                        {t("desenDoneLink")}{" "}
                        <span className="font-semibold break-all text-o-ink select-all">
                          {`${drawingBase}${done.code}`}
                        </span>
                      </p>
                    )}

                    {!done.eligible && (
                      <p className="flex items-start gap-2.5 rounded-2xl bg-o-wall px-4 py-3 text-[14px] leading-[1.5] text-o-ink/85">
                        <CircleAlert className="mt-0.5 size-[16px] shrink-0" strokeWidth={1.75} aria-hidden />
                        {t("desenDoneExhibitOnly")}
                      </p>
                    )}

                    <button
                      type="button"
                      onClick={reset}
                      className={`${PILL_OUTLINE} ${FOCUS} self-start border-o-ink/35 text-o-ink hover:border-o-green hover:bg-o-green hover:text-white`}
                    >
                      <RotateCcw className="size-[15px]" strokeWidth={2} aria-hidden />
                      {t("desenAnother")}
                    </button>
                  </section>
                );
              }}
            />
          )}

        </div>
      </main>

      <ContestFooter />
    </ContestFrame>
  );
}
