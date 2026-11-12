/**
 * The campaign panel's few shared classes. A working tool in the campaign
 * palette: white, ink #121212, Origins green as the one accent, Inter
 * Tight. Phone first: every control a thumb uses is at least 48 px tall.
 * It deliberately shares nothing with the Origins admin's look
 * (components/admin, PhoneFrame, sage).
 */
export const BTN =
  "flex min-h-[52px] w-full items-center justify-center gap-2.5 rounded-2xl px-5 text-[16px] font-semibold transition-colors disabled:opacity-50";
export const BTN_PRIMARY = `${BTN} bg-o-ink text-white active:bg-o-green`;
export const BTN_GREEN = `${BTN} bg-o-green text-white`;
export const BTN_QUIET = `${BTN} border border-o-ink/20 bg-white text-o-ink active:bg-o-wall`;
export const CHIP =
  "inline-flex min-h-[44px] shrink-0 items-center rounded-full px-4 text-[14px] font-semibold";
export const WRAP = "mx-auto w-full max-w-[720px] px-4 sm:px-6";
export const NOTE = "rounded-2xl bg-o-wall px-4 py-3.5 text-[14.5px] leading-[1.5] text-o-ink/85";

export const STATUS_LABEL = {
  inregistrat: "Înregistrat",
  depus: "Depus",
  expus: "Expus",
  selectat: "Selectat",
  returnat: "Returnat",
} as const;
