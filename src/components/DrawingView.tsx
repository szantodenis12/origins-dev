"use client";

import Image from "next/image";
import Link from "next/link";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useSyncExternalStore, useTransition } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Heart,
  Link2,
  Loader2,
  MessageCircle,
  RefreshCw,
  Rotate3d,
  Share2,
  TriangleAlert,
} from "lucide-react";
import {
  confirmVoteAction,
  quickVoteAction,
  requestVoteCodeAction,
  type VoteError,
} from "@/app/desene/actions";
import { tx, ui, useLang } from "@/lib/i18n";
import type { CampaignPhase } from "@/lib/campaign-phase";
import type { PublicDrawing } from "@/lib/drawing";
import { trackEvent } from "./campaign-track";
import {
  ageLabel,
  ContestFooter,
  ContestFrame,
  ContestHeader,
  type ContestDocLinks,
  DrawingCard,
  drawingLabel,
  fill,
  FOCUS,
  isVotable,
  PILL,
  PILL_OUTLINE,
  Stagger,
  WRAP,
} from "./DrawingGallery";
import { RETURN_KEY } from "./GalleryGrid";
import ShareImage from "./ShareImage";

/**
 * The live, drag-to-turn cup. Performance rule (Denis, 10.11.2026): it is
 * never part of the page a phone downloads. The default cup view is the
 * static JPEG made at upload (`drawing.cupImage`); this chunk, and the
 * cup-render module behind it, load only on a desktop (fine pointer, at
 * least 1024 px wide) and only after "Întoarce paharul" is pressed.
 */
const LiveCup = dynamic(() => import("./DrawingCupSlot"), { ssr: false });

function sentenceCase(text: string): string {
  return text.charAt(0).toLocaleUpperCase("ro") + text.slice(1);
}

const DESKTOP_QUERY = "(pointer: fine) and (min-width: 1024px)";

function subscribeDesktop(onChange: () => void) {
  const query = window.matchMedia(DESKTOP_QUERY);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

/** True on a desktop-class device; false on the server and on phones. */
function useDesktop(): boolean {
  return useSyncExternalStore(
    subscribeDesktop,
    () => window.matchMedia(DESKTOP_QUERY).matches,
    () => false,
  );
}

/**
 * /desene/[code]: one drawing. On a phone the name, the picture and
 * "Votează desenul" fit in the first screen (390 × 844); from 1024 px the
 * picture sits on the left, the name and the vote on the right. The vote
 * ends in a thank-you and nothing else: no count comes back from the
 * server, so none can be shown.
 */

type Step = "idle" | "email" | "code" | "done";

/** Seconds before "Trimite din nou codul" can be pressed again. */
const RESEND_COOLDOWN_S = 60;

function VotePanel({
  drawing,
  voterKnown,
  alreadyVoted,
}: {
  drawing: PublicDrawing;
  voterKnown: boolean;
  alreadyVoted: boolean;
}) {
  const { lang } = useLang();
  const t = (key: keyof typeof ui) => tx(ui[key], lang);

  const [step, setStep] = useState<Step>(alreadyVoted ? "done" : "idle");
  const [outcome, setOutcome] = useState<"voted" | "already_voted">(
    alreadyVoted ? "already_voted" : "voted",
  );
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<{ kind: VoteError; left?: number } | null>(null);
  /** The vote can no longer happen here (closed, not votable, gone). */
  const [stopped, setStopped] = useState(false);
  const [status, setStatus] = useState("");
  const [pending, startTransition] = useTransition();
  const [resendAt, setResendAt] = useState(0);
  const [now, setNow] = useState(0);

  const emailRef = useRef<HTMLInputElement>(null);
  const codeRef = useRef<HTMLInputElement>(null);
  const doneRef = useRef<HTMLDivElement>(null);
  const touched = useRef(false);

  // Focus follows the vote: button -> e-mail -> code -> thank-you.
  useEffect(() => {
    if (!touched.current) return;
    if (step === "email") emailRef.current?.focus();
    if (step === "code") codeRef.current?.focus();
    if (step === "done") doneRef.current?.focus();
  }, [step]);

  // The resend countdown ticks only while it runs.
  useEffect(() => {
    if (resendAt === 0) return;
    const timer = window.setInterval(() => {
      const current = Date.now();
      setNow(current);
      if (current >= resendAt) window.clearInterval(timer);
    }, 1000);
    return () => window.clearInterval(timer);
  }, [resendAt]);
  const waitS = Math.max(0, Math.ceil((resendAt - now) / 1000));

  const errorText = (e: { kind: VoteError; left?: number }): string => {
    switch (e.kind) {
      case "closed":
      case "not_open":
        return t("voteErrClosed");
      case "not_votable":
        return t("voteErrNotVotable");
      case "gone":
        return t("voteErrGone");
      case "email":
        return t("voteErrEmail");
      case "disposable":
        return t("voteErrDisposable");
      case "rate":
        return t("voteErrRate");
      case "mail":
        return t("voteErrMail");
      case "code_shape":
        return t("voteErrCodeShape");
      case "wrong":
        return `${t("voteErrWrong")} ${e.left ?? 0}.`;
      case "expired":
        return t("voteErrExpired");
      case "too_many":
        return t("voteErrTooMany");
      default:
        return t("voteErrMail");
    }
  };

  /** Shared handling of a refusal: what can be retried stays, what cannot stops. */
  const fail = (kind: VoteError, left?: number) => {
    setError({ kind, left });
    setStatus("");
    if (kind === "closed" || kind === "not_open" || kind === "not_votable" || kind === "gone") {
      setStopped(true);
      return;
    }
    // A dead code cannot be retried: back to the address, which is kept.
    if (kind === "expired" || kind === "too_many") {
      setCode("");
      setStep("email");
      emailRef.current?.focus();
    }
    if (kind === "wrong" || kind === "code_shape") {
      codeRef.current?.select();
    }
  };

  const start = () => {
    touched.current = true;
    setError(null);
    if (!voterKnown) {
      setStep("email");
      setStatus(t("voteStepEmail"));
      return;
    }
    startTransition(async () => {
      const result = await quickVoteAction({ drawing: drawing.code });
      if (result.ok) {
        setOutcome(result.status);
        setStep("done");
      } else if (result.error === "expired") {
        // The remembered address is no longer valid: ask for it again.
        setStep("email");
        setStatus(t("voteStepEmail"));
      } else {
        fail(result.error);
      }
    });
  };

  const sendCode = (again = false) => {
    touched.current = true;
    setError(null);
    startTransition(async () => {
      const result = await requestVoteCodeAction({ drawing: drawing.code, email, lang });
      if (result.ok) {
        setCode("");
        const at = Date.now();
        setNow(at);
        setResendAt(at + RESEND_COOLDOWN_S * 1000);
        setStatus(again ? t("voteResent") : `${t("voteCodeSentTo")} ${email.trim()}`);
        setStep("code");
        if (again) codeRef.current?.focus();
      } else {
        fail(result.error);
      }
    });
  };

  const confirm = () => {
    touched.current = true;
    setError(null);
    startTransition(async () => {
      const result = await confirmVoteAction({ drawing: drawing.code, email, code });
      if (result.ok) {
        setOutcome(result.status);
        setStep("done");
        return;
      }
      fail(result.error, result.attemptsLeft);
    });
  };

  const field = `relative z-20 w-full rounded-2xl border border-o-ink/30 bg-white px-4 py-3.5 text-[16px] text-o-ink placeholder:text-o-ink/60 focus:border-o-ink ${FOCUS}`;
  const primary = `${PILL} ${FOCUS} w-full !min-h-[52px] !py-4 !text-[13.5px] disabled:opacity-55`;
  const label = "block text-[13px] font-semibold text-o-ink/80";
  const hint = "mt-2.5 text-[13.5px] leading-[1.55] text-o-ink/70";
  const link = `relative z-20 inline-flex min-h-[44px] items-center justify-center gap-2 text-[13px] font-semibold text-o-ink/75 underline underline-offset-4 hover:text-o-ink disabled:no-underline disabled:opacity-60 ${FOCUS}`;

  return (
    <section className="relative z-20" aria-label={t("voteButton")}>
      {/* What changed, for screen readers; errors use role="alert" below. */}
      <p className="sr-only" aria-live="polite">
        {status}
      </p>

      {step === "done" ? (
        <div ref={doneRef} tabIndex={-1} className="rounded-3xl bg-o-wall p-5 outline-none lg:p-6">
          <div className="flex items-start gap-3">
            <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-o-green text-white">
              <Check className="size-[15px]" strokeWidth={3} aria-hidden />
            </span>
            <p role="status" className="text-[19px] leading-[1.3] font-bold lg:text-[21px]">
              {outcome === "voted" ? t("voteThanks") : t("voteAlready")}
            </p>
          </div>
          <Link
            href="/desene#galerie"
            className={`${PILL_OUTLINE} ${FOCUS} mt-5 border-o-ink/35 text-o-ink hover:border-o-green hover:bg-o-green hover:text-white`}
          >
            {t("voteMore")}
            <ArrowRight className="size-[14px]" strokeWidth={2} aria-hidden />
          </Link>
        </div>
      ) : stopped ? null : step === "idle" ? (
        <div>
          <button type="button" onClick={start} disabled={pending} className={primary}>
            {pending ? (
              <Loader2 className="size-[17px] animate-spin" strokeWidth={2} aria-hidden />
            ) : (
              <Heart className="size-[16px]" strokeWidth={2} aria-hidden />
            )}
            {t("voteButton")}
          </button>
          <p className={hint}>{voterKnown ? t("voteKnown") : t("voteRule")}</p>
        </div>
      ) : step === "email" ? (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            sendCode();
          }}
        >
          <label className={label} htmlFor="vot-email">
            {t("voteEmailLabel")}
          </label>
          <input
            ref={emailRef}
            id="vot-email"
            type="email"
            required
            inputMode="email"
            autoComplete="email"
            autoCapitalize="none"
            spellCheck={false}
            value={email}
            aria-describedby="vot-email-hint"
            onChange={(event) => setEmail(event.target.value)}
            className={`mt-2 ${field}`}
          />
          <p id="vot-email-hint" className={hint}>
            {t("voteEmailHint")}
          </p>
          <button type="submit" disabled={pending} className={`mt-4 ${primary}`}>
            {pending && <Loader2 className="size-[17px] animate-spin" strokeWidth={2} aria-hidden />}
            {pending ? t("voteSending") : t("voteSend")}
          </button>
          <p className={hint}>{t("voteRule")}</p>
        </form>
      ) : (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            confirm();
          }}
        >
          <p className="text-[14.5px] leading-[1.5] text-o-ink/80">
            {t("voteCodeSentTo")} <b className="font-semibold break-all text-o-ink">{email.trim()}</b>
          </p>
          <label className={`mt-4 ${label}`} htmlFor="vot-cod">
            {t("voteCodeLabel")}
          </label>
          <input
            ref={codeRef}
            id="vot-cod"
            type="text"
            required
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9 ]*"
            maxLength={7}
            value={code}
            aria-describedby="vot-cod-hint"
            onChange={(event) => setCode(event.target.value)}
            className={`mt-2 text-center text-[24px] font-semibold tracking-[0.3em] tabular-nums ${field}`}
          />
          <p id="vot-cod-hint" className={hint}>
            {t("voteCodeHint")}
          </p>
          <button type="submit" disabled={pending} className={`mt-4 ${primary}`}>
            {pending && <Loader2 className="size-[17px] animate-spin" strokeWidth={2} aria-hidden />}
            {pending ? t("voteConfirming") : t("voteConfirm")}
          </button>
          <div className="mt-2 flex flex-wrap items-center justify-between gap-x-4">
            <button
              type="button"
              onClick={() => sendCode(true)}
              disabled={pending || waitS > 0}
              className={link}
            >
              <RefreshCw className="size-[14px]" strokeWidth={2} aria-hidden />
              {waitS > 0 ? fill(t("voteResendIn"), { s: waitS }) : t("voteResend")}
            </button>
            <button
              type="button"
              onClick={() => {
                setError(null);
                setStep("email");
                setStatus(t("voteStepEmail"));
              }}
              className={link}
            >
              {t("voteOtherEmail")}
            </button>
          </div>
        </form>
      )}

      {error && step !== "done" && (
        <div
          role="alert"
          className="mt-4 flex items-start gap-2.5 rounded-2xl border border-o-ink/30 px-4 py-3 text-[14.5px] leading-[1.45]"
        >
          <TriangleAlert className="mt-0.5 size-[16px] shrink-0" strokeWidth={1.75} aria-hidden />
          <span>{errorText(error)}</span>
        </div>
      )}
    </section>
  );
}

function ShareRow({
  url,
  voting,
  drawing,
  label,
}: {
  url: string;
  /** The vote is open AND this drawing can be voted for. */
  voting: boolean;
  drawing: PublicDrawing;
  label: string;
}) {
  const { lang } = useLang();
  const t = (key: keyof typeof ui) => tx(ui[key], lang);
  const [copied, setCopied] = useState(false);
  const [manual, setManual] = useState(false);
  const manualRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (manual) manualRef.current?.select();
  }, [manual]);

  const text = `${voting ? t("shareText") : t("shareTextClosed")} ${url}`;
  const button = `${PILL_OUTLINE} ${FOCUS} flex-1 border-o-ink/30 !px-3 text-o-ink hover:border-o-green hover:bg-o-green hover:text-white`;

  const copy = async () => {
    trackEvent("share", { method: "copy", category: drawing.category });
    try {
      if (!navigator.clipboard) throw new Error("no clipboard");
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setManual(false);
      window.setTimeout(() => setCopied(false), 2500);
    } catch {
      // Clipboard refused (in-app browsers, http): a selectable field instead.
      setManual(true);
    }
  };

  return (
    <section className="mt-8 border-t border-o-ink/12 pt-7" aria-labelledby="share-titlu">
      <h2 id="share-titlu" className="text-[19px] leading-[1.3] font-bold lg:text-[21px]">
        {t("shareTitle")}
      </h2>
      {voting && <p className="mt-1.5 text-[14.5px] leading-[1.5] text-o-ink/75">{t("siteShareSub")}</p>}
      <div className="mt-4 flex flex-wrap gap-2">
        <a
          href={`https://wa.me/?text=${encodeURIComponent(text)}`}
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => trackEvent("share", { method: "whatsapp", category: drawing.category })}
          className={button}
        >
          <MessageCircle className="size-[15px]" strokeWidth={1.75} aria-hidden />
          WhatsApp
        </a>
        <a
          href={`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`}
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => trackEvent("share", { method: "facebook", category: drawing.category })}
          className={button}
        >
          <Share2 className="size-[15px]" strokeWidth={1.75} aria-hidden />
          Facebook
        </a>
        <button type="button" onClick={copy} className={button}>
          {copied ? (
            <Check className="size-[15px]" strokeWidth={2.25} aria-hidden />
          ) : (
            <Link2 className="size-[15px]" strokeWidth={1.75} aria-hidden />
          )}
          <span aria-live="polite">{copied ? t("shareCopied") : t("shareCopy")}</span>
        </button>
      </div>
      {manual && (
        <div className="mt-3">
          <label htmlFor="share-link" className="block text-[13.5px] leading-[1.5] text-o-ink/80">
            {t("shareManual")}
          </label>
          <input
            ref={manualRef}
            id="share-link"
            type="text"
            readOnly
            value={url}
            aria-label={t("shareLinkLabel")}
            onFocus={(event) => event.currentTarget.select()}
            className={`relative z-20 mt-2 w-full rounded-2xl border border-o-ink/30 bg-white px-4 py-3 text-[15px] text-o-ink ${FOCUS}`}
          />
        </div>
      )}
      {/* The poster says "vote": it is offered only while this drawing can be voted for. */}
      {voting && <ShareImage drawing={drawing} label={label} url={url} />}
    </section>
  );
}

export default function DrawingView({
  drawing,
  shareUrl,
  phase,
  voterKnown,
  alreadyVoted,
  others,
  links,
}: {
  links: ContestDocLinks;
  drawing: PublicDrawing;
  shareUrl: string;
  phase: CampaignPhase;
  voterKnown: boolean;
  alreadyVoted: boolean;
  /** Up to four other drawings from the same age group, random order. */
  others: PublicDrawing[];
}) {
  const { lang } = useLang();
  const t = (key: keyof typeof ui) => tx(ui[key], lang);
  const router = useRouter();
  const words = { drawing: t("galDrawing"), yearsOld: t("galYearsOld") };
  const years = t("galYears");
  const title = drawingLabel(drawing, words);
  const group = `${ageLabel(drawing.category)} ${years}`;
  const votingOpen = phase === "submissions_open" || phase === "voting_only";
  const votable = isVotable(drawing);
  // Gallery-only drawings never get a cup (no reproduction consent).
  const hasCup = votable && drawing.cupImage !== null;
  const [view, setView] = useState<"cup" | "flat">("cup");
  const showCup = hasCup && view === "cup";
  const desktop = useDesktop();
  const [turnAsked, setTurnAsked] = useState(false);
  const turning = turnAsked && desktop;

  const tab = (active: boolean) =>
    `relative z-20 inline-flex min-h-[44px] items-center rounded-full px-5 text-[12px] font-semibold tracking-[0.04em] uppercase transition-colors ${FOCUS} ${
      active ? "bg-o-ink text-white" : "border border-o-ink/25 text-o-ink hover:border-o-ink"
    }`;

  /** Back to the gallery exactly where the visitor left it, when we know where. */
  const back = (event: React.MouseEvent<HTMLAnchorElement>) => {
    try {
      const raw = window.sessionStorage.getItem(RETURN_KEY);
      if (!raw) return;
      const saved = JSON.parse(raw) as { path: string };
      event.preventDefault();
      router.push(saved.path, { scroll: false });
    } catch {
      // Fall back to the plain link.
    }
  };

  // The cup shows only the middle of the sheet (it wraps all the way
  // round), so the whole drawing stays one tap away.
  const wholeDrawing = (
    <button
      type="button"
      onClick={() => setView("flat")}
      className={`relative z-20 mt-6 flex w-full items-center gap-4 rounded-2xl bg-o-wall p-3 text-left ${FOCUS}`}
    >
      <Image
        src={drawing.image}
        alt=""
        width={drawing.imageWidth}
        height={drawing.imageHeight}
        sizes="180px"
        className="h-auto w-[110px] shrink-0 rounded-lg lg:w-[160px]"
      />
      <span className="text-[14.5px] font-semibold text-o-ink/80">{t("siteWholeDrawing")}</span>
    </button>
  );

  return (
    <ContestFrame links={links} phase={phase}>
      <ContestHeader active={null} />

      <main id="continut" tabIndex={-1} className={`${WRAP} pt-2 pb-16 outline-none lg:pt-8 lg:pb-24`}>
        <Link
          href="/desene#galerie"
          onClick={back}
          className={`relative z-20 inline-flex min-h-[44px] items-center gap-2 text-[13.5px] font-semibold text-o-ink/75 hover:text-o-ink ${FOCUS}`}
        >
          <ArrowLeft className="size-[15px]" strokeWidth={1.75} aria-hidden />
          {t("galBack")}
        </Link>

        {/* Phone: name, picture, vote, in that order, all in the first screen.
            From 1024 px: the picture on the left over two rows, the name and
            everything else on the right. */}
        <div className="mt-2 flex flex-col gap-4 lg:mt-6 lg:grid lg:grid-cols-12 lg:grid-rows-[auto_1fr] lg:gap-x-14 lg:gap-y-6 xl:gap-x-20">
          <div className="relative z-20 lg:col-span-6 lg:col-start-7 lg:row-start-1 lg:pt-2">
            <Stagger
              as="h1"
              size="md"
              align="left"
              a={title}
              b={drawing.firstName !== null ? `${t("galDrawing")} ${drawing.code}` : group}
            />
          </div>

          <div className="lg:col-span-6 lg:col-start-1 lg:row-span-2 lg:row-start-1">
            {hasCup && (
              <div role="tablist" aria-label={title} className="mb-3 flex gap-2">
                {(["cup", "flat"] as const).map((option) => (
                  <button
                    key={option}
                    type="button"
                    role="tab"
                    aria-selected={view === option}
                    onClick={() => setView(option)}
                    className={tab(view === option)}
                  >
                    {option === "cup" ? t("galViewCup") : t("galViewDrawing")}
                  </button>
                ))}
              </div>
            )}

            {showCup ? (
              <>
                <div className="relative z-20 overflow-hidden rounded-[28px] bg-[#0d1512] lg:rounded-[36px]">
                  {/* Always the stored JPEG first: no client rendering on phones. */}
                  <Image
                    src={drawing.cupImage!}
                    alt={`${title}. ${t("galCupAlt")}`}
                    width={1080}
                    height={1350}
                    sizes="(min-width: 1024px) 590px, 100vw"
                    priority
                    className="mx-auto h-auto max-h-[44svh] w-auto max-w-full lg:max-h-none lg:w-full"
                  />
                  {turning && (
                    <div className="absolute inset-0">
                      <LiveCup
                        drawing={drawing}
                        alt={`${title}. ${t("galCupAlt")}`}
                        attribution={
                          drawing.firstName !== null ? `${t("galDrawnBy")} ${title}` : undefined
                        }
                      />
                    </div>
                  )}
                  {desktop && !turning && (
                    <button
                      type="button"
                      onClick={() => setTurnAsked(true)}
                      className={`absolute bottom-5 left-1/2 inline-flex min-h-[44px] -translate-x-1/2 items-center gap-2 rounded-full bg-white px-5 py-3 text-[12px] font-semibold tracking-[0.06em] text-o-ink uppercase transition-colors hover:bg-o-green hover:text-white ${FOCUS}`}
                    >
                      <Rotate3d className="size-[15px]" strokeWidth={1.75} aria-hidden />
                      {t("cupTurn")}
                    </button>
                  )}
                </div>
                <p className="mt-2 text-[13px] leading-[1.5] text-o-ink/70 lg:text-[14px]">
                  {turning ? t("galCupHint") : t("galCupStatic")}
                </p>
              </>
            ) : (
              <div className="relative z-20 rounded-[28px] bg-o-wall p-3 lg:rounded-[36px] lg:p-10">
                <Image
                  src={drawing.image}
                  alt={title}
                  width={drawing.imageWidth}
                  height={drawing.imageHeight}
                  sizes="(min-width: 1024px) 560px, 100vw"
                  priority
                  className="mx-auto h-auto max-h-[48svh] w-auto max-w-full rounded-lg lg:max-h-none lg:w-full"
                />
              </div>
            )}
          </div>

          <div className="relative z-20 lg:col-span-6 lg:col-start-7 lg:row-start-2">
            {votingOpen && votable ? (
              <VotePanel drawing={drawing} voterKnown={voterKnown} alreadyVoted={alreadyVoted} />
            ) : votable ? (
              <p className="text-[16px] leading-[1.6] text-o-ink/85 lg:text-[17px]">
                {t("siteVoteClosedLong")}
              </p>
            ) : (
              <p className="rounded-2xl bg-o-wall px-4 py-3 text-[15px] leading-[1.55] text-o-ink/85">
                {t("galOnlyGallery")}
              </p>
            )}

            <p className="mt-5 text-[15px] leading-[1.55] text-o-ink/80 lg:text-[16px]">
              {drawing.firstName !== null ? `${sentenceCase(group)}. ` : ""}
              {votable ? (votingOpen ? t("galVoteBanner") : t("galClosedBanner")) : ""}
            </p>

            {showCup && wholeDrawing}

            <ShareRow
              url={shareUrl}
              voting={votingOpen && votable}
              drawing={drawing}
              label={title}
            />
          </div>
        </div>
      </main>

      {others.length > 0 && (
        <section
          data-snow="dark"
          aria-labelledby="alte-desene"
          className="rounded-t-[36px] bg-o-ink text-white lg:rounded-t-[56px]"
        >
          <div className={`${WRAP} py-12 lg:py-20`}>
            <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
              <Stagger id="alte-desene" align="left" a={t("h2OthersA")} b={`${t("h2OthersB")} ${group}`} />
              <Link
                href={`/desene?grupa=${drawing.category}#galerie`}
                className={`${PILL_OUTLINE} ${FOCUS} self-start border-white/60 text-white hover:border-o-green hover:bg-o-green lg:self-auto`}
              >
                {t("h2SeeAll")}
              </Link>
            </div>
            <ul className="mt-8 grid grid-cols-2 gap-x-4 gap-y-8 lg:mt-12 lg:grid-cols-4 lg:gap-x-6">
              {others.map((other) => (
                <li key={other.code}>
                  <DrawingCard drawing={other} words={words} years={years} voting={votingOpen} tone="dark" />
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}

      <ContestFooter flat={others.length > 0} />
    </ContestFrame>
  );
}
