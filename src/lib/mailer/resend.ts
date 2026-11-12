import type { Mailer } from "./index";

/**
 * Resend over plain fetch (https://resend.com/docs/api-reference/emails/send-email):
 * one POST, no SDK to keep up to date. Errors come back as a reason for the
 * log; the recipient address is never logged.
 */
export function createResendMailer(config: { apiKey: string; from: string }): Mailer {
  return {
    async send(message) {
      try {
        const response = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${config.apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            from: config.from,
            to: [message.to],
            subject: message.subject,
            text: message.text,
            ...(message.html ? { html: message.html } : {}),
          }),
          signal: AbortSignal.timeout(10_000),
        });
        if (response.ok) return { ok: true };
        return { ok: false, reason: `resend ${response.status}` };
      } catch (error) {
        return {
          ok: false,
          reason: error instanceof Error ? error.name : "resend network error",
        };
      }
    },
  };
}
