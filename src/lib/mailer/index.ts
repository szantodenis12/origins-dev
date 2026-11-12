import { createConsoleMailer } from "./console";
import { createResendMailer } from "./resend";

/**
 * Ports and adapters, same as `lib/db` and `lib/storage`: the vote talks to
 * `Mailer`, never to a provider.
 *
 *   RESEND_API_KEY + MAIL_FROM set  -> Resend (lib/mailer/resend.ts)
 *   neither, outside production     -> console (the mail is printed in the
 *                                      server log, code included)
 *   neither, in production          -> no mailer: sending fails closed and
 *                                      the voter is told to try later. A code
 *                                      is never printed in a production log.
 *
 * MAIL_FROM is the full sender, e.g. `Origins <vot@originscafe.ro>`; the
 * domain must be verified in Resend (SPF + DKIM) or the codes land in spam.
 */

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

export type SendMailResult = { ok: true } | { ok: false; reason: string };

export interface Mailer {
  send(message: MailMessage): Promise<SendMailResult>;
}

let mailer: Mailer | null | undefined;

/** Null only in production without configuration. */
export function getMailer(): Mailer | null {
  if (mailer !== undefined) return mailer;
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = process.env.MAIL_FROM?.trim();
  if (apiKey && from) {
    mailer = createResendMailer({ apiKey, from });
  } else if (process.env.NODE_ENV !== "production") {
    mailer = createConsoleMailer();
  } else {
    mailer = null;
  }
  return mailer;
}
