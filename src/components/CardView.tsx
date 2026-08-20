"use client";

import { useActionState, useMemo, useState } from "react";
import Link from "next/link";
import { ChevronDown, CreditCard, Loader2, TriangleAlert } from "lucide-react";
import { signupAction, type SignupState } from "@/app/card/actions";
import { ageOn, PARENTAL_CONSENT_AGE } from "@/lib/age";
import { tx, ui, useLang } from "@/lib/i18n";
import type { I18nText, Lang } from "@/lib/types";
import Header from "./Header";
import PhoneFrame from "./PhoneFrame";
import SiteFooter from "./SiteFooter";
import StampRow from "./StampRow";

/**
 * Faza 2.5: the form creates a real member and lands on the web card at
 * /card/{memberId}. Wallet buttons join that page in phase 3.
 */

/** Consent sentence parts — word order differs per language. */
const consent: Record<
  Lang,
  { before: string; rules: string; between: string; privacy: string }
> = {
  ro: {
    before: "Am citit ",
    rules: "regulamentul programului",
    between: " și ",
    privacy: "politica de confidențialitate",
  },
  hu: {
    before: "Elolvastam ",
    rules: "a program szabályzatát",
    between: " és ",
    privacy: "az adatkezelési tájékoztatót",
  },
  en: {
    before: "I've read ",
    rules: "the program rules",
    between: " and ",
    privacy: "the privacy policy",
  },
};

const LOCALES: Record<Lang, string> = {
  ro: "ro-RO",
  hu: "hu-HU",
  en: "en-GB",
};

function errorText(state: SignupState, lang: Lang): string | null {
  switch (state.error) {
    case "name":
      return tx(ui.cardErrName, lang);
    case "phone":
      return tx(ui.cardErrPhone, lang);
    case "phone_exists":
      return tx(ui.cardErrPhoneExists, lang);
    case "birthday":
      return tx(ui.cardErrBirthday, lang);
    case "parental":
      return tx(ui.cardErrParental, lang);
    case "consent":
      return tx(ui.cardErrConsent, lang);
    default:
      return null;
  }
}

/** Styled native select: app border/radius, custom chevron, no width fights. */
function BirthSelect({
  name,
  label,
  value,
  onChange,
  children,
}: {
  name: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  children: React.ReactNode;
}) {
  return (
    <div className="relative">
      <select
        name={name}
        required
        aria-label={label}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full appearance-none rounded-btn border border-line bg-paper py-3 pr-8 pl-3 text-[15px] text-ink outline-none focus:border-sage-deep"
      >
        <option value="">{label}</option>
        {children}
      </select>
      <ChevronDown
        className="pointer-events-none absolute top-1/2 right-2.5 size-4 -translate-y-1/2 text-muted"
        strokeWidth={2}
      />
    </div>
  );
}

export default function CardView({
  student = false,
  loyalty,
}: {
  student?: boolean;
  /** Program copy + numbers, generated on the server from the settings. */
  loyalty: {
    summary: I18nText;
    cycleLength: number;
    midRewardAt: number | null;
    doubleStampText: I18nText | null;
  };
}) {
  const { lang } = useLang();
  const [state, formAction, pending] = useActionState<SignupState, FormData>(
    signupAction,
    { error: null },
  );

  // Controlled on purpose: React 19 resets uncontrolled fields after a form
  // action, which would wipe the member's input on a validation error.
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [birthDay, setBirthDay] = useState("");
  const [birthMonth, setBirthMonth] = useState("");
  const [birthYear, setBirthYear] = useState("");
  const [isStudent, setIsStudent] = useState(student);
  const [agreed, setAgreed] = useState(false);
  const [marketingOk, setMarketingOk] = useState(false);
  const [parentOk, setParentOk] = useState(false);

  const monthNames = useMemo(() => {
    const format = new Intl.DateTimeFormat(LOCALES[lang], { month: "long" });
    return Array.from({ length: 12 }, (_, i) =>
      format.format(new Date(2000, i, 1)),
    );
  }, [lang]);

  const years = useMemo(() => {
    const current = new Date().getFullYear();
    return Array.from({ length: 100 }, (_, i) => current - i);
  }, []);

  // The age decides whether the parental box exists — the server re-checks.
  const needsParent = useMemo(() => {
    if (!birthDay || !birthMonth || !birthYear) return false;
    const age = ageOn(
      {
        day: Number(birthDay),
        month: Number(birthMonth),
        year: Number(birthYear),
      },
      new Date(),
    );
    return age < PARENTAL_CONSENT_AGE;
  }, [birthDay, birthMonth, birthYear]);

  const error = errorText(state, lang);
  const parts = consent[lang];

  const fieldClass =
    "w-full rounded-btn border border-line bg-paper px-3.5 py-3 text-[15px] text-ink outline-none placeholder:text-muted focus:border-sage-deep";
  const labelClass = "block text-[12.5px] font-semibold text-ink/72";
  const checkRowClass =
    "flex items-start gap-3 rounded-card border border-line p-4 text-[13px]";
  const linkClass = "underline decoration-sage-deep underline-offset-2";

  return (
    <PhoneFrame>
      <Header />

      <div className="px-5 pt-[22px] pb-1.5">
        <div className="text-[11px] font-bold tracking-[0.18em] text-sage-deep uppercase">
          {tx(ui.loyaltyCard, lang)}
        </div>
        <h1 className="mt-1 mb-2 text-[30px] font-extrabold tracking-[-0.02em]">
          {tx(ui.cardTitle, lang)}
        </h1>
        <p className="text-[13.5px] text-ink/72">{tx(loyalty.summary, lang)}</p>
      </div>

      <section className="mx-5 mt-3.5 mb-2.5 rounded-card border-[1.5px] border-sage p-5">
        <StampRow
          filled={0}
          total={loyalty.cycleLength}
          bonusAt={loyalty.midRewardAt}
        />
        {loyalty.doubleStampText && (
          <p className="text-center text-[12.5px] font-semibold text-sage-deep">
            {tx(loyalty.doubleStampText, lang)}
          </p>
        )}
      </section>

      <form action={formAction} className="flex flex-col gap-4 px-5 pt-2 pb-2">
        <input type="hidden" name="lang" value={lang} />

        <div>
          <label className={labelClass} htmlFor="card-name">
            {tx(ui.cardFormName, lang)}
          </label>
          <input
            id="card-name"
            name="name"
            type="text"
            required
            minLength={3}
            autoComplete="name"
            placeholder={tx(ui.cardFormNamePlaceholder, lang)}
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={`mt-1.5 ${fieldClass}`}
          />
        </div>

        <div>
          <label className={labelClass} htmlFor="card-phone">
            {tx(ui.cardFormPhone, lang)}
          </label>
          <input
            id="card-phone"
            name="phone"
            type="tel"
            required
            inputMode="tel"
            autoComplete="tel"
            placeholder={tx(ui.cardFormPhonePlaceholder, lang)}
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className={`mt-1.5 ${fieldClass}`}
          />
        </div>

        <div>
          <span className={labelClass}>{tx(ui.cardFormBirthday, lang)}</span>
          <div className="mt-1.5 grid grid-cols-[78px_minmax(0,1fr)_96px] gap-2">
            <BirthSelect
              name="birthDay"
              label={tx(ui.cardFormBirthdayDay, lang)}
              value={birthDay}
              onChange={setBirthDay}
            >
              {Array.from({ length: 31 }, (_, i) => (
                <option key={i + 1} value={i + 1}>
                  {i + 1}
                </option>
              ))}
            </BirthSelect>
            <BirthSelect
              name="birthMonth"
              label={tx(ui.cardFormBirthdayMonth, lang)}
              value={birthMonth}
              onChange={setBirthMonth}
            >
              {monthNames.map((month, i) => (
                <option key={month} value={i + 1}>
                  {month}
                </option>
              ))}
            </BirthSelect>
            <BirthSelect
              name="birthYear"
              label={tx(ui.cardFormBirthdayYear, lang)}
              value={birthYear}
              onChange={setBirthYear}
            >
              {years.map((year) => (
                <option key={year} value={year}>
                  {year}
                </option>
              ))}
            </BirthSelect>
          </div>
          <p className="mt-1.5 text-[12px] text-muted">
            {tx(ui.cardFormBirthdayHint, lang)}
          </p>
        </div>

        <label className="flex items-center gap-3 rounded-card border border-line p-4 text-[13.5px] font-semibold">
          <input
            type="checkbox"
            name="student"
            checked={isStudent}
            onChange={(e) => setIsStudent(e.target.checked)}
            className="size-[18px] shrink-0 accent-sage-deep"
          />
          {tx(ui.cardFormStudent, lang)}
        </label>

        <label className={checkRowClass}>
          <input
            type="checkbox"
            name="consent"
            required
            checked={agreed}
            onChange={(e) => setAgreed(e.target.checked)}
            className="mt-px size-[18px] shrink-0 accent-sage-deep"
          />
          <span>
            {parts.before}
            <Link href="/regulament" className={linkClass}>
              {parts.rules}
            </Link>
            {parts.between}
            <Link href="/confidentialitate" className={linkClass}>
              {parts.privacy}
            </Link>
            .
          </span>
        </label>

        <label className={checkRowClass}>
          <input
            type="checkbox"
            name="marketingConsent"
            checked={marketingOk}
            onChange={(e) => setMarketingOk(e.target.checked)}
            className="mt-px size-[18px] shrink-0 accent-sage-deep"
          />
          <span>{tx(ui.cardFormMarketingConsent, lang)}</span>
        </label>

        {/* Only an under-16 birthdate reveals this box (GDPR art. 8). */}
        {needsParent && (
          <label className={checkRowClass}>
            <input
              type="checkbox"
              name="parental"
              required
              checked={parentOk}
              onChange={(e) => setParentOk(e.target.checked)}
              className="mt-px size-[18px] shrink-0 accent-sage-deep"
            />
            <span>{tx(ui.cardFormParental, lang)}</span>
          </label>
        )}

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
          className="flex w-full items-center justify-center gap-2 rounded-btn bg-ink p-[15px] text-[15px] font-semibold text-paper disabled:opacity-45"
        >
          {pending ? (
            <Loader2 className="size-[18px] animate-spin" strokeWidth={2} />
          ) : (
            <CreditCard className="size-[18px]" strokeWidth={2} />
          )}
          {pending ? tx(ui.cardFormPending, lang) : tx(ui.cardFormSubmit, lang)}
        </button>
      </form>

      <SiteFooter />
    </PhoneFrame>
  );
}
