// Explicit .ts extension: tests import this module under plain Node, whose
// type stripping resolves relative paths literally.
import {
  weekdayRecurring,
  type LoyaltyConfig,
  type RewardText,
} from "./program.ts";

/**
 * Every public sentence that states a number from the program — the location
 * page, the signup page, the regulament. They are generated from the config
 * so that changing the mechanics in /admin/setari changes what the customer
 * reads, instead of leaving the site promising the old deal.
 *
 * Pure and language-complete: RO/HU/EN, no translator tells, no filler.
 */

type Lang = "ro" | "hu" | "en";

function lower(text: RewardText, lang: Lang): string {
  const value = text[lang];
  return value.charAt(0).toLowerCase() + value.slice(1);
}

/**
 * "La fiecare 2 săptămâni" / "Kéthetente" / "Every 2 weeks" — the recurring
 * form, capitalised, since it opens the sentence. Hungarian does not repeat
 * the Romanian construction: it has its own distributive suffix.
 */
function periodEvery(days: number, lang: Lang): string {
  const weeks = days / 7;
  const wholeWeeks = Number.isInteger(weeks) && weeks >= 1;

  if (lang === "hu") {
    if (wholeWeeks) {
      if (weeks === 1) return "Hetente";
      if (weeks === 2) return "Kéthetente";
      return `${weeks} hetente`;
    }
    return `${days} naponta`;
  }
  if (lang === "en") {
    if (wholeWeeks) return weeks === 1 ? "Every week" : `Every ${weeks} weeks`;
    return days === 1 ? "Every day" : `Every ${days} days`;
  }
  if (wholeWeeks) {
    return weeks === 1 ? "În fiecare săptămână" : `La fiecare ${weeks} săptămâni`;
  }
  return days === 1 ? "În fiecare zi" : `La fiecare ${days} zile`;
}

/**
 * Hungarian picks the article by how the number is READ: "az öt", but "a
 * négy". Only 1 (egy) and 5 (öt) — and the fifties, which start with öt —
 * take "az" in the ranges this program uses.
 */
function huArticle(n: number): string {
  const vowel = n === 1 || n === 5 || (n >= 50 && n <= 59);
  return vowel ? "az" : "a";
}

function build(fn: (lang: Lang) => string): RewardText {
  return { ro: fn("ro"), hu: fn("hu"), en: fn("en") };
}

/**
 * Money in Romanian formatting: "1.000,00". Always two decimals — a cap is a
 * legal-ish number in the regulament, and "25 lei" next to "25,50 lei" reads
 * sloppier than a consistent column. Deterministic (no Intl), like format.ts.
 */
export function formatLei(value: number): string {
  const cents = Math.round(value * 100);
  const whole = Math.floor(cents / 100);
  const fraction = String(cents % 100).padStart(2, "0");
  const grouped = String(whole).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${grouped},${fraction}`;
}

/* --------------------------------------------------------- to-go note --- */

/** The takeaway-only disclaimer that opens the program description. */
export function toGoDisclaimer(): RewardText {
  return build((lang) => {
    if (lang === "hu") {
      return "A hűségprogram kizárólag az elvitelre vásárolt kávékra érvényes. A helyben fogyasztott kávék nem tartoznak bele. A jutalmak is csak elvitelre járnak.";
    }
    if (lang === "en") {
      return "The loyalty program is valid exclusively for takeaway coffees. Coffees consumed on-site are not included. Rewards are also takeaway only.";
    }
    return "Programul de fidelitate este valabil exclusiv pentru cafelele la pachet (to go). Cafelele consumate în locație nu sunt incluse. Și recompensele se oferă doar la pachet.";
  });
}

/* ------------------------------------------------------------- rewards --- */

/** "La 5 ștampile: o cafea din partea casei." + what happens to the card. */
export function freeDrinkRule(config: LoyaltyConfig): RewardText {
  return build((lang) => {
    const n = config.cycleLength;
    // The name is a label the manager wrote, so it stays as typed and the
    // sentence around it never assumes its gender — "o primești" would be
    // wrong the moment the reward is renamed to something masculine.
    const name = config.names.free_coffee[lang];
    if (lang === "hu") {
      return `${n} pecsétnél: ${name}. Miután megkaptad, a kártya nulláról indul újra.`;
    }
    if (lang === "en") {
      return `At ${n} stamps: ${name}. Once you claim it, the card restarts from zero.`;
    }
    return `La ${n} ștampile, primești ${name}. După ce ridici recompensa, începi un nou card.`;
  });
}

/** The optional mid-card reward; null while the manager keeps it off. */
export function midRewardRule(config: LoyaltyConfig): RewardText | null {
  if (!config.midReward.enabled) return null;
  return build((lang) => {
    const n = config.midReward.stampsRequired;
    const name = config.names.upgrade[lang];
    if (lang === "hu") {
      return `${n} pecsétnél: ${name}. A kártya megy tovább, a pecsétek megmaradnak.`;
    }
    if (lang === "en") {
      return `At ${n} stamps: ${name}. The card keeps going, your stamps stay.`;
    }
    return `La ${n} ștampile: ${name}. Cardul merge mai departe, ștampilele nu se pierd.`;
  });
}

/**
 * The value cap on rewards, for the regulament; null while no cap is set —
 * with no cap the rules must not mention one.
 */
export function rewardValueCapRule(config: LoyaltyConfig): RewardText | null {
  if (config.rewardValueCap === null) return null;
  const amount = formatLei(config.rewardValueCap);
  return build((lang) => {
    if (lang === "hu") {
      return `Egy jutalom legfeljebb ${amount} lej értékű termékre váltható be.`;
    }
    if (lang === "en") {
      return `A reward covers a product of up to ${amount} lei.`;
    }
    return `O recompensă acoperă un produs de cel mult ${amount} lei.`;
  });
}

/**
 * The birthday drink, for the regulament; null while the mechanic is off —
 * off means the rules say nothing, exactly like the double stamp.
 */
export function birthdayRule(config: LoyaltyConfig): RewardText | null {
  if (!config.birthday.enabled) return null;
  const days = config.birthday.windowDays;
  return build((lang) => {
    const name = lower(config.names.birthday_drink, lang);
    if (lang === "hu") {
      const when =
        days === 0
          ? "Aznap veheted át, a kasszánál."
          : days === 1
            ? "Aznap vagy másnap veheted át, a kasszánál."
            : `Aznap vagy az azt követő ${days} napban veheted át, a kasszánál.`;
      return `A szülinapodon: ${name}. ${when}`;
    }
    if (lang === "en") {
      const when =
        days === 0
          ? "Claim it on the day, at the counter."
          : days === 1
            ? "Claim it on the day or the day after, at the counter."
            : `Claim it on the day or within the next ${days} days, at the counter.`;
      return `On your birthday: ${name}. ${when}`;
    }
    const when =
      days === 0
        ? "Se ridică în ziua respectivă, la casă."
        : days === 1
          ? "Se ridică în ziua respectivă sau a doua zi, la casă."
          : `Se ridică în ziua respectivă sau în următoarele ${days} zile, la casă.`;
    return `De ziua ta: ${name}. ${when}`;
  });
}

/** The line on the web card while the birthday drink is claimable. */
export function birthdayCardLine(config: LoyaltyConfig): RewardText {
  return build((lang) => {
    const name = lower(config.names.birthday_drink, lang);
    if (lang === "hu") {
      return `Szülinapodra: ${name}. Mutasd a kártyád a kasszánál.`;
    }
    if (lang === "en") {
      return `For your birthday: ${name}. Show your card at the counter.`;
    }
    return `De ziua ta: ${name}. Arată cardul la casă.`;
  });
}

/** Short version for the location page and the signup page. */
export function cardSummary(config: LoyaltyConfig): RewardText {
  return build((lang) => {
    const n = config.cycleLength;
    const mid = config.midReward.enabled ? config.midReward.stampsRequired : null;
    if (lang === "hu") {
      const head =
        mid === null
          ? `${n} pecsét, és a következő ital a ház ajándéka.`
          : `${mid} pecsétnél ajándék upgrade, ${n}-nél a ház ajándéka a következő ital.`;
      return `${head} App nélkül, a kártya a telefonodban él.`;
    }
    if (lang === "en") {
      const head =
        mid === null
          ? `${n} stamps and the next drink is on the house.`
          : `An upgrade at ${mid} stamps, and at ${n} the next drink is on the house.`;
      return `${head} No app, the card stays in your phone.`;
    }
    const head =
      mid === null
        ? `${n} ștampile, iar următoarea băutură e din partea casei.`
        : `La ${mid} ștampile un upgrade, iar la ${n} următoarea băutură e din partea casei.`;
    return `${head} Fără aplicație, cardul stă în telefonul tău.`;
  });
}

/* -------------------------------------------------------------- stamps --- */

/**
 * The double-stamp window as a full sentence, for the rules page. The short
 * label form ("Marțea, 14:00 - 17:00: ștampilă dublă") lives in program.ts
 * and belongs on the card, where there is no room for a sentence.
 */
export function doubleStampRule(config: LoyaltyConfig): RewardText | null {
  const { doubleStamp } = config;
  if (!doubleStamp.enabled) return null;

  const from = `${String(doubleStamp.fromHour).padStart(2, "0")}:00`;
  const to = `${String(doubleStamp.toHour).padStart(2, "0")}:00`;
  const day = weekdayRecurring(doubleStamp.weekday);

  return build((lang) => {
    if (lang === "hu") {
      const capitalized = day.hu.charAt(0).toUpperCase() + day.hu.slice(1);
      return `${capitalized} ${from} és ${to} között a pecsét duplán számít.`;
    }
    if (lang === "en") {
      return `On ${day.en} between ${from} and ${to}, the stamp counts double.`;
    }
    const capitalized = day.ro.charAt(0).toUpperCase() + day.ro.slice(1);
    return `${capitalized}, între ${from} și ${to}, primești ștampilă dublă.`;
  });
}

/** The anti-abuse window, worded for the regulament. */
export function stampWindowRule(config: LoyaltyConfig): RewardText {
  return build((lang) => {
    const h = config.stampWindowHours;
    if (lang === "hu") {
      return `Kávézónként legfeljebb egy pecsét jár ${h} óránként. Ha aznap egy másik Origins kávézóba is beülsz, ott külön pecsétet kapsz.`;
    }
    if (lang === "en") {
      return `At most one stamp per member, per coffee shop, every ${h} hours. A visit to another Origins the same day earns its own stamp.`;
    }
    return `Poți primi o ștampilă la fiecare ${h} ore în aceeași cafenea Origins, cu excepția intervalului de ștampilă dublă. Dacă vizitezi o altă cafenea Origins în aceeași zi, poți primi o ștampilă și acolo.`;
  });
}

/* ---------------------------------------------------------------- gold --- */

export function goldQualifyRule(config: LoyaltyConfig): RewardText {
  return build((lang) => {
    const cards = config.gold.cardsRequired;
    const n = config.cycleLength;
    if (lang === "hu") {
      return `A Gold státusz ${cards} teljes kártya után automatikusan aktiválódik, vagyis miután ${cards}-szer átvetted ${huArticle(n)} ${n} pecsétes jutalmat.`;
    }
    if (lang === "en") {
      return `Gold activates automatically after ${cards} full cards, meaning after you claim the ${n}-stamp reward ${cards} times.`;
    }
    return `Devii automat membru Gold după ${cards} carduri completate și ${cards} recompense ridicate.`;
  });
}

/** The shorter Gold card; null when Gold runs on the standard card. */
export function goldCardRule(config: LoyaltyConfig): RewardText | null {
  if (config.gold.cycleLength >= config.cycleLength) return null;
  return build((lang) => {
    const g = config.gold.cycleLength;
    const n = config.cycleLength;
    if (lang === "hu") {
      return `Golddal a kártya ${g} pecsétes ${huArticle(n)} ${n} helyett: hamarabb jön a ház ajándéka.`;
    }
    if (lang === "en") {
      return `With Gold the card is ${g} stamps instead of ${n}, so the free drink comes sooner.`;
    }
    return `Cu Gold, primești o cafea din partea casei la fiecare ${g} ștampile, în loc de ${n}.`;
  });
}

export function goldKeepRule(config: LoyaltyConfig): RewardText {
  return build((lang) => {
    const days = config.gold.inactivityDays;
    const back = config.gold.requalifyCards;
    if (lang === "hu") {
      const again =
        back === 1
          ? "egy újabb teljes kártyával szerezheted vissza"
          : `${back} újabb teljes kártyával szerezheted vissza`;
      return `A Gold megtartásához minden ${days} napos időszakban legalább egyszer gyere be. Ha lejár, ${again}.`;
    }
    if (lang === "en") {
      const again =
        back === 1 ? "one more completed card" : `${back} more completed cards`;
      return `To keep Gold, you need at least one visit in every ${days}-day period. If it expires, ${again} earns it back.`;
    }
    const again =
      back === 1 ? "încă un card complet" : `încă ${back} carduri complete`;
    return `Îți păstrezi statutul Gold cu cel puțin o vizită la fiecare ${days} zile. Dacă acesta expiră, îl poți recâștiga după ce completezi încă un card.`;
  });
}

/** The rotating perks; null while they are turned off. */
export function goldPerksRule(config: LoyaltyConfig): RewardText | null {
  const { perks } = config.gold;
  if (!perks.enabled || perks.rotation.length === 0) return null;

  return build((lang) => {
    const every = periodEvery(perks.periodDays, lang);
    const names = perks.rotation.map((id) => lower(config.names[id], lang));
    const single = names.length === 1;

    if (lang === "hu") {
      const list = single
        ? names[0]
        : `előbb ${names[0]}, aztán ${names.slice(1).join(", aztán ")}`;
      const toGo = perks.toGoOnly ? " Csak elvitelre." : "";
      return `${every} kap a Gold valamit ráadásnak: ${list}. Időszakonként egyszer vehető át.${toGo}`;
    }
    if (lang === "en") {
      const list = single
        ? names[0]
        : `first ${names[0]}, then ${names.slice(1).join(", then ")}`;
      const toGo = perks.toGoOnly ? " Takeaway only." : "";
      return `${every}, Gold gets something extra: ${list}. One per period.${toGo}`;
    }
    const list = single
      ? names[0]
      : `${names[0]} în prima perioadă, ${names.slice(1).join(", apoi ")} în următoarea`;
    const toGo = perks.toGoOnly ? " Doar la pachet." : "";
    return `Ca membru Gold, ai și un beneficiu suplimentar la fiecare ${perks.periodDays} zile: ${list}. Beneficiile alternează și pot fi folosite o singură dată în perioada în care sunt disponibile.${toGo}`;
  });
}
