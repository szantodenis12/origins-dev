"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useSyncExternalStore,
} from "react";
import type { I18nText, Lang } from "./types";

const STORAGE_KEY = "origins-lang";

const LangContext = createContext<{
  lang: Lang;
  setLang: (l: Lang) => void;
}>({ lang: "ro", setLang: () => {} });

/**
 * The saved language lives in localStorage, i.e. outside React. Reading it
 * through useSyncExternalStore keeps the static HTML (always RO) hydrating
 * cleanly and picks up changes made in another tab.
 */
const listeners = new Set<() => void>();

function subscribe(onStoreChange: () => void) {
  listeners.add(onStoreChange);
  window.addEventListener("storage", onStoreChange);
  return () => {
    listeners.delete(onStoreChange);
    window.removeEventListener("storage", onStoreChange);
  };
}

function getSnapshot(): Lang {
  const saved = window.localStorage.getItem(STORAGE_KEY);
  return saved === "hu" || saved === "en" ? saved : "ro";
}

function getServerSnapshot(): Lang {
  return "ro";
}

export function LangProvider({ children }: { children: React.ReactNode }) {
  const lang = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const setLang = useCallback((l: Lang) => {
    window.localStorage.setItem(STORAGE_KEY, l);
    listeners.forEach((notify) => notify());
  }, []);

  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  const value = useMemo(() => ({ lang, setLang }), [lang, setLang]);

  return <LangContext.Provider value={value}>{children}</LangContext.Provider>;
}

export function useLang() {
  return useContext(LangContext);
}

/** Resolve an I18nText for the active language, falling back to RO. */
export function tx(text: I18nText | null, lang: Lang): string {
  if (!text) return "";
  if (lang === "ro") return text.ro;
  // An empty string counts as missing (see ui.fromPrice) and falls back too.
  return text[lang] || text.ro;
}

/** UI strings. Keep HU and EN natural — no literal translations from RO. */
export const ui = {
  location: { ro: "Locația", hu: "Helyszín", en: "Location" },
  open: { ro: "Deschis", hu: "Nyitva", en: "Open" },
  comingSoon: { ro: "În curând", hu: "Hamarosan", en: "Coming soon" },
  seasonal: { ro: "Sezonier", hu: "Szezonális", en: "Seasonal" },
  reviewsGoogle: {
    ro: "recenzii Google",
    hu: "Google értékelés",
    en: "Google reviews",
  },
  loyaltyCard: {
    ro: "Card de fidelitate",
    hu: "Hűségkártya",
    en: "Loyalty card",
  },
  leaveReview: {
    ro: "Lasă o recenzie",
    hu: "Értékelj minket",
    en: "Leave a review",
  },
  orderWolt: {
    ro: "Comandă pe Wolt",
    hu: "Rendelés Wolton",
    en: "Order on Wolt",
  },
  summerDrink: {
    ro: "Băutura verii",
    hu: "A nyár itala",
    en: "Summer drink",
  },
  housePicks: {
    ro: "Preferatele casei",
    hu: "A ház kedvencei",
    en: "House favourites",
  },
  fromPrice: { ro: "de la", hu: "", en: "from" }, // HU renders as "X lejtől"
  fromUnit: { ro: "lei", hu: "lejtől", en: "lei" }, // unit used together with fromPrice
  lei: { ro: "lei", hu: "lej", en: "lei" },
  cardTitle: { ro: "Origins Circle" },
  addToWallet: {
    ro: "Creează cardul",
    hu: "Kártya létrehozása",
    en: "Create your card",
  },
  studentTitle: {
    ro: "Elev sau student?",
    hu: "Diák vagy egyetemista vagy?",
    en: "In school or university?",
  },
  studentBody: {
    ro: "Origins Student Circle: reducere la combo-uri, cu carnetul sau legitimația la casă.",
    hu: "Origins Student Circle: kedvezmény a combókra, diákigazolvánnyal a kasszánál.",
    en: "Origins Student Circle: a discount on combos, with your school or student ID at the counter.",
  },
  chooseLocation: {
    ro: "Alege locația",
    hu: "Válassz helyszínt",
    en: "Choose a location",
  },
  menuOf: { ro: "Meniu", hu: "Étlap", en: "Menu" },
  allCategories: { ro: "Toate", hu: "Mind", en: "All" },
  // The printed card carries the allergen notice; the digital menu owes the
  // same information (Reg. UE 1169/2011), without the full legal list on a
  // phone screen — the staff has it at the counter.
  allergens: {
    ro: "Unele produse conțin alergeni. Cere personalului lista completă de ingrediente și alergeni.",
    hu: "Néhány termék allergént tartalmaz. Kérd a személyzettől a teljes összetevő- és allergénlistát.",
    en: "Some products contain allergens. Ask our staff for the full ingredient and allergen list.",
  },
  brandName: { ro: "Origins Coffee & Drinks" },
  site: { ro: "originscafe.ro" },
  chooseLocationHint: {
    ro: "Meniul, programul și cardul de fidelitate pentru fiecare cafenea Origins din Oradea.",
    hu: "Étlap, nyitvatartás és hűségkártya minden nagyváradi Origins kávézóhoz.",
    en: "Menu, hours and loyalty card for every Origins coffee shop in Oradea.",
  },
  cardFormName: { ro: "Nume și prenume", hu: "Teljes név", en: "Full name" },
  // The placeholder stays a local name in EN too — no `en` key needed.
  cardFormNamePlaceholder: { ro: "Ana Popescu", hu: "Kovács Anna" },
  cardFormPhone: { ro: "Telefon", hu: "Telefonszám", en: "Phone" },
  cardFormPhonePlaceholder: { ro: "07xx xxx xxx", hu: "07xx xxx xxx" },
  cardFormBirthday: { ro: "Zi de naștere", hu: "Születésnap", en: "Birthday" },
  cardFormBirthdayHint: {
    ro: "O folosim pentru verificarea vârstei și aplicarea regulilor pentru minori.",
    hu: "Az életkor ellenőrzéséhez és a kiskorúakra vonatkozó szabályok alkalmazásához kérjük.",
    en: "We use it to verify age and apply the rules for minors.",
  },
  cardFormStudent: {
    ro: "Sunt elev sau student",
    hu: "Diák vagy egyetemista vagyok",
    en: "I'm in school or university",
  },
  cardFormBirthdayDay: { ro: "Zi", hu: "Nap", en: "Day" },
  cardFormBirthdayMonth: { ro: "Luna", hu: "Hónap", en: "Month" },
  cardFormBirthdayYear: { ro: "An", hu: "Év", en: "Year" },
  cardFormParental: {
    ro: "Am acordul unui părinte sau tutore pentru înscriere.",
    hu: "Szülő vagy gondviselő beleegyezésével regisztrálok.",
    en: "I have a parent's or guardian's consent to sign up.",
  },
  cardFormMarketingConsent: {
    ro: "Sunt de acord să primesc notificări promoționale Origins în Wallet. Opțional; îmi pot retrage acordul oricând.",
    hu: "Hozzájárulok, hogy promóciós Origins-értesítéseket kapjak a Walletben. Nem kötelező, és bármikor visszavonható.",
    en: "I agree to receive promotional Origins notifications in Wallet. Optional; I can withdraw my consent at any time.",
  },
  cardFormSubmit: {
    ro: "Creează cardul",
    hu: "Kártya létrehozása",
    en: "Create the card",
  },
  cardFormPending: {
    ro: "Se creează cardul...",
    hu: "Kártya készül...",
    en: "Creating your card...",
  },
  cardErrName: {
    ro: "Scrie numele complet.",
    hu: "Írd be a teljes neved.",
    en: "Enter your full name.",
  },
  cardErrPhone: {
    ro: "Numărul de telefon nu pare valid.",
    hu: "A telefonszám nem tűnik érvényesnek.",
    en: "That phone number doesn't look valid.",
  },
  cardErrPhoneExists: {
    ro: "Numărul e deja înscris. Cere linkul cardului la casă.",
    hu: "Ez a szám már regisztrálva van. Kérd a kártyád linkjét a kasszánál.",
    en: "This number is already registered. Ask for your card link at the counter.",
  },
  cardErrBirthday: {
    ro: "Completează data nașterii.",
    hu: "Add meg a születési dátumod.",
    en: "Fill in your birthdate.",
  },
  cardErrParental: {
    ro: "Sub 16 ani, e nevoie de acordul unui părinte sau tutore.",
    hu: "16 év alatt szülő vagy gondviselő beleegyezése szükséges.",
    en: "Under 16, a parent's or guardian's consent is required.",
  },
  cardErrConsent: {
    ro: "Bifează acordul ca să continui.",
    hu: "A folytatáshoz pipáld be a hozzájárulást.",
    en: "Tick the consent box to continue.",
  },
  webCardShow: {
    ro: "Arată codul la casă, la fiecare comandă.",
    hu: "Mutasd a kódot a kasszánál minden rendelésnél.",
    en: "Show this code at the counter with every order.",
  },
  webCardSave: {
    ro: "Salvează pagina în bookmarks sau pe ecranul principal. Dacă pierzi linkul, îl primești înapoi la casă.",
    hu: "Mentsd el az oldalt könyvjelzőbe vagy a kezdőképernyőre. Ha elveszted a linket, a kasszánál visszakapod.",
    en: "Save this page to your bookmarks or home screen. If you lose the link, you can get it back at the counter.",
  },
  webCardWalletSoon: {
    ro: "Apple Wallet și Google Wallet: în curând. Până atunci, cardul trăiește pe această pagină.",
    hu: "Apple Wallet és Google Wallet: hamarosan. Addig a kártyád ezen az oldalon él.",
    en: "Apple Wallet and Google Wallet: coming soon. Until then, your card lives on this page.",
  },
  webCardStudentPending: {
    ro: "Reducerea de student se activează după ce arăți carnetul sau legitimația la casă.",
    hu: "A diákkedvezmény azután él, hogy megmutattad a diákigazolványod a kasszánál.",
    en: "The student discount activates once you show your student ID at the counter.",
  },
  webCardStudentActive: {
    ro: "Legitimație validată. Student Circle activ.",
    hu: "Igazolvány ellenőrizve. A Student Circle aktív.",
    en: "ID verified. Student Circle active.",
  },
  webCardReview: {
    ro: "Lasă o recenzie pe Google",
    hu: "Írj egy Google-értékelést",
    en: "Leave a Google review",
  },
  // Manager freeze (Db.setMemberBlocked): the card page says so quietly
  // instead of pretending everything is normal. No reason, no drama — the
  // conversation belongs at the counter.
  webCardBlocked: {
    ro: "Cardul este blocat momentan și nu adună ștampile. Pentru detalii, întreabă la casă.",
    hu: "A kártya jelenleg zárolva van, és nem gyűjt pecsétet. A részletekért kérdezz a kasszánál.",
    en: "This card is currently blocked and doesn't collect stamps. Ask at the counter for details.",
  },
  webCardRewardReady: {
    ro: "Ai o recompensă. Arată cardul la casă.",
    hu: "Jár egy jutalom. Mutasd a kártyád a kasszánál.",
    en: "You've earned a reward. Show your card at the counter.",
  },
  comingSoonNote: {
    ro: "Disponibil în curând",
    hu: "Hamarosan elérhető",
    en: "Available soon",
  },
  comingSoonBody: {
    ro: "Locația se redeschide în curând. Meniul complet îl găsești în celelalte cafenele Origins.",
    hu: "A helyszín hamarosan újranyit. A teljes étlapot a többi Origins kávézóban találod.",
    en: "This location reopens soon. You can find the full menu at the other Origins coffee shops.",
  },
  seeLocations: {
    ro: "Vezi toate locațiile",
    hu: "Összes helyszín",
    en: "See all locations",
  },
} satisfies Record<string, I18nText>;
