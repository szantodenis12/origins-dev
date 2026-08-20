import { Check, TriangleAlert } from "lucide-react";
import type { SaveState } from "./actions";

/** Shared field styling, lifted from the login screen so the admin matches. */
export const fieldClass =
  "w-full rounded-btn border border-line bg-paper px-3.5 py-3 text-[15px] text-ink outline-none placeholder:text-muted focus:border-sage-deep";
export const labelClass = "block text-[12.5px] font-semibold text-ink/72";
export const hintClass = "mt-1.5 text-[11.5px] leading-[1.45] text-muted";
export const primaryButton =
  "flex w-full items-center justify-center gap-2 rounded-btn bg-ink p-[13px] text-[14px] font-semibold text-paper disabled:opacity-45";
export const secondaryButton =
  "flex w-full items-center justify-center gap-2 rounded-btn border border-line bg-paper p-[13px] text-[14px] font-semibold text-ink disabled:opacity-45";
/** Colour is set per use: two text-* utilities in one string are a coin toss. */
export const pillClass =
  "inline-flex items-center gap-1 rounded-full bg-cream px-2.5 py-1 text-[10.5px] font-semibold";

/** Inline result of the last save, same tones as the barista panel. */
export function SaveNotice({ state }: { state: SaveState }) {
  if (!state) return null;

  return state.ok ? (
    <div
      role="status"
      className="mt-3 flex items-start gap-2 rounded-card bg-sage px-3.5 py-2.5 text-[12.5px] font-semibold text-olive"
    >
      <Check className="mt-px size-[15px] shrink-0" strokeWidth={3} />
      <span>{state.text}</span>
    </div>
  ) : (
    <div
      role="alert"
      className="mt-3 flex items-start gap-2 rounded-card bg-cream px-3.5 py-2.5 text-[12.5px] font-semibold text-ink"
    >
      <TriangleAlert
        className="mt-px size-[15px] shrink-0 text-sage-deep"
        strokeWidth={2}
      />
      <span>{state.text}</span>
    </div>
  );
}

export function CheckField({
  name,
  value,
  label,
  defaultChecked,
  checked,
  onChange,
  disabled,
}: {
  name: string;
  value?: string;
  label: string;
  defaultChecked?: boolean;
  checked?: boolean;
  onChange?: (checked: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <label
      className={`flex items-center gap-2.5 text-[13.5px] font-semibold ${
        disabled ? "text-muted" : "text-ink"
      }`}
    >
      <input
        type="checkbox"
        name={name}
        value={value}
        defaultChecked={defaultChecked}
        checked={checked}
        onChange={
          onChange ? (event) => onChange(event.target.checked) : undefined
        }
        disabled={disabled}
        className="size-[18px] shrink-0 accent-sage-deep"
      />
      {label}
    </label>
  );
}
