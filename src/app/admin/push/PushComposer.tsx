"use client";

import { useCallback, useState } from "react";
import { BellRing, Check, Info, Loader2, TriangleAlert } from "lucide-react";
import { createCampaignAction, type PushFailure } from "./actions";
import {
  formatBucharestDate,
  MAX_MESSAGE,
  SEGMENTS,
  segmentLabel,
} from "./shared";
import type { PushCampaign, PushSegment } from "@/lib/db";

/** Staff screen: Romanian only. */
const strings = {
  title: "Mesaj către membri",
  intro:
    "Textul ajunge pe cardul din Wallet. Scrie scurt, se citește de pe ecranul blocat.",
  labelRo: "Mesaj (română)",
  labelHu: "Mesaj (maghiară)",
  hintHu:
    "Opțional. Membrii care au ales maghiara văd acest text în locul celui în română.",
  placeholderRo: "Marți, 14:00 - 17:00: ștampila numără de două ori.",
  placeholderHu: "Kedden 14:00 és 17:00 között duplán számít a pecsét.",
  labelSegment: "Cine primește",
  submit: "Trimite",
  saved: "Mesajul a fost înregistrat.",
  notice:
    "Pass-urile Wallet apar în faza 3. Până atunci campania se salvează aici, dar niciun telefon nu primește notificarea.",
  history: "Trimise până acum",
  empty: "Nu ai trimis încă niciun mesaj.",
  passes: (count: number) =>
    count === 1 ? "1 pass actualizat" : `${count} pass-uri actualizate`,
  errorEmpty: "Scrie mesajul în română.",
  errorLong: `Mesajul are peste ${MAX_MESSAGE} de caractere. Scurtează-l.`,
  errorSegment: "Alege cine primește mesajul.",
  errorSession: "Sesiunea a expirat. Intră din nou în tură.",
  errorFailed: "Mesajul nu a putut fi înregistrat. Mai încearcă o dată.",
};

function messageFor(reason: PushFailure): string {
  if (reason === "empty_ro") return strings.errorEmpty;
  if (reason === "too_long") return strings.errorLong;
  if (reason === "invalid_segment") return strings.errorSegment;
  return strings.errorSession;
}

export default function PushComposer({
  initialCampaigns,
}: {
  initialCampaigns: PushCampaign[];
}) {
  const [campaigns, setCampaigns] = useState(initialCampaigns);
  const [messageRo, setMessageRo] = useState("");
  const [messageHu, setMessageHu] = useState("");
  const [segment, setSegment] = useState<PushSegment>("all");
  const [sent, setSent] = useState<PushCampaign | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  const submit = useCallback(async () => {
    if (sending) return;

    // Same check the server runs, so the manager sees it without a roundtrip.
    if (messageRo.trim().length === 0) {
      setSent(null);
      setError(strings.errorEmpty);
      return;
    }

    setSending(true);
    try {
      const result = await createCampaignAction({ messageRo, messageHu, segment });
      if (!result.ok) {
        setSent(null);
        setError(messageFor(result.reason));
        return;
      }

      setCampaigns(result.campaigns);
      setSent(result.campaign);
      setError(null);
      // Cleared so the next message is written from scratch, never resent twice.
      setMessageRo("");
      setMessageHu("");
    } catch {
      setSent(null);
      setError(strings.errorFailed);
    } finally {
      setSending(false);
    }
  }, [messageHu, messageRo, segment, sending]);

  const fieldClass =
    "w-full rounded-btn border border-line bg-paper px-3.5 py-3 text-[15px] text-ink outline-none placeholder:text-muted focus:border-sage-deep";
  const labelClass = "block text-[12.5px] font-semibold text-ink/72";
  const counterClass = "text-[11.5px] font-semibold text-muted tabular-nums";

  return (
    <div className="px-5 pt-4 pb-2">
      <h1 className="text-[30px] leading-[1.1] font-extrabold tracking-[-0.02em]">
        {strings.title}
      </h1>
      <p className="mt-2 text-[13.5px] text-ink/72">{strings.intro}</p>

      {error && (
        <div
          role="alert"
          className="mt-4 flex items-start gap-2.5 rounded-card bg-cream p-4 text-[13px] font-semibold text-ink"
        >
          <TriangleAlert
            className="mt-px size-[18px] shrink-0 text-sage-deep"
            strokeWidth={2}
          />
          <span>{error}</span>
        </div>
      )}

      {sent && (
        <div
          role="status"
          className="mt-4 rounded-card bg-sage p-4 text-olive"
        >
          <div className="flex items-center gap-2.5 text-[13.5px] font-semibold">
            <Check className="size-[18px] shrink-0" strokeWidth={3} />
            <span>{strings.saved}</span>
          </div>
          <p className="mt-2 text-[12px] font-semibold tracking-[0.08em] uppercase">
            {segmentLabel(sent.segment)}
          </p>
          <p className="mt-1 text-[13.5px]">{sent.messageRo}</p>
          {sent.messageHu && (
            <p className="mt-1.5 text-[12.5px] text-olive/70">
              {sent.messageHu}
            </p>
          )}
        </div>
      )}

      <form
        className="mt-5 flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <div>
          <div className="flex items-baseline justify-between gap-3">
            <label className={labelClass} htmlFor="messageRo">
              {strings.labelRo}
            </label>
            <span className={counterClass}>
              {messageRo.length}/{MAX_MESSAGE}
            </span>
          </div>
          <textarea
            id="messageRo"
            name="messageRo"
            rows={3}
            maxLength={MAX_MESSAGE}
            placeholder={strings.placeholderRo}
            value={messageRo}
            onChange={(event) => setMessageRo(event.target.value)}
            className={`mt-1.5 resize-none leading-[1.45] ${fieldClass}`}
          />
        </div>

        <div>
          <div className="flex items-baseline justify-between gap-3">
            <label className={labelClass} htmlFor="messageHu">
              {strings.labelHu}
            </label>
            <span className={counterClass}>
              {messageHu.length}/{MAX_MESSAGE}
            </span>
          </div>
          <textarea
            id="messageHu"
            name="messageHu"
            rows={3}
            maxLength={MAX_MESSAGE}
            placeholder={strings.placeholderHu}
            value={messageHu}
            onChange={(event) => setMessageHu(event.target.value)}
            className={`mt-1.5 resize-none leading-[1.45] ${fieldClass}`}
          />
          <p className="mt-1.5 text-[12px] text-muted">{strings.hintHu}</p>
        </div>

        <div>
          <label className={labelClass} htmlFor="segment">
            {strings.labelSegment}
          </label>
          <select
            id="segment"
            name="segment"
            value={segment}
            onChange={(event) =>
              setSegment(event.target.value as PushSegment)
            }
            className={`mt-1.5 appearance-none ${fieldClass}`}
          >
            {SEGMENTS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        <button
          type="submit"
          disabled={sending || messageRo.trim().length === 0}
          className="flex w-full items-center justify-center gap-2 rounded-btn bg-ink p-[15px] text-[15px] font-semibold text-paper disabled:opacity-45"
        >
          {sending ? (
            <Loader2 className="size-[18px] animate-spin" strokeWidth={2} />
          ) : (
            <BellRing className="size-[18px]" strokeWidth={2} />
          )}
          {strings.submit}
        </button>
      </form>

      <div className="mt-6 flex items-start gap-2.5 rounded-card bg-cream p-4 text-[12.5px] leading-[1.5] text-ink/72">
        <Info className="mt-px size-[17px] shrink-0 text-sage-deep" strokeWidth={2} />
        <span>{strings.notice}</span>
      </div>

      <section className="mt-6">
        <h2 className="text-[11px] font-bold tracking-[0.18em] text-sage-deep uppercase">
          {strings.history}
        </h2>

        {campaigns.length === 0 ? (
          <p className="mt-3 text-[13px] text-muted">{strings.empty}</p>
        ) : (
          <ul className="mt-3 flex flex-col gap-2.5">
            {campaigns.map((campaign) => (
              <li
                key={campaign.id}
                className="rounded-card border border-line p-4"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[12px] font-semibold text-muted tabular-nums">
                    {formatBucharestDate(campaign.sentAt ?? campaign.createdAt)}
                  </span>
                  <span className="rounded-full bg-cream px-2.5 py-1 text-[11px] font-semibold text-sage-deep">
                    {segmentLabel(campaign.segment)}
                  </span>
                </div>
                <p className="mt-2 text-[13.5px] leading-[1.45] text-ink">
                  {campaign.messageRo}
                </p>
                {campaign.messageHu && (
                  <p className="mt-1.5 text-[12.5px] leading-[1.45] text-muted">
                    {campaign.messageHu}
                  </p>
                )}
                <p className="mt-2.5 text-[12px] text-muted">
                  {strings.passes(campaign.passesUpdated ?? 0)}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
