"use server";

import { cookies } from "next/headers";
import { getDb, type DrawingEntry } from "@/lib/db";
import { voteRefusal, voteTargetRefusal } from "@/lib/campaign-guards";
import { campaignMoment, recordServerEvent } from "@/lib/campaign-server";
import {
  isDisposableEmail,
  normalizeVoteCode,
  normalizeVoterEmail,
  VOTE_CODE_MAX_ATTEMPTS,
  VOTE_CODE_TTL_MS,
} from "@/lib/drawing-vote";
import { getMailer } from "@/lib/mailer";
import { mailLogoUrl, voteCodeMail } from "@/lib/mailer/vote-email";
import type { Lang } from "@/lib/types";
import {
  generateVoteCode,
  hashVoteCode,
  hashVoterEmail,
  sealVoterToken,
  VOTER_TOKEN_MAX_AGE,
} from "@/lib/vote-hash";
import {
  clientAddress,
  readVerifiedVoter,
  voteLimitAllow,
  voteSecret,
  VOTER_COOKIE,
} from "@/lib/vote-server";

/**
 * The public vote. Three server functions, reachable by direct POST like
 * any other, so each one re-checks everything: the campaign phase
 * (`not_open` before 16.11, `closed` after 03.12 23:59), that the drawing is
 * online (`gone`), that it may win a cup at all (`not_votable`: no
 * reproduction consent or drawn on other paper, regulament art. 9^1.2), the
 * address, the limits (shared by every instance).
 *
 * What comes back is a status word and nothing else. No function here
 * returns a count, a rank or anything derived from one: after voting the
 * public sees a thank-you (client decision, 10.11.2026).
 *
 * The e-mail address is used once, to send the code. What is stored is a
 * keyed hash of the normalized address (lib/vote-hash.ts).
 */

export type VoteError =
  | "not_open"
  | "closed"
  | "not_votable"
  | "gone"
  | "email"
  | "disposable"
  | "rate"
  | "mail"
  | "code_shape"
  | "wrong"
  | "expired"
  | "too_many";

export type RequestCodeResult = { ok: true } | { ok: false; error: VoteError };

export type VoteResult =
  | { ok: true; status: "voted" | "already_voted" }
  | { ok: false; error: VoteError; attemptsLeft?: number };

const MAIL_LANGS = { ro: true, hu: true, en: true } as const;

/** The live, votable entry behind a public code, or the reason there is none. */
async function votableEntry(
  drawingCode: string,
): Promise<{ entry: DrawingEntry } | { error: "not_open" | "closed" | "gone" | "not_votable" }> {
  const { phase } = await campaignMoment();
  // The calendar is checked before the store is asked about the drawing.
  const early = voteRefusal(phase);
  if (early) return { error: early };
  const entry = await getDb().findDrawingEntryByCode(String(drawingCode));
  const refused = voteTargetRefusal(entry, phase);
  if (refused) return { error: refused };
  return { entry: entry! };
}

/** The two buckets a vote event may carry: never the drawing, never the voter. */
const voteProps = (entry: DrawingEntry) => ({ location: entry.location, category: entry.category });

async function rememberVoter(emailHash: string): Promise<void> {
  const store = await cookies();
  store.set(VOTER_COOKIE, sealVoterToken(emailHash, voteSecret()), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: VOTER_TOKEN_MAX_AGE,
  });
}

/** Step 1: the voter typed an address; send the six digits. */
export async function requestVoteCodeAction(input: {
  drawing: string;
  email: string;
  lang: Lang;
}): Promise<RequestCodeResult> {
  const target = await votableEntry(input.drawing);
  if ("error" in target) return { ok: false, error: target.error };

  const email = normalizeVoterEmail(String(input.email ?? ""));
  if (!email) return { ok: false, error: "email" };
  if (isDisposableEmail(email)) return { ok: false, error: "disposable" };

  const secret = voteSecret();
  const emailHash = hashVoterEmail(email, secret);

  // Counted only once the address is well-formed: typos must not eat the budget.
  if (!(await voteLimitAllow("sendPerEmail", emailHash))) return { ok: false, error: "rate" };
  if (!(await voteLimitAllow("sendPerIp", await clientAddress()))) {
    return { ok: false, error: "rate" };
  }

  const mailer = getMailer();
  if (!mailer) return { ok: false, error: "mail" };

  const code = generateVoteCode();
  await getDb().createVoteCode({
    drawingId: target.entry.id,
    emailHash,
    codeHash: hashVoteCode(code, target.entry.id, emailHash, secret),
    expiresAt: new Date(Date.now() + VOTE_CODE_TTL_MS).toISOString(),
  });

  // Sent to the address as typed (trimmed), not the folded one: the mailbox
  // is the same, but it is the spelling its owner expects to see.
  const copy = voteCodeMail(
    input.lang in MAIL_LANGS ? input.lang : "ro",
    code,
    target.entry.code,
    mailLogoUrl({ APP_URL: process.env.APP_URL, MAIN_APP_URL: process.env.MAIN_APP_URL }),
  );
  const sent = await mailer.send({
    to: String(input.email).trim(),
    subject: copy.subject,
    text: copy.text,
    html: copy.html,
  });
  if (!sent.ok) {
    // The reason only: never the address, never the code.
    console.error(`[vot] trimiterea codului a eșuat: ${sent.reason}`);
    return { ok: false, error: "mail" };
  }
  await recordServerEvent("vote_code_request", voteProps(target.entry));
  return { ok: true };
}

/** Step 2: the six digits come back; the vote is recorded. */
export async function confirmVoteAction(input: {
  drawing: string;
  email: string;
  code: string;
}): Promise<VoteResult> {
  const target = await votableEntry(input.drawing);
  if ("error" in target) return { ok: false, error: target.error };

  const email = normalizeVoterEmail(String(input.email ?? ""));
  if (!email) return { ok: false, error: "email" };
  const code = normalizeVoteCode(String(input.code ?? ""));
  if (!code) return { ok: false, error: "code_shape" };

  if (!(await voteLimitAllow("confirmPerIp", await clientAddress()))) {
    return { ok: false, error: "rate" };
  }

  const secret = voteSecret();
  const emailHash = hashVoterEmail(email, secret);
  const result = await getDb().redeemVoteCode({
    drawingId: target.entry.id,
    emailHash,
    codeHash: hashVoteCode(code, target.entry.id, emailHash, secret),
    maxAttempts: VOTE_CODE_MAX_ATTEMPTS,
  });

  switch (result.status) {
    case "voted":
    case "already_voted":
      // The address is proven either way: later drawings need no new code.
      await rememberVoter(emailHash);
      if (result.status === "voted") {
        await recordServerEvent("vote_confirmed", voteProps(target.entry));
      }
      return { ok: true, status: result.status };
    case "wrong_code":
      return { ok: false, error: "wrong", attemptsLeft: result.attemptsLeft };
    case "too_many_attempts":
      return { ok: false, error: "too_many" };
    case "expired":
    case "no_code":
      return { ok: false, error: "expired" };
  }
}

/** A further drawing from a browser whose address is already verified. */
export async function quickVoteAction(input: { drawing: string }): Promise<VoteResult> {
  const target = await votableEntry(input.drawing);
  if ("error" in target) return { ok: false, error: target.error };

  const emailHash = await readVerifiedVoter();
  // No valid cookie: the screen falls back to the e-mail step.
  if (!emailHash) return { ok: false, error: "expired" };

  if (!(await voteLimitAllow("confirmPerIp", await clientAddress()))) {
    return { ok: false, error: "rate" };
  }

  const result = await getDb().castVote({ drawingId: target.entry.id, emailHash });
  if (result.status === "not_live") return { ok: false, error: "gone" };
  if (result.status === "voted") {
    await recordServerEvent("vote_confirmed", voteProps(target.entry));
  }
  return { ok: true, status: result.status };
}
