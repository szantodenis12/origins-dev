"use client";

import { useActionState, useId, useState } from "react";
import { ChevronDown, Loader2, Palette, TriangleAlert } from "lucide-react";
import { drawingCategory, type DrawingLocation } from "@/lib/drawing";
import type { DrawingFormError, DrawingSignupState } from "@/lib/drawing-form";

/**
 * The drawing registration fields, shared by the public /desen page and the
 * counter screen /admin/desene/nou. Strings come in already resolved (the
 * public page picks the language, the staff screen is Romanian), the
 * server function comes in as a prop, and what to show after a successful
 * save is the caller's (`renderDone`): a download link for the parent, a
 * print label for the barista.
 */

export interface DrawingFormStrings {
  parentName: string;
  phone: string;
  phoneHint: string;
  childName: string;
  childAge: string;
  ageHint: string;
  category: string;
  categoryYears: string;
  location: string;
  consentParticipation: string;
  consentReproduction: string;
  reproductionNote: string;
  /** Opt-in: the child's first name and age next to the drawing. Unticked = code and age group only. */
  consentAttribution: string;
  consentPhoto: string;
  consentGallery: string;
  galleryNote: string;
  circleOptIn: string;
  submit: string;
  pending: string;
  errors: Record<DrawingFormError, string>;
}

export type DrawingDone = Extract<DrawingSignupState, { ok: true }>;

/**
 * One shared object, not a literal in the hook call: on the server the hook
 * hands the initial state straight back, so a fresh literal per render
 * would never equal `handled` below and the render-phase update would loop.
 */
const INITIAL: DrawingSignupState = { ok: false, error: null };

export default function DrawingForm({
  action,
  strings,
  locations,
  defaultLocation,
  legal,
  renderDone,
  hidden,
  onFirstInteraction,
  intro,
  flush = false,
}: {
  action: (
    prev: DrawingSignupState,
    formData: FormData,
  ) => Promise<DrawingSignupState>;
  strings: DrawingFormStrings;
  locations: { slug: DrawingLocation; name: string }[];
  defaultLocation?: DrawingLocation | null;
  /** The consent sentence with its links; word order differs per language. */
  legal?: React.ReactNode;
  renderDone: (
    done: DrawingDone,
    reset: () => void,
    /** What the parent ticked, for the success screen (e.g. the gallery link). */
    choices: { gallery: boolean },
  ) => React.ReactNode;
  /** Extra hidden fields, e.g. `ch`: the acquisition channel from the URL. */
  hidden?: Record<string, string>;
  /** Called once, the first time the parent types or ticks anything. */
  onFirstInteraction?: () => void;
  /** Shown above the fields, never on the success screen. */
  intro?: React.ReactNode;
  /** No side padding: the caller's column already has it. */
  flush?: boolean;
}) {
  const [state, formAction, pending] = useActionState<DrawingSignupState, FormData>(
    action,
    INITIAL,
  );
  const id = useId();

  // Controlled on purpose: React 19 resets uncontrolled fields after a form
  // action, which would wipe the parent's input on a validation error.
  const [parentName, setParentName] = useState("");
  const [phone, setPhone] = useState("");
  const [childFirstName, setChildFirstName] = useState("");
  const [childAge, setChildAge] = useState("");
  const [location, setLocation] = useState<string>(
    defaultLocation ?? locations[0]?.slug ?? "",
  );
  const [participation, setParticipation] = useState(false);
  const [reproduction, setReproduction] = useState(false);
  const [attributionName, setAttributionName] = useState(false);
  const [photo, setPhoto] = useState(false);
  const [gallery, setGallery] = useState(false);
  const [circle, setCircle] = useState(false);

  // One result per save: the "another drawing" button clears the fields and
  // hides the result until the next submit lands.
  const [shown, setShown] = useState<DrawingDone | null>(null);
  const [handled, setHandled] = useState<DrawingSignupState>(INITIAL);
  if (state !== handled) {
    setHandled(state);
    if (state.ok) setShown(state);
  }

  const reset = () => {
    setShown(null);
    setParentName("");
    setPhone("");
    setChildFirstName("");
    setChildAge("");
    setParticipation(false);
    setReproduction(false);
    setAttributionName(false);
    setPhoto(false);
    setGallery(false);
    setCircle(false);
  };

  const [started, setStarted] = useState(false);
  const firstTouch = () => {
    if (started) return;
    setStarted(true);
    onFirstInteraction?.();
  };

  if (shown) return <>{renderDone(shown, reset, { gallery })}</>;

  const category = /^\d{1,2}$/.test(childAge)
    ? drawingCategory(Number(childAge))
    : null;
  const error = !state.ok && state.error ? strings.errors[state.error] : null;

  const fieldClass =
    "w-full rounded-btn border border-line bg-paper px-3.5 py-3 text-[16px] text-ink placeholder:text-ink/50 focus:border-sage-deep focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-sage-deep";
  const labelClass = "block text-[12.5px] font-semibold text-ink/72";
  const hintClass = "mt-1.5 text-[12.5px] leading-[1.45] text-ink/65";
  const checkRowClass =
    "flex items-start gap-3 rounded-card border border-line p-4 text-[13px] leading-[1.45]";
  const checkClass =
    "mt-px size-[20px] shrink-0 accent-sage-deep focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sage-deep";

  return (
    <form
      action={formAction}
      onFocusCapture={firstTouch}
      onChangeCapture={firstTouch}
      className={`flex flex-col gap-4 pt-2 pb-2 ${flush ? "" : "px-5"}`}
    >
      {intro}
      {hidden &&
        Object.entries(hidden).map(([name, value]) => (
          <input key={name} type="hidden" name={name} value={value} />
        ))}
      <div>
        <label className={labelClass} htmlFor={`${id}-parent`}>
          {strings.parentName}
        </label>
        <input
          id={`${id}-parent`}
          name="parentName"
          type="text"
          required
          minLength={3}
          maxLength={60}
          autoComplete="name"
          value={parentName}
          onChange={(e) => setParentName(e.target.value)}
          className={`mt-1.5 ${fieldClass}`}
        />
      </div>

      <div>
        <label className={labelClass} htmlFor={`${id}-phone`}>
          {strings.phone}
        </label>
        <input
          id={`${id}-phone`}
          name="phone"
          type="tel"
          required
          inputMode="tel"
          autoComplete="tel"
          placeholder="07xx xxx xxx"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          className={`mt-1.5 ${fieldClass}`}
        />
        <p className={hintClass}>{strings.phoneHint}</p>
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)_96px] gap-2">
        <div>
          <label className={labelClass} htmlFor={`${id}-child`}>
            {strings.childName}
          </label>
          <input
            id={`${id}-child`}
            name="childFirstName"
            type="text"
            required
            minLength={2}
            maxLength={40}
            autoComplete="off"
            value={childFirstName}
            onChange={(e) => setChildFirstName(e.target.value)}
            className={`mt-1.5 ${fieldClass}`}
          />
        </div>
        <div>
          <label className={labelClass} htmlFor={`${id}-age`}>
            {strings.childAge}
          </label>
          <input
            id={`${id}-age`}
            name="childAge"
            type="number"
            required
            inputMode="numeric"
            min={3}
            max={14}
            step={1}
            value={childAge}
            onChange={(e) => setChildAge(e.target.value)}
            className={`mt-1.5 ${fieldClass}`}
          />
        </div>
      </div>
      <p className="-mt-2.5 text-[12.5px] leading-[1.45] text-ink/65">
        {category
          ? `${strings.category}: ${category} ${strings.categoryYears}`
          : strings.ageHint}
      </p>

      <div>
        <label className={labelClass} htmlFor={`${id}-location`}>
          {strings.location}
        </label>
        <div className="relative mt-1.5">
          <select
            id={`${id}-location`}
            name="location"
            required
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            className={`appearance-none pr-9 ${fieldClass}`}
          >
            {locations.map((item) => (
              <option key={item.slug} value={item.slug}>
                {item.name}
              </option>
            ))}
          </select>
          <ChevronDown
            className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-muted"
            strokeWidth={2}
          />
        </div>
      </div>

      <label className={checkRowClass}>
        <input
          type="checkbox"
          name="consentParticipation"
          required
          checked={participation}
          onChange={(e) => setParticipation(e.target.checked)}
          className={checkClass}
        />
        <span>
          {strings.consentParticipation}
          {legal && <> {legal}</>}
        </span>
      </label>

      <div className="rounded-card border border-line">
        <label className="flex items-start gap-3 p-4 text-[13px] leading-[1.45]">
          <input
            type="checkbox"
            name="consentReproduction"
            checked={reproduction}
            onChange={(e) => setReproduction(e.target.checked)}
            className={checkClass}
          />
          <span>{strings.consentReproduction}</span>
        </label>
        {!reproduction && (
          <p className="border-t border-line px-4 py-3 text-[12.5px] leading-[1.45] text-ink/65">
            {strings.reproductionNote}
          </p>
        )}
      </div>

      {/* Its own consent: online publishing is not implied by anything above. */}
      <div className="rounded-card border border-line">
        <label className="flex items-start gap-3 p-4 text-[13px] leading-[1.45]">
          <input
            type="checkbox"
            name="consentGallery"
            checked={gallery}
            onChange={(e) => setGallery(e.target.checked)}
            className={checkClass}
          />
          <span>{strings.consentGallery}</span>
        </label>
        <p className="border-t border-line px-4 py-3 text-[12.5px] leading-[1.45] text-ink/65">
          {strings.galleryNote}
        </p>
      </div>

      {/* Its own opt-in, unticked by default: the reproduction consent never
          carries the child's name (regulament art. 14.3 lit. c). */}
      {(reproduction || gallery) && (
        <label className={checkRowClass}>
          <input
            type="checkbox"
            name="attributionName"
            checked={attributionName}
            onChange={(e) => setAttributionName(e.target.checked)}
            className={checkClass}
          />
          <span>{strings.consentAttribution}</span>
        </label>
      )}

      <label className={checkRowClass}>
        <input
          type="checkbox"
          name="consentPhoto"
          checked={photo}
          onChange={(e) => setPhoto(e.target.checked)}
          className={checkClass}
        />
        <span>{strings.consentPhoto}</span>
      </label>

      <label className={checkRowClass}>
        <input
          type="checkbox"
          name="circleOptIn"
          checked={circle}
          onChange={(e) => setCircle(e.target.checked)}
          className={checkClass}
        />
        <span>{strings.circleOptIn}</span>
      </label>

      {error && (
        <div
          role="alert"
          className="flex items-start gap-2.5 rounded-card bg-cream p-4 text-[13px] font-semibold text-ink"
        >
          <TriangleAlert
            className="mt-px size-[18px] shrink-0 text-sage-deep"
            strokeWidth={2}
          />
          <span>{error}</span>
        </div>
      )}

      <button
        type="submit"
        disabled={pending}
        className="flex min-h-[52px] w-full items-center justify-center gap-2 rounded-btn bg-ink p-[15px] text-[15px] font-semibold text-paper focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sage-deep disabled:opacity-45"
      >
        {pending ? (
          <Loader2 className="size-[18px] animate-spin" strokeWidth={2} />
        ) : (
          <Palette className="size-[18px]" strokeWidth={2} />
        )}
        {pending ? strings.pending : strings.submit}
      </button>
    </form>
  );
}
