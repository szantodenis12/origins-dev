import type { Lang } from "../types";

/**
 * The one message the contest ever sends: the voting code.
 *
 * Email is not the web. Gmail strips <style> and @font-face, Outlook lays
 * out with Word, and many readers see images turned off. So: tables, inline
 * styles, no web fonts, and the code itself as selectable text — never an
 * image. Inter Tight and Fraunces fall back to the system stack and to
 * Georgia, which is what the Wallet pass already leans on.
 *
 * Both halves are built here, so the plain-text part cannot drift from the
 * HTML: a reader on a text-only client gets the same code and the same
 * promise about their address.
 */

const INK = "#121212";
const GREEN = "#1f4d3a";
const WALL = "#f3f3f1";
const CREAM = "#f7f4ef";
const LINE = "#ececea";
const MUTED = "#8a8a8e";

const SANS =
  "'Inter Tight',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
const SERIF = "Fraunces,Georgia,'Times New Roman',serif";

interface Copy {
  subject: string;
  preheader: string;
  heading: string;
  lead: string;
  codeLabel: string;
  validity: string;
  ignore: string;
  privacy: string;
  signature: string;
}

const COPY: Record<Lang, (code: string, drawing: string) => Copy> = {
  ro: (code, drawing) => ({
    subject: `Codul tău de vot: ${code}`,
    preheader: `${code} — valabil 15 minute, pentru desenul ${drawing}.`,
    heading: "Codul tău de vot",
    lead: "Scrie-l în pagina desenului ca să confirmi votul.",
    codeLabel: "Cod",
    validity: `Valabil 15 minute, pentru desenul ${drawing}.`,
    ignore: "Dacă nu ai cerut tu codul, ignoră mesajul.",
    privacy: "Nu păstrăm adresa ta și nu îți trimitem alte mesaje.",
    signature: "Crăciunul, desenat de cei mici · Origins Coffee &amp; Drinks",
  }),
  hu: (code, drawing) => ({
    subject: `A szavazókódod: ${code}`,
    preheader: `${code} — 15 percig érvényes, a(z) ${drawing} rajzra.`,
    heading: "A szavazókódod",
    lead: "Írd be a rajz oldalán, és a szavazatod rögzül.",
    codeLabel: "Kód",
    validity: `15 percig érvényes, a(z) ${drawing} rajzra szól.`,
    ignore: "Ha nem te kérted a kódot, hagyd figyelmen kívül ezt az üzenetet.",
    privacy: "A címedet nem őrizzük meg, és nem küldünk több üzenetet.",
    signature: "A karácsonyt a gyerekek rajzolják · Origins Coffee &amp; Drinks",
  }),
  en: (code, drawing) => ({
    subject: `Your voting code: ${code}`,
    preheader: `${code} — valid for 15 minutes, for drawing ${drawing}.`,
    heading: "Your voting code",
    lead: "Type it on the drawing's page to confirm your vote.",
    codeLabel: "Code",
    validity: `Valid for 15 minutes, for drawing ${drawing}.`,
    ignore: "If you did not ask for this code, ignore this message.",
    privacy: "We do not keep your address and we send nothing else.",
    signature: "Christmas, drawn by the little ones · Origins Coffee &amp; Drinks",
  }),
};

/** Only ever wraps values this app produced, but a template is a template. */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function plainText(c: Copy, code: string): string {
  return [
    `${c.heading}: ${code}`,
    "",
    c.validity,
    "",
    `${c.ignore} ${c.privacy}`,
    "",
    c.signature.replace("&amp;", "&"),
  ].join("\n");
}

function body(c: Copy, code: string, logoUrl: string | null, lang: Lang): string {
  const logo = logoUrl
    ? `<img src="${escapeHtml(logoUrl)}" width="112" alt="Origins Coffee &amp; Drinks" style="display:block;border:0;outline:none;width:112px;height:auto;">`
    : // No logo URL configured: a word beats a broken-image icon.
      `<div style="font-family:${SERIF};font-size:19px;color:${INK};">Origins</div>`;

  return `<!doctype html>
<html lang="${lang}" style="margin:0;padding:0;">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light only">
<meta name="supported-color-schemes" content="light only">
<title>${escapeHtml(c.subject)}</title>
</head>
<body style="margin:0;padding:0;background:${WALL};-webkit-text-size-adjust:100%;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;height:0;width:0;">${escapeHtml(c.preheader)}</div>
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:${WALL};">
<tr><td align="center" style="padding:32px 16px;">

<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" style="width:100%;max-width:600px;background:#ffffff;border-radius:20px;border:1px solid ${LINE};">

  <tr><td style="padding:36px 36px 0 36px;">${logo}</td></tr>

  <tr><td style="padding:26px 36px 0 36px;">
    <h1 style="margin:0;font-family:${SERIF};font-size:30px;line-height:1.15;font-weight:600;color:${INK};letter-spacing:-0.01em;">${escapeHtml(c.heading)}</h1>
    <p style="margin:10px 0 0 0;font-family:${SANS};font-size:15px;line-height:1.55;color:#4a4a4a;">${escapeHtml(c.lead)}</p>
  </td></tr>

  <tr><td style="padding:24px 36px 0 36px;">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:${CREAM};border:1px solid ${LINE};border-radius:14px;">
      <tr><td align="center" style="padding:22px 16px 24px 16px;">
        <div style="font-family:${SANS};font-size:11px;line-height:1;letter-spacing:0.14em;text-transform:uppercase;color:${MUTED};">${escapeHtml(c.codeLabel)}</div>
        <div style="margin-top:10px;font-family:${SANS};font-size:40px;line-height:1.1;font-weight:700;letter-spacing:0.16em;color:${GREEN};">${escapeHtml(code)}</div>
      </td></tr>
    </table>
    <p style="margin:14px 0 0 0;font-family:${SANS};font-size:14px;line-height:1.55;color:#4a4a4a;">${escapeHtml(c.validity)}</p>
  </td></tr>

  <tr><td style="padding:24px 36px 0 36px;">
    <div style="height:1px;background:${LINE};line-height:1px;font-size:0;">&nbsp;</div>
  </td></tr>

  <tr><td style="padding:16px 36px 34px 36px;">
    <p style="margin:0;font-family:${SANS};font-size:13px;line-height:1.6;color:${MUTED};">${escapeHtml(c.ignore)} ${escapeHtml(c.privacy)}</p>
  </td></tr>
</table>

<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" style="width:100%;max-width:600px;">
  <tr><td align="center" style="padding:18px 16px 0 16px;">
    <p style="margin:0;font-family:${SANS};font-size:12px;line-height:1.6;color:${MUTED};">${c.signature}</p>
  </td></tr>
</table>

</td></tr>
</table>
</body>
</html>`;
}

/**
 * `logoUrl` is absolute or nothing: an email has no origin against which to
 * resolve a relative path.
 */
export function voteCodeMail(
  lang: Lang,
  code: string,
  drawing: string,
  logoUrl: string | null,
): { subject: string; text: string; html: string } {
  const copy = COPY[lang](code, drawing);
  return {
    subject: copy.subject,
    text: plainText(copy, code),
    html: body(copy, code, logoUrl, lang),
  };
}

/** Where the logo lives for a given deployment; null when nothing is set. */
export function mailLogoUrl(env: { APP_URL?: string; MAIN_APP_URL?: string }): string | null {
  const base = (env.APP_URL ?? env.MAIN_APP_URL)?.trim().replace(/\/+$/, "");
  if (!base || !/^https?:\/\/[a-z0-9.-]+(:\d{1,5})?$/i.test(base)) return null;
  // An inbox cannot reach a development machine, and a broken image there
  // would be the one thing every reader notices.
  if (/^https?:\/\/(localhost|127\.0\.0\.1)/i.test(base)) return null;
  return `${base}/brand/logo-ink.png`;
}
