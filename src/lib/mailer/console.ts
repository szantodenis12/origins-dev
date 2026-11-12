import type { Mailer } from "./index";

/**
 * Development adapter: nothing leaves the machine, the message is printed
 * in the server log. One line starts with `[mailer:dev]` and carries the
 * recipient and the subject, the text follows, so a test (or a person)
 * can read the vote code straight from the terminal.
 */
export function createConsoleMailer(): Mailer {
  return {
    async send(message) {
      console.log(
        `[mailer:dev] to=${message.to} subject=${JSON.stringify(message.subject)}\n${message.text}\n[mailer:dev] end`,
      );
      return { ok: true };
    },
  };
}
