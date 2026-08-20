"use client";

import { useActionState, useState } from "react";
import { Coins, Crown, Gift, Loader2, Save, Stamp } from "lucide-react";
import type { LoyaltyConfig, RewardId } from "@/lib/program";
import { saveProgramAction } from "./actions";
import { ROTATION_LABELS, rotationKey, WEEKDAY_OPTIONS } from "./shared";
import {
  CheckField,
  fieldClass,
  hintClass,
  labelClass,
  primaryButton,
  SaveNotice,
} from "../meniu/ui";

/**
 * The whole loyalty program on one screen, so Origins can change the deal
 * without a deploy. The preview at the bottom is the copy customers will
 * actually read — it is rendered from the SAVED config, so it updates after
 * a save, never from a half-typed form.
 *
 * Staff screen: Romanian only.
 */

const strings = {
  title: "Program de fidelitate",
  intro:
    "Regulile cardului. Ce schimbi aici se vede imediat pe carduri, pe pagina cafenelei și în regulament.",
  cardSection: "Cardul standard",
  cycleLength: "Ștampile pe card",
  cycleHint: "La ultima ștampilă, băutura următoare e din partea casei.",
  midEnabled: "Recompensă la jumătatea cardului",
  midAt: "La câte ștampile",
  midHint: "Nu resetează cardul. Ștampilele merg mai departe.",
  rewardCap: "Plafon valoric pe recompense (lei)",
  rewardCapHint:
    "Valoarea maximă a produsului acoperit de o recompensă. Gol = fără plafon.",
  windowSection: "Ștampile",
  stampWindow: "Ore între două ștampile la aceeași cafenea",
  doubleEnabled: "Zi cu ștampilă dublă",
  weekday: "Ziua",
  fromHour: "De la ora",
  toHour: "Până la ora",
  birthdaySection: "Ziua de naștere",
  birthdayEnabled: "Băutură de ziua de naștere",
  birthdayWindow: "Zile după zi în care se poate ridica",
  birthdayHint: "0 înseamnă doar în ziua respectivă.",
  goldSection: "Origins Gold",
  goldEnabled: "Gold activ",
  goldCards: "Carduri complete până la Gold",
  goldRequalify: "Carduri complete după ce expiră",
  goldCycle: "Ștampile pe cardul Gold",
  goldInactivity: "Zile fără vizită până expiră",
  goldWarning: "Cu câte zile înainte anunțăm",
  perksSection: "Ce primesc membrii Gold",
  perksEnabled: "Extra pentru Gold, pe perioade",
  perksPeriod: "Zile într-o perioadă",
  perksRotation: "Ordinea",
  perksClock: "Perioada se numără",
  clockShared: "La fel pentru toți, de la o dată fixă",
  clockPersonal: "Separat, de când fiecare a devenit Gold",
  perksAnchor: "Prima perioadă începe pe",
  perksToGo: "Doar la pachet",
  namesSection: "Denumiri",
  namesHint:
    "Cum apar recompensele pe card și în regulament. RO, HU, EN.",
  save: "Salvează programul",
  // Second press of a save the server refused: the notice above the button
  // already states cine pierde ce, so the label only has to confirm.
  confirmSave: "Da, salvează",
  previewSection: "Cum sună pentru client",
  previewHint: "Textul salvat acum, în română.",
  updated: (date: string) => `Ultima modificare: ${date}`,
};

const NAME_LABELS: Record<RewardId, string> = {
  free_coffee: "Băutura din partea casei",
  upgrade: "Recompensa de la jumătatea cardului",
  gold_addon: "Extra pentru Gold",
  gold_coffee: "Cafeaua în plus pentru Gold",
  birthday_drink: "Băutura de ziua de naștere",
};

function Section({
  title,
  Icon,
  children,
}: {
  title: string;
  Icon: typeof Stamp;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-5 rounded-card border border-line p-4">
      <h2 className="flex items-center gap-2 text-[13px] font-bold tracking-[0.08em] text-ink uppercase">
        <Icon className="size-[15px] text-sage-deep" strokeWidth={2.25} />
        {title}
      </h2>
      <div className="mt-3.5 flex flex-col gap-3.5">{children}</div>
    </section>
  );
}

function NumberField({
  name,
  label,
  hint,
  defaultValue,
  min,
  max,
  disabled,
}: {
  name: string;
  label: string;
  hint?: string;
  defaultValue: number;
  min: number;
  max: number;
  disabled?: boolean;
}) {
  return (
    <div>
      <label className={labelClass} htmlFor={name}>
        {label}
      </label>
      <input
        id={name}
        name={name}
        type="number"
        inputMode="numeric"
        min={min}
        max={max}
        step={1}
        defaultValue={defaultValue}
        disabled={disabled}
        className={`mt-1.5 ${fieldClass} disabled:opacity-45`}
      />
      {hint && <p className={hintClass}>{hint}</p>}
    </div>
  );
}

export default function ProgramEditor({
  config,
  preview,
  updatedLabel,
}: {
  config: LoyaltyConfig;
  /** The public sentences, generated on the server from the saved config. */
  preview: string[];
  updatedLabel: string | null;
}) {
  const [state, formAction, pending] = useActionState(saveProgramAction, null);

  // A retroactively harmful save comes back with a token instead of saving:
  // posting it back is the "yes, I read the numbers" second press. The token
  // is derived from the settings themselves, so editing anything in between
  // makes the server warn again instead of saving blind.
  const confirmToken = state?.ok === false ? state.confirmToken : undefined;

  // Only for enabling/disabling the dependent fields — the server re-reads
  // every value from the form anyway.
  const [midOn, setMidOn] = useState(config.midReward.enabled);
  const [birthdayOn, setBirthdayOn] = useState(config.birthday.enabled);
  const [doubleOn, setDoubleOn] = useState(config.doubleStamp.enabled);
  const [goldOn, setGoldOn] = useState(config.gold.enabled);
  const [perksOn, setPerksOn] = useState(config.gold.perks.enabled);
  const [clock, setClock] = useState(config.gold.perks.clock);

  const perksDisabled = !goldOn || !perksOn;

  return (
    <form action={formAction} className="px-5 pt-4 pb-8">
      <h1 className="text-[26px] leading-[1.15] font-extrabold tracking-[-0.02em]">
        {strings.title}
      </h1>
      <p className="mt-1.5 text-[13px] leading-[1.5] text-muted">
        {strings.intro}
      </p>
      {updatedLabel && (
        <p className="mt-1 text-[12px] text-muted">
          {strings.updated(updatedLabel)}
        </p>
      )}

      <Section title={strings.cardSection} Icon={Coins}>
        <NumberField
          name="cycleLength"
          label={strings.cycleLength}
          hint={strings.cycleHint}
          defaultValue={config.cycleLength}
          min={1}
          max={30}
        />
        <CheckField
          name="midReward.enabled"
          label={strings.midEnabled}
          checked={midOn}
          onChange={setMidOn}
        />
        <NumberField
          name="midReward.stampsRequired"
          label={strings.midAt}
          hint={strings.midHint}
          defaultValue={config.midReward.stampsRequired}
          min={1}
          max={29}
          disabled={!midOn}
        />
        {/* Empty is meaningful here (no cap), so this is not a NumberField
            with a default — a blank must stay blank. */}
        <div>
          <label className={labelClass} htmlFor="rewardValueCap">
            {strings.rewardCap}
          </label>
          <input
            id="rewardValueCap"
            name="rewardValueCap"
            type="number"
            inputMode="decimal"
            min={0}
            step="0.01"
            defaultValue={config.rewardValueCap ?? ""}
            className={`mt-1.5 ${fieldClass}`}
          />
          <p className={hintClass}>{strings.rewardCapHint}</p>
        </div>
      </Section>

      <Section title={strings.birthdaySection} Icon={Gift}>
        <CheckField
          name="birthday.enabled"
          label={strings.birthdayEnabled}
          checked={birthdayOn}
          onChange={setBirthdayOn}
        />
        <NumberField
          name="birthday.windowDays"
          label={strings.birthdayWindow}
          hint={strings.birthdayHint}
          defaultValue={config.birthday.windowDays}
          min={0}
          max={30}
          disabled={!birthdayOn}
        />
      </Section>

      <Section title={strings.windowSection} Icon={Stamp}>
        <NumberField
          name="stampWindowHours"
          label={strings.stampWindow}
          defaultValue={config.stampWindowHours}
          min={0}
          max={48}
        />
        <CheckField
          name="doubleStamp.enabled"
          label={strings.doubleEnabled}
          checked={doubleOn}
          onChange={setDoubleOn}
        />
        <div>
          <label className={labelClass} htmlFor="doubleStamp.weekday">
            {strings.weekday}
          </label>
          <select
            id="doubleStamp.weekday"
            name="doubleStamp.weekday"
            defaultValue={String(config.doubleStamp.weekday)}
            disabled={!doubleOn}
            className={`mt-1.5 ${fieldClass} appearance-none disabled:opacity-45`}
          >
            {WEEKDAY_OPTIONS.map((day) => (
              <option key={day.value} value={day.value}>
                {day.label}
              </option>
            ))}
          </select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <NumberField
            name="doubleStamp.fromHour"
            label={strings.fromHour}
            defaultValue={config.doubleStamp.fromHour}
            min={0}
            max={23}
            disabled={!doubleOn}
          />
          <NumberField
            name="doubleStamp.toHour"
            label={strings.toHour}
            defaultValue={config.doubleStamp.toHour}
            min={1}
            max={24}
            disabled={!doubleOn}
          />
        </div>
      </Section>

      <Section title={strings.goldSection} Icon={Crown}>
        <CheckField
          name="gold.enabled"
          label={strings.goldEnabled}
          checked={goldOn}
          onChange={setGoldOn}
        />
        <div className="grid grid-cols-2 gap-3">
          <NumberField
            name="gold.cardsRequired"
            label={strings.goldCards}
            defaultValue={config.gold.cardsRequired}
            min={1}
            max={50}
            disabled={!goldOn}
          />
          <NumberField
            name="gold.requalifyCards"
            label={strings.goldRequalify}
            defaultValue={config.gold.requalifyCards}
            min={1}
            max={50}
            disabled={!goldOn}
          />
        </div>
        <NumberField
          name="gold.cycleLength"
          label={strings.goldCycle}
          defaultValue={config.gold.cycleLength}
          min={1}
          max={30}
          disabled={!goldOn}
        />
        <div className="grid grid-cols-2 gap-3">
          <NumberField
            name="gold.inactivityDays"
            label={strings.goldInactivity}
            defaultValue={config.gold.inactivityDays}
            min={1}
            max={365}
            disabled={!goldOn}
          />
          <NumberField
            name="gold.warningDays"
            label={strings.goldWarning}
            defaultValue={config.gold.warningDays}
            min={0}
            max={30}
            disabled={!goldOn}
          />
        </div>
      </Section>

      <Section title={strings.perksSection} Icon={Crown}>
        <CheckField
          name="gold.perks.enabled"
          label={strings.perksEnabled}
          checked={perksOn}
          onChange={setPerksOn}
          disabled={!goldOn}
        />
        <div>
          <label className={labelClass} htmlFor="gold.perks.rotation">
            {strings.perksRotation}
          </label>
          <select
            id="gold.perks.rotation"
            name="gold.perks.rotation"
            defaultValue={rotationKey(config.gold.perks.rotation)}
            disabled={perksDisabled}
            className={`mt-1.5 ${fieldClass} appearance-none disabled:opacity-45`}
          >
            {Object.entries(ROTATION_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>
        <NumberField
          name="gold.perks.periodDays"
          label={strings.perksPeriod}
          defaultValue={config.gold.perks.periodDays}
          min={1}
          max={365}
          disabled={perksDisabled}
        />
        <fieldset disabled={perksDisabled} className="disabled:opacity-45">
          <legend className={labelClass}>{strings.perksClock}</legend>
          <div className="mt-1.5 flex flex-col gap-2">
            {(
              [
                ["shared", strings.clockShared],
                ["personal", strings.clockPersonal],
              ] as const
            ).map(([value, label]) => (
              <label
                key={value}
                className="flex items-center gap-2.5 text-[13.5px] font-semibold text-ink"
              >
                <input
                  type="radio"
                  name="gold.perks.clock"
                  value={value}
                  checked={clock === value}
                  onChange={() => setClock(value)}
                  className="size-[18px] shrink-0 accent-sage-deep"
                />
                {label}
              </label>
            ))}
          </div>
        </fieldset>
        <div>
          <label className={labelClass} htmlFor="gold.perks.anchorDate">
            {strings.perksAnchor}
          </label>
          <input
            id="gold.perks.anchorDate"
            name="gold.perks.anchorDate"
            type="date"
            defaultValue={config.gold.perks.anchorDate}
            disabled={perksDisabled || clock === "personal"}
            className={`mt-1.5 ${fieldClass} disabled:opacity-45`}
          />
        </div>
        <CheckField
          name="gold.perks.toGoOnly"
          label={strings.perksToGo}
          defaultChecked={config.gold.perks.toGoOnly}
          disabled={perksDisabled}
        />
      </Section>

      <Section title={strings.namesSection} Icon={Coins}>
        <p className={hintClass}>{strings.namesHint}</p>
        {(Object.keys(NAME_LABELS) as RewardId[]).map((id) => (
          <div key={id}>
            <span className={labelClass}>{NAME_LABELS[id]}</span>
            <div className="mt-1.5 flex flex-col gap-2">
              {(["ro", "hu", "en"] as const).map((lang) => (
                <input
                  key={lang}
                  name={`name.${id}.${lang}`}
                  type="text"
                  defaultValue={config.names[id][lang]}
                  aria-label={`${NAME_LABELS[id]} (${lang.toUpperCase()})`}
                  className={fieldClass}
                />
              ))}
            </div>
          </div>
        ))}
      </Section>

      <SaveNotice state={state} />

      {confirmToken && (
        <input type="hidden" name="confirmare" value={confirmToken} />
      )}

      <button type="submit" disabled={pending} className={`mt-4 ${primaryButton}`}>
        {pending ? (
          <Loader2 className="size-[17px] animate-spin" strokeWidth={2} />
        ) : (
          <Save className="size-[17px]" strokeWidth={2} />
        )}
        {confirmToken ? strings.confirmSave : strings.save}
      </button>

      <section className="mt-6 rounded-card bg-cream p-4">
        <h2 className="text-[13px] font-bold tracking-[0.08em] text-ink uppercase">
          {strings.previewSection}
        </h2>
        <p className={hintClass}>{strings.previewHint}</p>
        <ul className="mt-2.5 flex flex-col gap-2">
          {preview.map((line) => (
            <li key={line} className="text-[13px] leading-[1.5] text-ink/80">
              {line}
            </li>
          ))}
        </ul>
      </section>
    </form>
  );
}
