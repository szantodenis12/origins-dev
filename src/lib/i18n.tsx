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

/** UI strings. Keep HU and EN natural: no literal translations from RO. */
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
  // phone screen; the staff has it at the counter.
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
  // Shown to a browser that already opened a card (lib/member-cookie.ts).
  cardReturningTitle: {
    ro: "Ai deja un card",
    hu: "Már van kártyád",
    en: "You already have a card",
  },
  cardReturningOpen: {
    ro: "Deschide cardul",
    hu: "Kártya megnyitása",
    en: "Open the card",
  },
  cardReturningOther: {
    ro: "Înscrii pe altcineva? Completează formularul de mai jos.",
    hu: "Valaki mást regisztrálsz? Töltsd ki lent az űrlapot.",
    en: "Signing someone else up? Use the form below.",
  },
  cardFormName: { ro: "Nume și prenume", hu: "Teljes név", en: "Full name" },
  // The placeholder stays a local name in EN too, so no `en` key is needed.
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
  // instead of pretending everything is normal. No reason, no drama: the
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

  /* ------------------------------------------------------------------
     Drawing contest (xmas.originscafe.ro): /desene, /desene/[code], /desen.
     Every key has RO, HU and EN: a contest page never mixes languages.
     HU still needs a native check by the Origins team (see the copy doc).
     Dates: RO DD.MM.YYYY; HU and EN in their own natural form. The cups
     are never given a firm date: "estimated, after supplier confirmation".
     The campaign's full name appears only on /regulament and
     /confidentialitate, never here.
     ------------------------------------------------------------------ */

  /* /desen: optional online preregistration */
  desenSignupTitle: {
    ro: "Preînregistrează desenul",
    hu: "A rajz előregisztrációja",
    en: "Preregister the drawing",
  },
  desenIntro: {
    ro: "Preînregistrarea e opțională. Primești codul desenului dinainte, iar în cafenea predarea merge mai repede.",
    hu: "Az előregisztráció nem kötelező. Előre megkapod a rajz kódját, így a kávézóban gyorsabban megy a leadás.",
    en: "Preregistration is optional. You get the drawing's code in advance, so handing it in at the café is quicker.",
  },
  desenIntroConfirm: {
    ro: "Participarea se confirmă când aduci desenul și formularul semnat la cafenea, până pe 01.12.2026.",
    hu: "A részvétel akkor érvényes, amikor a rajzot és az aláírt jelentkezési lapot december 1-ig behozod a kávézóba.",
    en: "The entry counts once you bring the drawing and the signed form to the café, by 1 December 2026.",
  },
  desenIntroSheet: {
    ro: "Foaia oficială de desen o primești în oricare dintre cele trei cafenele din concurs, la orice cumpărătură. Nu se descarcă de pe site.",
    hu: "A hivatalos rajzlapot bármelyik Origins kávézóban megkapod, bármilyen vásárláskor. Az oldalról nem tölthető le.",
    en: "The official drawing sheet comes free with any purchase at any Origins café. It cannot be downloaded.",
  },
  desenNoPrereg: {
    ro: "Se poate și fără preînregistrare: atunci codul îl scriu colegii noștri când aduci desenul.",
    hu: "Előregisztráció nélkül is lehet: ekkor a kódot a kollégáink írják fel, amikor behozod a rajzot.",
    en: "You can also skip this step: our staff then write the code when you bring the drawing.",
  },
  desenNotOpen: {
    ro: "Preînregistrarea se deschide pe 16.11.2026. Până atunci, poți citi cum funcționează concursul.",
    hu: "Az előregisztráció 2026. november 16-án nyílik. Addig elolvashatod, hogyan működik a pályázat.",
    en: "Preregistration opens on 16 November 2026. Until then, you can read how the contest works.",
  },
  desenClosedVoting: {
    ro: "Înscrierile s-au încheiat pe 01.12.2026. Desenele din galerie se pot vota până pe 03.12.2026, la 23:59.",
    hu: "A jelentkezés 2026. december 1-jén lezárult. A galériában lévő rajzokra 2026. december 3-án 23:59-ig lehet szavazni.",
    en: "Entries closed on 1 December 2026. The drawings in the gallery can be voted for until 3 December 2026, 23:59.",
  },
  desenClosed: {
    ro: "Înscrierile s-au încheiat pe 01.12.2026.",
    hu: "A jelentkezés 2026. december 1-jén lezárult.",
    en: "Entries closed on 1 December 2026.",
  },
  desenParentName: {
    ro: "Numele părintelui sau al tutorelui",
    hu: "A szülő vagy gondviselő neve",
    en: "Parent or guardian name",
  },
  desenPhone: { ro: "Telefon", hu: "Telefonszám", en: "Phone" },
  desenPhoneHint: {
    ro: "Îl folosim ca să te sunăm dacă desenul e selectat și ca să te identificăm când ridici desenul sau premiul. Pentru Origins Circle, doar dacă bifezi mai jos.",
    hu: "Ezen hívunk, ha a rajzot kiválasztjuk, és ez alapján azonosítunk, amikor átveszed a rajzot vagy a díjat. Az Origins Circle-höz csak akkor használjuk, ha lent bejelölöd.",
    en: "We use it to call you if the drawing is selected and to identify you when you collect the drawing or the prize. For Origins Circle only if you tick it below.",
  },
  desenChildName: {
    ro: "Prenumele copilului",
    hu: "A gyerek keresztneve",
    en: "Child's first name",
  },
  desenChildAge: {
    ro: "Vârsta copilului",
    hu: "A gyerek életkora",
    en: "Child's age",
  },
  desenAgeHint: {
    ro: "Între 3 și 14 ani. Grupa (3–5, 6–9 sau 10–14 ani) se completează singură.",
    hu: "3 és 14 év között. A korcsoport (3–5, 6–9 vagy 10–14 év) automatikusan kiderül.",
    en: "Ages 3 to 14. The age group (3–5, 6–9 or 10–14) is set automatically.",
  },
  desenCategory: { ro: "Grupa", hu: "Korcsoport", en: "Age group" },
  desenCategoryYears: { ro: "ani", hu: "év", en: "years" },
  desenLocation: {
    ro: "Cafeneaua unde aduci desenul",
    hu: "A kávézó, ahová a rajzot hozod",
    en: "Café where you bring the drawing",
  },
  desenConsentParticipation: {
    ro: "Sunt părintele sau tutorele copilului și sunt de acord cu participarea lui la concurs și cu regulamentul.",
    hu: "A gyerek szülője vagy gondviselője vagyok, és hozzájárulok a részvételéhez a pályázaton, a szabályzat szerint.",
    en: "I am the child's parent or guardian and agree to their participation and to the rules.",
  },
  desenConsentReproduction: {
    ro: "Sunt de acord ca, dacă desenul e selectat și accept premiul, să fie tipărit pe paharele Origins și folosit în materialele de comunicare ale campaniei. Drepturile de autor rămân ale copilului.",
    hu: "Hozzájárulok, hogy ha a rajzot kiválasztják és elfogadom a díjat, a rajz az Origins poharaira kerüljön, és megjelenjen a kampány kommunikációs anyagaiban. A szerzői jog a gyereknél marad.",
    en: "I agree that, if the drawing is selected and I accept the prize, it may be printed on the Origins cups and used in the campaign's communication materials. The copyright stays with the child.",
  },
  desenReproductionNote: {
    ro: "Fără acest acord, desenul stă pe peretele cafenelei, dar nu poate ajunge pe pahare și nu intră la vot.",
    hu: "Enélkül a rajzot kiállítjuk a kávézóban, de nem kerülhet pohárra, és nem lehet rá szavazni.",
    en: "Without this, the drawing is exhibited at the café but cannot go on a cup and cannot be voted for.",
  },
  desenConsentAttribution: {
    ro: "Sunt de acord ca prenumele și vârsta copilului să apară pe pahar, în galerie și în anunțul rezultatelor. Fără bifă, apar doar codul desenului și grupa de vârstă.",
    hu: "Hozzájárulok, hogy a gyerek keresztneve és életkora megjelenjen a poháron, a galériában és az eredményhirdetésben. Bejelölés nélkül csak a rajz kódja és a korcsoport látszik.",
    en: "I agree that the child's first name and age may appear on the cup, in the gallery and in the results announcement. Unticked, only the drawing's code and age group are shown.",
  },
  desenConsentGallery: {
    ro: "Sunt de acord ca desenul să fie publicat în galeria online xmas.originscafe.ro. Pagina lui o poate vedea oricine are linkul.",
    hu: "Hozzájárulok, hogy a rajz megjelenjen az xmas.originscafe.ro online galériában. Az oldalát bárki láthatja, akinek megvan a link.",
    en: "I agree that the drawing may be published in the online gallery at xmas.originscafe.ro. Anyone with the link can see its page.",
  },
  desenGalleryNote: {
    ro: "În galerie apar desenul, codul desenului și grupa de vârstă. Prenumele și vârsta copilului apar doar dacă bifezi acordul pentru nume. Fără acordul pentru galerie, desenul nu apare online și nu intră la vot. Juriul îl vede oricum.",
    hu: "A galériában a rajz, a rajz kódja és a korcsoport jelenik meg. A gyerek keresztneve és életkora csak akkor, ha a névre vonatkozó hozzájárulást is bejelölöd. A galériához való hozzájárulás nélkül a rajz nem kerül fel az internetre, és nem vesz részt a közönségszavazáson. A zsűri így is látja.",
    en: "The gallery shows the drawing, its code and the age group. The child's first name and age appear only if you tick the name consent. Without the gallery consent, the drawing does not go online and is not part of the public vote. The jury sees it either way.",
  },
  desenConsentPhoto: {
    ro: "Sunt de acord să fim fotografiați sau filmați (copilul și/sau părintele) la anunțarea rezultatelor și la evenimentul de premiere, pentru comunicarea campaniei pe canalele Origins.",
    hu: "Hozzájárulok, hogy rólunk (a gyerekről és/vagy a szülőről) fotó vagy videó készüljön az eredményhirdetésen és a díjátadón, a kampány kommunikációjához az Origins csatornáin.",
    en: "I agree that we (the child and/or the parent) may be photographed or filmed at the results announcement and at the prize event, for the campaign's communication on the Origins channels.",
  },
  desenCircleOptIn: {
    ro: "Sunt de acord să primesc informații despre Origins Circle, programul de fidelitate Origins, la telefonul de mai sus.",
    hu: "Hozzájárulok, hogy a fenti telefonszámon tájékoztatást kapjak az Origins Circle-ről, az Origins hűségprogramjáról.",
    en: "I agree to receive news about Origins Circle, the Origins loyalty programme, at the phone number above.",
  },
  desenLegalBefore: { ro: "Citește ", hu: "Olvasd el ", en: "Read " },
  desenLegalRules: {
    ro: "regulamentul concursului",
    hu: "a pályázat szabályzatát",
    en: "the contest rules",
  },
  desenLegalBetween: { ro: " și ", hu: " és ", en: " and " },
  desenLegalPrivacy: {
    ro: "nota de informare",
    hu: "az adatkezelési tájékoztatót",
    en: "the privacy notice",
  },
  desenSubmit: {
    ro: "Primește codul desenului",
    hu: "Kérem a rajz kódját",
    en: "Get the drawing's code",
  },
  desenPending: { ro: "Se pregătește codul...", hu: "Készül a kód...", en: "Preparing the code..." },
  desenErrParent: {
    ro: "Scrie numele părintelui sau al tutorelui (3–60 de caractere).",
    hu: "Írd be a szülő vagy gondviselő nevét (3–60 karakter).",
    en: "Enter the parent or guardian name (3–60 characters).",
  },
  desenErrPhone: {
    ro: "Numărul de telefon nu arată a număr românesc. Exemplu: 07xx xxx xxx.",
    hu: "A telefonszám nem tűnik romániai számnak. Példa: 07xx xxx xxx.",
    en: "That does not look like a Romanian phone number. Example: 07xx xxx xxx.",
  },
  desenErrChild: {
    ro: "Scrie prenumele copilului (2–40 de caractere).",
    hu: "Írd be a gyerek keresztnevét (2–40 karakter).",
    en: "Enter the child's first name (2–40 characters).",
  },
  desenErrAge: {
    ro: "Vârsta copilului este un număr întreg între 3 și 14.",
    hu: "A gyerek életkora egész szám 3 és 14 között.",
    en: "The child's age is a whole number between 3 and 14.",
  },
  desenErrLocation: {
    ro: "Alege cafeneaua unde aduci desenul.",
    hu: "Válaszd ki a kávézót, ahová a rajzot hozod.",
    en: "Choose the café where you bring the drawing.",
  },
  desenErrConsent: {
    ro: "Bifează acordul de participare.",
    hu: "Jelöld be a részvételi hozzájárulást.",
    en: "Tick the participation consent.",
  },
  desenErrRate: {
    ro: "Prea multe preînregistrări de pe acest telefon. Încearcă din nou peste o oră sau adu desenul direct la cafenea: codul ți-l scriem acolo.",
    hu: "Túl sok előregisztráció erről az eszközről. Próbáld újra egy óra múlva, vagy hozd be a rajzot egyenesen a kávézóba: a kódot ott felírjuk.",
    en: "Too many preregistrations from this device. Try again in an hour, or bring the drawing straight to the café: we write the code there.",
  },
  desenErrFailed: {
    ro: "Nu am putut pregăti codul. Mai încearcă o dată.",
    hu: "Nem sikerült elkészíteni a kódot. Próbáld újra.",
    en: "We could not prepare the code. Please try again.",
  },
  desenErrNotOpen: {
    ro: "Preînregistrarea se deschide pe 16.11.2026.",
    hu: "Az előregisztráció 2026. november 16-án nyílik.",
    en: "Preregistration opens on 16 November 2026.",
  },
  desenErrClosed: {
    ro: "Înscrierile s-au încheiat pe 01.12.2026.",
    hu: "A jelentkezés 2026. december 1-jén lezárult.",
    en: "Entries closed on 1 December 2026.",
  },
  desenDoneTitle: {
    ro: "Codul este pregătit.",
    hu: "A kód elkészült.",
    en: "The code is ready.",
  },
  desenDoneLead: {
    ro: "Participarea se confirmă când aduci desenul și formularul semnat la cafenea.",
    hu: "A részvétel akkor érvényes, amikor a rajzot és az aláírt jelentkezési lapot behozod a kávézóba.",
    en: "The entry counts once you bring the drawing and the signed form to the café.",
  },
  desenDoneCode: { ro: "Codul desenului", hu: "A rajz kódja", en: "Drawing code" },
  desenDoneWrite: {
    ro: "Scrie codul în cele două casete de pe foaie, câte una pe fiecare față.",
    hu: "Írd a kódot a lap két kódmezőjébe, mindkét oldalon egyet-egyet.",
    en: "Write the code in the two boxes on the sheet, one on each side.",
  },
  desenDonePhoto: {
    ro: "Fă o poză acestui ecran, ca să ai codul la îndemână.",
    hu: "Fotózd le ezt a képernyőt, hogy kéznél legyen a kód.",
    en: "Take a screenshot so you have the code at hand.",
  },
  desenDoneSheet: {
    ro: "Foaia oficială o primești în oricare dintre cele trei cafenele din concurs, la orice cumpărătură.",
    hu: "A hivatalos rajzlapot bármelyik Origins kávézóban megkapod, bármilyen vásárláskor.",
    en: "You get the official sheet at any Origins café, with any purchase.",
  },
  desenDoneDeadline: {
    ro: "Adu desenul și formularul semnat până pe 01.12.2026, la cafeneaua aleasă:",
    hu: "Hozd be a rajzot és az aláírt jelentkezési lapot 2026. december 1-ig a választott kávézóba:",
    en: "Bring the drawing and the signed form by 1 December 2026 to the café you chose:",
  },
  desenDoneLink: {
    ro: "După ce îl aduci, desenul apare la acest link, de regulă în aproximativ 24 de ore:",
    hu: "Miután behoztad, a rajz általában körülbelül 24 órán belül megjelenik ezen a linken:",
    en: "Once you bring it in, the drawing appears at this link, usually within about 24 hours:",
  },
  desenDoneExhibitOnly: {
    ro: "Fără acordul pentru pahar, desenul se expune în cafenea și poate apărea în galerie, dar nu poate ajunge pe pahar și nu intră la vot.",
    hu: "A pohárra vonatkozó hozzájárulás nélkül a rajzot kiállítjuk, és megjelenhet a galériában, de nem kerülhet pohárra, és nem lehet rá szavazni.",
    en: "Without the cup consent the drawing is exhibited and may appear in the gallery, but it cannot go on a cup and cannot be voted for.",
  },
  desenAnother: {
    ro: "Preînregistrează alt desen",
    hu: "Másik rajz előregisztrációja",
    en: "Preregister another drawing",
  },

  /* Navigation, header, footer */
  navJoin: { ro: "Cum particip", hu: "Részvétel", en: "How to join" },
  navNext: { ro: "Ce urmează", hu: "Mi következik", en: "What's next" },
  navResults: { ro: "Rezultate", hu: "Eredmények", en: "Results" },
  navGallery: { ro: "Galerie", hu: "Galéria", en: "Gallery" },
  navCalendar: { ro: "Calendar", hu: "Naptár", en: "Calendar" },
  navRules: { ro: "Regulament", hu: "Szabályzat", en: "Rules" },
  navLabel: { ro: "Navigare în pagină", hu: "Navigáció az oldalon", en: "Page navigation" },
  langLabel: { ro: "Limba", hu: "Nyelv", en: "Language" },
  skipToContent: { ro: "Sari la conținut", hu: "Ugrás a tartalomhoz", en: "Skip to content" },
  prereg: { ro: "Preînregistrare", hu: "Előregisztráció", en: "Preregister" },
  h2FootContest: { ro: "Concursul", hu: "A pályázat", en: "The contest" },
  h2FootLocations: { ro: "Cafenele", hu: "Kávézók", en: "Cafés" },
  h2FootContact: { ro: "Contact", hu: "Kapcsolat", en: "Contact" },
  siteLinkRules: { ro: "Regulamentul concursului", hu: "A pályázat szabályzata", en: "Contest rules" },
  siteLinkPrivacy: { ro: "Cum folosim datele", hu: "Hogyan kezeljük az adatokat", en: "How we use data" },
  mapOpen: { ro: "Hartă", hu: "Térkép", en: "Map" },
  mapOpenOf: { ro: "Deschide pe hartă:", hu: "Megnyitás térképen:", en: "Open on the map:" },
  siteLocPalatulNote: { ro: "de luni până vineri", hu: "hétfőtől péntekig", en: "Monday to Friday" },

  /* Hero */
  h2HeroA: {
    ro: "Anul acesta, paharul Origins de Crăciun",
    hu: "Idén az Origins karácsonyi poharát",
    en: "This year, the Origins Christmas cup",
  },
  h2HeroB: { ro: "îl desenează copiii.", hu: "gyerekek rajzolják.", en: "is drawn by children." },
  heroBefore: {
    ro: "Copiii între 3 și 14 ani desenează Crăciunul, iar zece desene ajung pe paharele Origins. Primim desene din 16.11.2026.",
    hu: "A 3–14 éves gyerekek lerajzolják a karácsonyt, és tíz rajz az Origins poharaira kerül. 2026. november 16-tól várjuk a rajzokat.",
    en: "Children aged 3 to 14 draw Christmas, and ten drawings go on the Origins cups. We take drawings from 16 November 2026.",
  },
  heroOpen: {
    ro: "Copiii între 3 și 14 ani desenează Crăciunul, iar zece desene ajung pe paharele Origins. Aduci desenul la cafenea până pe 01.12.2026.",
    hu: "A 3–14 éves gyerekek lerajzolják a karácsonyt, és tíz rajz az Origins poharaira kerül. A rajzot 2026. december 1-ig hozhatod be a kávézóba.",
    en: "Children aged 3 to 14 draw Christmas, and ten drawings go on the Origins cups. Bring the drawing to a café by 1 December 2026.",
  },
  heroVoting: {
    ro: "Nu mai primim desene. Desenele din galerie se pot vota până pe 03.12.2026, la 23:59.",
    hu: "Új rajzokat már nem fogadunk. A galériában lévő rajzokra 2026. december 3-án 23:59-ig lehet szavazni.",
    en: "We no longer take drawings. The drawings in the gallery can be voted for until 3 December 2026, 23:59.",
  },
  heroSelection: {
    ro: "Votul s-a încheiat și acum alegem cele zece desene. Rezultatele apar aici din 06.12.2026.",
    hu: "A szavazás lezárult, most választjuk ki a tíz rajzot. Az eredmények 2026. december 6-tól jelennek meg itt.",
    en: "Voting has closed and we are choosing the ten drawings. The results appear here from 6 December 2026.",
  },
  heroResults: {
    ro: "Am ales cele zece desene care ajung pe paharele Origins. Toate desenele rămân în galerie.",
    hu: "Kiválasztottuk a tíz rajzot, amely az Origins poharaira kerül. Minden rajz a galériában marad.",
    en: "We have chosen the ten drawings going on the Origins cups. All the drawings stay in the gallery.",
  },
  heroCollection: {
    ro: "Paharele cu cele zece desene au ajuns în cafenelele Origins.",
    hu: "A tíz rajzzal készült poharak megérkeztek az Origins kávézókba.",
    en: "The cups with the ten drawings have arrived at the Origins cafés.",
  },
  siteCount1: { ro: "desen până acum", hu: "rajz eddig", en: "drawing so far" },
  siteCountFew: { ro: "desene până acum", hu: "rajz eddig", en: "drawings so far" },
  siteCountMany: { ro: "de desene până acum", hu: "rajz eddig", en: "drawings so far" },
  btnJoin: { ro: "Cum particip", hu: "Hogyan vehetek részt", en: "How to join" },
  btnGallery: { ro: "Vezi galeria", hu: "A galéria", en: "See the gallery" },
  btnResults: { ro: "Vezi rezultatele", hu: "Az eredmények", en: "See the results" },

  /* Key facts band */
  factAges: { ro: "3–14 ani", hu: "3–14 év", en: "Ages 3–14" },
  factAgesLine: {
    ro: "Trei grupe: 3–5, 6–9 și 10–14 ani.",
    hu: "Három korcsoport: 3–5, 6–9 és 10–14 év.",
    en: "Three groups: 3–5, 6–9 and 10–14.",
  },
  factDeadline: { ro: "Până pe 01.12.2026", hu: "December 1-ig", en: "By 1 December" },
  factDeadlineLine: {
    ro: "Aduci desenul și formularul semnat la cafenea.",
    hu: "Behozod a rajzot és az aláírt jelentkezési lapot.",
    en: "Bring the drawing and the signed form to a café.",
  },
  factSheet: { ro: "Foaia, în cafenea", hu: "A rajzlap a kávézóban", en: "Sheet at the café" },
  factSheetLine: {
    ro: "O primești la orice cumpărătură.",
    hu: "Bármilyen vásárláskor megkapod.",
    en: "Free with any purchase.",
  },
  factVote: { ro: "Vot gratuit", hu: "Ingyenes szavazás", en: "Free vote" },
  factVoteLine: {
    ro: "Confirmat cu un cod primit pe e-mail.",
    hu: "E-mailben kapott kóddal megerősítve.",
    en: "Confirmed with a code sent by e-mail.",
  },
  factVoteClose: { ro: "Vot până pe 03.12", hu: "Szavazás december 3-ig", en: "Vote until 3 December" },
  factVoteCloseLine: {
    ro: "La 23:59 se închide votul pentru toate desenele.",
    hu: "23:59-kor minden rajzra lezárul a szavazás.",
    en: "Voting closes for every drawing at 23:59.",
  },
  factResults: { ro: "Rezultate din 06.12", hu: "Eredmények december 6-tól", en: "Results from 6 December" },
  factResultsLine: {
    ro: "Le anunțăm aici și în cafenele.",
    hu: "Itt és a kávézókban hirdetjük ki.",
    en: "Announced here and in the cafés.",
  },
  factCups: { ro: "Paharele, estimativ din 18.12", hu: "Poharak várhatóan december 18-tól", en: "Cups expected from 18 December" },
  factCupsLine: {
    ro: "Ziua exactă, după confirmarea furnizorului.",
    hu: "A pontos napot a beszállító visszaigazolása után közöljük.",
    en: "Exact day once the supplier confirms.",
  },
  factWall: { ro: "Desenele, pe perete", hu: "A rajzok a falon", en: "Drawings on the walls" },
  factWallLine: {
    ro: "În cafenele, până pe 23.12.2026.",
    hu: "A kávézókban 2026. december 23-ig.",
    en: "In the cafés until 23 December 2026.",
  },

  /* How to join */
  h2JoinA: { ro: "Cum", hu: "Így", en: "How" },
  h2JoinB: { ro: "participi", hu: "vehettek részt", en: "to take part" },
  siteStep1Title: {
    ro: "Ia foaia de desen din cafenea.",
    hu: "Kérj rajzlapot a kávézóban.",
    en: "Get the drawing sheet at a café.",
  },
  siteStep1: {
    ro: "O primești la orice cumpărătură, în oricare dintre cele trei cafenele. Nu se descarcă de pe site.",
    hu: "Bármilyen vásárláskor megkapod, mindhárom kávézónkban. Az oldalról nem tölthető le.",
    en: "It comes with any purchase at any of the three cafés. It cannot be downloaded.",
  },
  siteStep2Title: {
    ro: "Copilul desenează Crăciunul cum îl vede el.",
    hu: "A gyerek lerajzolja, milyen neki a karácsony.",
    en: "Your child draws Christmas the way they see it.",
  },
  siteStep2: {
    ro: "Acasă sau în cafenea.",
    hu: "Otthon vagy a kávézóban.",
    en: "At home or at the café.",
  },
  siteStep3Title: {
    ro: "Semnezi formularul de pe spatele foii.",
    hu: "Aláírod a lap hátoldalán lévő jelentkezési lapot.",
    en: "Sign the form on the back of the sheet.",
  },
  siteStep3: {
    ro: "Îl completează părintele sau tutorele.",
    hu: "A szülő vagy a gondviselő tölti ki.",
    en: "A parent or guardian fills it in.",
  },
  siteStep4Title: {
    ro: "Aduci desenul la cafenea până pe 01.12.2026.",
    hu: "2026. december 1-ig behozod a rajzot a kávézóba.",
    en: "Bring the drawing to a café by 1 December 2026.",
  },
  siteStep4: {
    ro: "Codul desenului se scrie în cele două casete de pe foaie. Dacă te-ai preînregistrat, îl scrii tu; dacă nu, îl scriu colegii noștri.",
    hu: "A rajz kódja a lap két kódmezőjébe kerül. Ha előregisztráltál, te írod be; ha nem, a kollégáink.",
    en: "The drawing's code goes in the two boxes on the sheet. If you preregistered, you write it; if not, our staff do.",
  },
  siteStep5Title: {
    ro: "Desenul apare în galerie.",
    hu: "A rajz megjelenik a galériában.",
    en: "The drawing appears in the gallery.",
  },
  siteStep5: {
    ro: "De regulă în aproximativ 24 de ore, dacă ai bifat acordul pentru galeria online.",
    hu: "Általában körülbelül 24 órán belül, ha hozzájárultál az online galériához.",
    en: "Usually within about 24 hours, if you ticked the online gallery consent.",
  },
  preregTitle: {
    ro: "Preînregistrarea online e opțională.",
    hu: "Az online előregisztráció nem kötelező.",
    en: "Online preregistration is optional.",
  },
  preregBody: {
    ro: "Primești codul dinainte, predarea în cafenea merge mai repede și ai linkul la care va apărea desenul. Participarea se confirmă abia când desenul și formularul semnat ajung la cafenea.",
    hu: "Előre megkapod a kódot, gyorsabb a leadás a kávézóban, és megvan a link, ahol a rajz megjelenik. A részvétel csak akkor érvényes, amikor a rajz és az aláírt lap megérkezik a kávézóba.",
    en: "You get the code in advance, handing in is quicker and you have the link where the drawing will appear. The entry only counts once the drawing and the signed form reach the café.",
  },
  preregSoon: {
    ro: "Preînregistrarea online se deschide pe 16.11.2026.",
    hu: "Az online előregisztráció 2026. november 16-án nyílik.",
    en: "Online preregistration opens on 16 November 2026.",
  },
  siteLocationsTitle: { ro: "Unde aduci desenul", hu: "Hová hozd a rajzot", en: "Where to bring the drawing" },

  /* What's next (after entries close) */
  h2NextA: { ro: "Ce", hu: "Mi", en: "What" },
  h2NextB: { ro: "urmează", hu: "következik", en: "comes next" },
  nextVoting: {
    ro: "Înscrierile s-au încheiat pe 01.12.2026. Ultimele desene aduse apar în galerie în aceste zile, iar votul rămâne deschis până pe 03.12.2026, la 23:59.",
    hu: "A jelentkezés 2026. december 1-jén lezárult. Az utolsóként behozott rajzok ezekben a napokban kerülnek fel a galériába, a szavazás 2026. december 3-án 23:59-ig tart.",
    en: "Entries closed on 1 December 2026. The last drawings handed in go online over these days, and voting stays open until 3 December 2026, 23:59.",
  },
  nextSelection: {
    ro: "Votul s-a încheiat. Întâi se stabilesc cele trei desene alese prin vot, apoi juriul alege celelalte șapte. Sunăm familiile desenelor alese, iar rezultatele apar aici din 06.12.2026.",
    hu: "A szavazás lezárult. Először a szavazással kiválasztott három rajz dől el, utána a zsűri választja ki a további hetet. Felhívjuk a kiválasztott rajzok családjait, az eredmények 2026. december 6-tól jelennek meg itt.",
    en: "Voting has closed. First the three drawings chosen by vote are settled, then the jury picks the other seven. We call the families of the chosen drawings, and the results appear here from 6 December 2026.",
  },

  /* Results and collection */
  h2ResultsA: { ro: "Cele zece", hu: "A tíz", en: "The ten" },
  h2ResultsB: { ro: "desene alese", hu: "kiválasztott rajz", en: "chosen drawings" },
  resultsLead: {
    ro: "Aici apar desenele ale căror familii au acceptat premiul. Toate celelalte desene rămân în galerie.",
    hu: "Itt azok a rajzok jelennek meg, amelyek családja elfogadta a díjat. Minden más rajz a galériában marad.",
    en: "These are the drawings whose families accepted the prize. Every other drawing stays in the gallery.",
  },
  resultsVote: { ro: "Ales prin vot", hu: "A közönség választotta", en: "Chosen by the public vote" },
  resultsJury: { ro: "Ales de juriu", hu: "A zsűri választotta", en: "Chosen by the jury" },
  resultsPending: {
    ro: "Desenele din această grupă le anunțăm după confirmarea familiilor.",
    hu: "Ennek a korcsoportnak a rajzait a családok visszaigazolása után hirdetjük ki.",
    en: "This group's drawings are announced once the families confirm.",
  },
  resultsCupsSoon: {
    ro: "Paharele le estimăm în cafenele din 18.12.2026. Ziua exactă o anunțăm după confirmarea furnizorului.",
    hu: "A poharakat 2026. december 18-tól várjuk a kávézókba. A pontos napot a beszállító visszaigazolása után közöljük.",
    en: "We expect the cups in the cafés from 18 December 2026. We announce the exact day once the supplier confirms.",
  },
  collectionCups: {
    ro: "Paharele cu cele zece desene sunt acum în cafenelele Origins.",
    hu: "A tíz rajzzal készült poharak most az Origins kávézókban vannak.",
    en: "The cups with the ten drawings are now in the Origins cafés.",
  },
  collectionPrizes: {
    ro: "Familiile desenelor alese ridică premiile de la cafeneaua unde au adus desenul, cu codul desenului.",
    hu: "A kiválasztott rajzok családjai a rajz kódjával vehetik át a díjat abban a kávézóban, ahová a rajzot hozták.",
    en: "Families of the chosen drawings collect their prizes at the café where they brought the drawing, with the drawing's code.",
  },
  collectionOriginals: {
    ro: "Toate desenele originale se pot ridica între 27.12.2026 și 31.01.2027, de la cafeneaua unde au fost aduse, cu codul desenului.",
    hu: "Minden eredeti rajz 2026. december 27. és 2027. január 31. között vehető át abban a kávézóban, ahová hozták, a rajz kódjával.",
    en: "All original drawings can be collected between 27 December 2026 and 31 January 2027 at the café where they were handed in, with the drawing's code.",
  },

  /* Gallery */
  h2AllA: { ro: "Toate", hu: "Az összes", en: "All" },
  h2AllB: { ro: "desenele", hu: "rajz", en: "the drawings" },
  galVoteHow: {
    ro: "Votul e gratuit. Deschizi desenul, scrii adresa de e-mail și confirmi cu codul din 6 cifre primit pe e-mail. Poți vota oricâte desene, fiecare o singură dată, până pe 03.12.2026, la 23:59.",
    hu: "A szavazás ingyenes. Megnyitod a rajzot, beírod az e-mail-címed, és a kapott 6 számjegyű kóddal megerősíted. Bármennyi rajzra szavazhatsz, mindegyikre egyszer, 2026. december 3-án 23:59-ig.",
    en: "Voting is free. Open the drawing, enter your e-mail and confirm with the 6-digit code we send you. You can vote for as many drawings as you like, once each, until 3 December 2026, 23:59.",
  },
  galBeforeOpen: {
    ro: "Primele desene apar aici după 16.11.2026, de regulă în aproximativ 24 de ore după ce sunt aduse la cafenea.",
    hu: "Az első rajzok 2026. november 16. után jelennek meg itt, általában körülbelül 24 órával a leadás után.",
    en: "The first drawings appear here after 16 November 2026, usually within about 24 hours of being handed in.",
  },
  galVoteBanner: {
    ro: "Votul se închide pe 03.12.2026, la 23:59.",
    hu: "A szavazás 2026. december 3-án 23:59-kor zárul.",
    en: "Voting closes on 3 December 2026 at 23:59.",
  },
  galClosedBanner: {
    ro: "Votul s-a încheiat pe 03.12.2026. Desenele rămân în galerie.",
    hu: "A szavazás 2026. december 3-án lezárult. A rajzok a galériában maradnak.",
    en: "Voting closed on 3 December 2026. The drawings stay in the gallery.",
  },
  galAll: { ro: "Toate", hu: "Mind", en: "All" },
  galYears: { ro: "ani", hu: "év", en: "years" },
  galYearsOld: { ro: "ani", hu: "éves", en: "years old" },
  galDrawing: { ro: "Desenul", hu: "Rajz", en: "Drawing" },
  galGroups: { ro: "Grupa de vârstă", hu: "Korcsoport", en: "Age group" },
  galEmpty: {
    ro: "Primele desene apar aici după 16.11.2026.",
    hu: "Még nincs itt rajz. Az elsők 2026. november 16. után jelennek meg.",
    en: "No drawings here yet. The first ones appear after 16 November 2026.",
  },
  galEmptyCategory: {
    ro: "La grupa asta nu avem încă desene. Un desen apare aici de regulă în aproximativ 24 de ore după ce e adus.",
    hu: "Ebben a korcsoportban még nincs rajz. Egy rajz általában körülbelül 24 órával a leadás után jelenik meg.",
    en: "No drawings in this age group yet. A drawing usually appears here within about 24 hours of being handed in.",
  },
  galSearchLabel: { ro: "Caută după codul desenului", hu: "Keresés a rajz kódja alapján", en: "Search by drawing code" },
  galSearchPlaceholder: { ro: "de exemplu R-012", hu: "például R-012", en: "for example R-012" },
  galSearchClear: { ro: "Șterge căutarea", hu: "Keresés törlése", en: "Clear search" },
  galSearchNone: {
    ro: "Nu găsim niciun desen cu codul {code}. Un desen apare aici de regulă în aproximativ 24 de ore după ce e adus la cafenea, și doar cu acordul pentru galerie.",
    hu: "Nincs {code} kódú rajz. Egy rajz általában körülbelül 24 órával a leadás után jelenik meg itt, és csak a galériához való hozzájárulással.",
    en: "No drawing with the code {code}. A drawing usually appears here about 24 hours after it is handed in, and only with the gallery consent.",
  },
  galSearchFound: { ro: "Rezultate pentru {code}", hu: "Találatok: {code}", en: "Results for {code}" },
  galShowMore: { ro: "Arată mai multe", hu: "Továbbiak", en: "Show more" },
  galShown: { ro: "{shown} din {total}", hu: "{shown} / {total}", en: "{shown} of {total}" },
  galBack: { ro: "Înapoi la galerie", hu: "Vissza a galériához", en: "Back to the gallery" },
  galViewCup: { ro: "Pe pahar", hu: "A poháron", en: "On the cup" },
  galViewDrawing: { ro: "Desenul", hu: "A rajz", en: "The drawing" },
  galCupHint: {
    ro: "Așa ar arăta desenul pe paharul Origins. Trage spre stânga sau spre dreapta ca să întorci paharul.",
    hu: "Így nézne ki a rajz az Origins poháron. Húzd jobbra vagy balra, hogy elforgasd a poharat.",
    en: "This is how the drawing would look on the Origins cup. Drag left or right to turn it.",
  },
  galCupStatic: {
    ro: "Așa ar arăta desenul pe paharul Origins.",
    hu: "Így nézne ki a rajz az Origins poháron.",
    en: "This is how the drawing would look on the Origins cup.",
  },
  galCupAlt: {
    ro: "Desenul, pe paharul Origins de Crăciun",
    hu: "A rajz az Origins karácsonyi poharán",
    en: "The drawing on the Origins Christmas cup",
  },
  galDrawnBy: { ro: "Desenat de", hu: "Rajzolta:", en: "Drawn by" },
  siteWholeDrawing: { ro: "Desenul întreg", hu: "A teljes rajz", en: "The whole drawing" },
  cupTurn: { ro: "Întoarce paharul", hu: "Forgasd el a poharat", en: "Turn the cup" },
  h2Vote: { ro: "Votează", hu: "Szavazok", en: "Vote" },
  h2View: { ro: "Vezi desenul", hu: "Megnézem", en: "View" },
  h2OthersA: { ro: "Alte desene", hu: "További rajzok", en: "More drawings" },
  h2OthersB: { ro: "din grupa", hu: "korcsoport:", en: "aged" },
  h2SeeAll: { ro: "Vezi toate desenele", hu: "Az összes rajz", en: "See all drawings" },
  galOnlyGallery: {
    ro: "Acest desen e doar în galerie: nu poate ajunge pe pahar, așa că nu intră la vot.",
    hu: "Ez a rajz csak a galériában szerepel: nem kerülhet pohárra, ezért nem lehet rá szavazni.",
    en: "This drawing is in the gallery only: it cannot go on a cup, so it is not part of the vote.",
  },

  /* How the ten are chosen + calendar */
  h2ChooseA: { ro: "Cum se aleg", hu: "Hogyan választjuk ki", en: "How the ten" },
  h2ChooseB: { ro: "cele 10 desene", hu: "a 10 rajzot", en: "drawings are chosen" },
  siteChooseLead: {
    ro: "Pe pahare ajung zece desene. Șapte le alege juriul, trei le alegeți voi, prin vot.",
    hu: "Tíz rajz kerül a poharakra. Hetet a zsűri választ, hármat ti, szavazással.",
    en: "Ten drawings go on the cups. The jury picks seven, you pick three by voting.",
  },
  siteJuryLabel: { ro: "Juriul", hu: "A zsűri", en: "The jury" },
  siteJury: {
    ro: "alege două desene la 3–5 ani, trei la 6–9 ani și două la 10–14 ani. Vede doar codurile, nu și numele copiilor, și judecă după criteriile din regulament.",
    hu: "két rajzot választ a 3–5, hármat a 6–9 és kettőt a 10–14 évesek közül. Csak a kódokat látja, a gyerekek nevét nem, és a szabályzat szempontjai szerint dönt.",
    en: "picks two drawings aged 3–5, three aged 6–9 and two aged 10–14. It sees only the codes, never the children's names, and judges by the criteria in the rules.",
  },
  siteVoteLabel: { ro: "Votul public", hu: "A közönségszavazás", en: "The public vote" },
  siteVote: {
    ro: "alege câte un desen din fiecare grupă: pe cel cu cele mai multe voturi pe zi petrecută în galerie, de la publicare până la închiderea votului. Orice desen are cel puțin o zi.",
    hu: "korcsoportonként egy rajzot választ: azt, amelyik a legtöbb szavazatot kapta naponta, a megjelenéstől a szavazás zárásáig. Minden rajz legalább egy napot kap.",
    en: "picks one drawing per age group: the one with the most votes per day online, from publication until voting closes. Every drawing counts at least one day.",
  },
  siteVoteExample: {
    ro: "Exemplu: 40 de voturi în 10 zile înseamnă 4 voturi pe zi. 30 de voturi în 5 zile înseamnă 6 pe zi, deci al doilea desen e înaintea primului.",
    hu: "Példa: 40 szavazat 10 nap alatt napi 4 szavazat. 30 szavazat 5 nap alatt napi 6, így a második rajz megelőzi az elsőt.",
    en: "Example: 40 votes in 10 days is 4 votes a day. 30 votes in 5 days is 6 a day, so the second drawing ranks above the first.",
  },
  siteHiddenLabel: { ro: "Nu afișăm voturile.", hu: "A szavazatokat nem mutatjuk.", en: "Votes are never shown." },
  siteHidden: {
    ro: "Nu există clasament public și nu arătăm nicăieri câte voturi are un desen. Votul e doar pentru desenele care pot ajunge pe pahar.",
    hu: "Nincs nyilvános rangsor, és sehol nem mutatjuk, hány szavazatot kapott egy rajz. Csak olyan rajzra lehet szavazni, amely pohárra kerülhet.",
    en: "There is no public ranking and we never show how many votes a drawing has. Only drawings that can go on a cup are part of the vote.",
  },
  siteCup: {
    ro: "Cele zece desene se tipăresc pe paharele la pachet Origins. Previzualizarea de pe site arată cum ar putea arăta desenul pe pahar; forma finală o stabilim după proba de tipar a furnizorului. Paharele le estimăm în cafenele din 18.12.2026; ziua exactă o anunțăm după confirmarea furnizorului.",
    hu: "A tíz rajz az Origins elviteles poharaira kerül. Az oldalon látható előnézet azt mutatja, hogyan nézhet ki a rajz a poháron; a végleges formát a beszállító próbanyomata után döntjük el. A poharakat 2026. december 18-tól várjuk a kávézókba; a pontos napot a beszállító visszaigazolása után közöljük.",
    en: "The ten drawings are printed on the Origins takeaway cups. The preview on the site shows how a drawing could look on the cup; the final layout is set after the supplier's print proof. We expect the cups in the cafés from 18 December 2026 and announce the exact day once the supplier confirms.",
  },
  h2CalA: { ro: "Calendarul", hu: "A pályázat", en: "The contest" },
  h2CalB: { ro: "concursului", hu: "naptára", en: "calendar" },
  calDate1: { ro: "16.11", hu: "11.16.", en: "16 Nov" },
  calDate2: { ro: "01.12", hu: "12.01.", en: "1 Dec" },
  calDate3: { ro: "03.12, 23:59", hu: "12.03., 23:59", en: "3 Dec, 23:59" },
  calDate4: { ro: "06.12", hu: "12.06.", en: "6 Dec" },
  calDate5: { ro: "din 18.12", hu: "12.18-tól", en: "from 18 Dec" },
  calDate6: { ro: "23.12", hu: "12.23.", en: "23 Dec" },
  calDate7: { ro: "27.12–31.01", hu: "12.27.–01.31.", en: "27 Dec–31 Jan" },
  siteCal1: { ro: "Începem să primim desene", hu: "Elkezdjük fogadni a rajzokat", en: "We start taking drawings" },
  siteCal2: { ro: "Ultima zi în care aduci desenul", hu: "Az utolsó nap, amikor behozhatod a rajzot", en: "Last day to bring the drawing" },
  siteCal3: { ro: "Se închide votul", hu: "Lezárul a szavazás", en: "Voting closes" },
  siteCal4: { ro: "Anunțăm cele zece desene, de Moș Nicolae", hu: "Mikuláskor kihirdetjük a tíz rajzot", en: "We announce the ten drawings, on St Nicholas' Day" },
  siteCal5: {
    ro: "Paharele în cafenele, estimativ din 18.12, după confirmarea furnizorului",
    hu: "A poharak a kávézókban, várhatóan, a beszállító visszaigazolása után",
    en: "Cups in the cafés, estimated, once the supplier confirms",
  },
  siteCal6: { ro: "Ultima zi cu desenele pe pereții cafenelelor", hu: "Az utolsó nap, amikor a rajzok a kávézók falán vannak", en: "Last day the drawings hang in the cafés" },
  siteCal7: { ro: "Ridici desenul original, cu codul lui", hu: "Az eredeti rajz átvétele, a kódjával", en: "Collect the original drawing with its code" },

  /* FAQ */
  h2FaqA: { ro: "Întrebări", hu: "Kérdések", en: "Questions" },
  h2FaqB: { ro: "și răspunsuri", hu: "és válaszok", en: "and answers" },
  siteFaq1Q: { ro: "Trebuie să cumpăr ceva?", hu: "Kell vásárolnom valamit?", en: "Do I have to buy something?" },
  siteFaq1A: {
    ro: "Da. Foaia de desen o primești în cafenea, la orice cumpărătură, de orice valoare. Votul online e gratuit.",
    hu: "Igen. A rajzlapot a kávézóban kapod, bármilyen vásárláskor, összegtől függetlenül. Az online szavazás ingyenes.",
    en: "Yes. You get the drawing sheet at the café with any purchase, of any value. Online voting is free.",
  },
  siteFaq2Q: { ro: "Ce vârstă trebuie să aibă copilul?", hu: "Hány évesnek kell lennie a gyereknek?", en: "How old does my child need to be?" },
  siteFaq2A: {
    ro: "Între 3 și 14 ani împliniți la data la care aduci desenul.",
    hu: "3 és 14 év között, a leadás napján betöltött életkor számít.",
    en: "Between 3 and 14 on the day you bring the drawing.",
  },
  siteFaq9Q: { ro: "Trebuie să mă înscriu online?", hu: "Kötelező online jelentkezni?", en: "Do I have to sign up online?" },
  siteFaq9A: {
    ro: "Nu. Preînregistrarea online e opțională: primești codul dinainte și câștigi timp în cafenea. Fără ea, codul îl scriu colegii noștri când aduci desenul.",
    hu: "Nem. Az online előregisztráció nem kötelező: előre megkapod a kódot, és időt nyersz a kávézóban. Nélküle a kódot a kollégáink írják fel a leadáskor.",
    en: "No. Online preregistration is optional: you get the code in advance and save time at the café. Without it, our staff write the code when you bring the drawing.",
  },
  siteFaq3Q: {
    ro: "Pot trimite o poză cu desenul, în loc să îl aduc?",
    hu: "Küldhetek fotót a rajzról ahelyett, hogy behoznám?",
    en: "Can I send a photo of the drawing instead of bringing it?",
  },
  siteFaq3A: {
    ro: "Nu. Avem nevoie de desenul original, pe foaia concursului. Îl punem pe peretele cafenelei, iar dacă e ales, îl scanăm ca să poată fi tipărit.",
    hu: "Nem. Az eredeti rajzra van szükségünk, a pályázat rajzlapján. Kitesszük a kávézó falára, és ha kiválasztják, beszkenneljük a nyomtatáshoz.",
    en: "No. We need the original drawing, on the contest sheet. It goes on the café wall, and if chosen, we scan it for printing.",
  },
  siteFaq4Q: { ro: "Am adus desenul, dar nu îl văd în galerie.", hu: "Behoztam a rajzot, de nem látom a galériában.", en: "I brought the drawing but can't see it in the gallery." },
  siteFaq4A: {
    ro: "Desenele apar de regulă în aproximativ 24 de ore și doar dacă ai bifat acordul pentru galeria online. Caută-l după cod în galerie. Dacă vrei să dai, să schimbi sau să retragi un acord, ne anunți în scris: pe un formular în cafenea sau pe e-mail, la contact@originscafe.ro.",
    hu: "A rajzok általában körülbelül 24 órán belül jelennek meg, és csak akkor, ha hozzájárultál az online galériához. Keresd a kódja alapján a galériában. Ha egy hozzájárulást megadnál, módosítanál vagy visszavonnál, jelezd írásban: a kávézóban egy űrlapon vagy e-mailben, a contact@originscafe.ro címen.",
    en: "Drawings usually appear within about 24 hours, and only with the online gallery consent. Search for it by code in the gallery. To give, change or withdraw a consent, tell us in writing: on a form at the café or by e-mail to contact@originscafe.ro.",
  },
  siteFaq5Q: {
    ro: "Copilul a desenat un personaj din desene animate. Se poate?",
    hu: "A gyerek rajzfilmfigurát rajzolt. Ez rendben van?",
    en: "My child drew a cartoon character. Is that allowed?",
  },
  siteFaq5A: {
    ro: "Desenul rămâne pe perete, dar nu poate ajunge pe pahar, pentru că personajul nu ne aparține. Dacă vrea să mai încerce, copilul primește gratuit o foaie nouă în cafenea.",
    hu: "A rajz kikerül a falra, de pohárra nem kerülhet, mert a figura nem a miénk. Ha újra próbálkozna, a gyerek ingyen kap új lapot a kávézóban.",
    en: "The drawing stays on the wall but cannot go on a cup, because the character isn't ours. If your child wants another go, they get a new sheet free at the café.",
  },
  siteFaq6Q: { ro: "Se vede numele copilului?", hu: "Látszik a gyerek neve?", en: "Is my child's name shown?" },
  siteFaq6A: {
    ro: "Doar prenumele și vârsta, și numai dacă ai bifat acordul pentru nume. Altfel apar doar codul desenului și grupa de vârstă.",
    hu: "Csak a keresztnév és az életkor, és csak ha a névre vonatkozó hozzájárulást bejelölted. Különben csak a rajz kódja és a korcsoport látszik.",
    en: "Only the first name and age, and only if you ticked the name consent. Otherwise only the drawing's code and age group are shown.",
  },
  siteFaq7Q: { ro: "De ce nu văd câte voturi are un desen?", hu: "Miért nem látom, hány szavazata van egy rajznak?", en: "Why can't I see how many votes a drawing has?" },
  siteFaq7A: {
    ro: "Ca un concurs pentru copii să nu devină un clasament. Voturile le vedem doar noi, iar rezultatele le anunțăm din 06.12.2026.",
    hu: "Hogy a gyerekek pályázatából ne legyen rangsor. A szavazatokat csak mi látjuk, az eredményeket 2026. december 6-tól hirdetjük ki.",
    en: "So the children's contest doesn't turn into a ranking. Only we see the votes, and we announce the results from 6 December 2026.",
  },
  siteFaq8Q: { ro: "Ce se întâmplă cu desenul original?", hu: "Mi lesz az eredeti rajzzal?", en: "What happens to the original drawing?" },
  siteFaq8A: {
    ro: "Stă pe peretele cafenelei până pe 23.12.2026. Îl poți ridica de acolo între 27.12.2026 și 31.01.2027, cu codul desenului.",
    hu: "2026. december 23-ig a kávézó falán marad. 2026. december 27. és 2027. január 31. között veheted át ott, a rajz kódjával.",
    en: "It hangs on the café wall until 23 December 2026. You can collect it there between 27 December 2026 and 31 January 2027, with the drawing's code.",
  },

  /* Vote panel (/desene/[code]) */
  voteButton: { ro: "Votează desenul", hu: "Szavazok a rajzra", en: "Vote for this drawing" },
  voteEmailLabel: { ro: "Adresa ta de e-mail", hu: "Az e-mail-címed", en: "Your e-mail address" },
  voteEmailHint: {
    ro: "Îți trimitem un cod din 6 cifre. Nu păstrăm adresa în clar și nu îți scriem altceva.",
    hu: "Küldünk egy 6 számjegyű kódot. A címet nem tároljuk olvasható formában, és mást nem küldünk rá.",
    en: "We send you a 6-digit code. We do not keep the address in plain text and we send nothing else.",
  },
  voteRule: {
    ro: "Votul e gratuit. Poți vota oricâte desene, fiecare o singură dată.",
    hu: "A szavazás ingyenes. Bármennyi rajzra szavazhatsz, mindegyikre egyszer.",
    en: "Voting is free. You can vote for as many drawings as you like, once each.",
  },
  voteSend: { ro: "Trimite codul", hu: "Kód küldése", en: "Send the code" },
  voteSending: { ro: "Se trimite...", hu: "Küldés...", en: "Sending..." },
  voteCodeLabel: { ro: "Codul din e-mail", hu: "Az e-mailben kapott kód", en: "Code from the e-mail" },
  voteCodeSentTo: { ro: "Am trimis codul la", hu: "A kódot ide küldtük:", en: "We sent the code to" },
  voteCodeHint: {
    ro: "E valabil 15 minute. Dacă nu îl vezi, uită-te și în Spam.",
    hu: "15 percig érvényes. Ha nem látod, nézd meg a Spam mappát is.",
    en: "It is valid for 15 minutes. If you cannot see it, check Spam too.",
  },
  voteConfirm: { ro: "Confirmă votul", hu: "Szavazat megerősítése", en: "Confirm the vote" },
  voteConfirming: { ro: "Se înregistrează...", hu: "Rögzítés...", en: "Saving..." },
  voteOtherEmail: { ro: "Altă adresă", hu: "Másik cím", en: "Another address" },
  voteResend: { ro: "Trimite din nou codul", hu: "Új kód küldése", en: "Send the code again" },
  voteResendIn: { ro: "Poți cere alt cod în {s} s", hu: "Új kódot {s} mp múlva kérhetsz", en: "You can ask for a new code in {s} s" },
  voteResent: { ro: "Am trimis un cod nou.", hu: "Új kódot küldtünk.", en: "We sent a new code." },
  voteStepEmail: {
    ro: "Scrie adresa de e-mail ca să primești codul.",
    hu: "Írd be az e-mail-címed, hogy megkapd a kódot.",
    en: "Enter your e-mail address to get the code.",
  },
  voteKnown: {
    ro: "Votezi cu adresa confirmată deja pe acest dispozitiv.",
    hu: "Az ezen az eszközön már megerősített címmel szavazol.",
    en: "You vote with the address already confirmed on this device.",
  },
  voteThanks: {
    ro: "Mulțumim! Votul tău a fost înregistrat.",
    hu: "Köszönjük! A szavazatodat rögzítettük.",
    en: "Thank you! Your vote has been recorded.",
  },
  voteAlready: {
    ro: "Ai votat deja acest desen.",
    hu: "Erre a rajzra már szavaztál.",
    en: "You have already voted for this drawing.",
  },
  voteMore: { ro: "Vezi și celelalte desene", hu: "Nézd meg a többi rajzot is", en: "See the other drawings" },
  voteErrEmail: {
    ro: "Adresa de e-mail nu pare corectă.",
    hu: "Az e-mail-cím nem tűnik helyesnek.",
    en: "That e-mail address does not look right.",
  },
  voteErrDisposable: {
    ro: "Folosește adresa ta obișnuită de e-mail. Adresele temporare nu sunt acceptate.",
    hu: "Használd a szokásos e-mail-címed. Ideiglenes címet nem fogadunk el.",
    en: "Use your usual e-mail address. Temporary addresses are not accepted.",
  },
  voteErrRate: {
    ro: "Prea multe încercări. Mai încearcă peste o oră.",
    hu: "Túl sok próbálkozás. Próbáld újra egy óra múlva.",
    en: "Too many attempts. Try again in an hour.",
  },
  voteErrMail: {
    ro: "Nu am putut trimite codul. Mai încearcă peste câteva minute.",
    hu: "Nem sikerült elküldeni a kódot. Próbáld újra néhány perc múlva.",
    en: "We could not send the code. Try again in a few minutes.",
  },
  voteErrCodeShape: { ro: "Codul are 6 cifre.", hu: "A kód 6 számjegyű.", en: "The code has 6 digits." },
  voteErrWrong: {
    ro: "Codul nu e corect. Încercări rămase:",
    hu: "A kód nem helyes. Hátralévő próbálkozások:",
    en: "That code is not correct. Attempts left:",
  },
  voteErrExpired: {
    ro: "Codul a expirat. Cere un cod nou, adresa a rămas completată.",
    hu: "A kód lejárt. Kérj újat, a cím ki van töltve.",
    en: "The code has expired. Ask for a new one, your address is still filled in.",
  },
  voteErrTooMany: {
    ro: "Prea multe coduri greșite. Cere un cod nou, adresa a rămas completată.",
    hu: "Túl sok hibás kód. Kérj újat, a cím ki van töltve.",
    en: "Too many wrong codes. Ask for a new one, your address is still filled in.",
  },
  voteErrClosed: {
    ro: "Votul s-a încheiat pe 03.12.2026, la 23:59.",
    hu: "A szavazás 2026. december 3-án 23:59-kor lezárult.",
    en: "Voting closed on 3 December 2026 at 23:59.",
  },
  voteErrGone: {
    ro: "Desenul nu mai e în galerie.",
    hu: "A rajz már nincs a galériában.",
    en: "The drawing is no longer in the gallery.",
  },
  voteErrNotVotable: {
    ro: "Acest desen e doar în galerie și nu intră la vot.",
    hu: "Ez a rajz csak a galériában szerepel, nem lehet rá szavazni.",
    en: "This drawing is in the gallery only and is not part of the vote.",
  },
  siteVoteClosedLong: {
    ro: "Votul s-a încheiat. Pe 06.12.2026 anunțăm cele zece desene care ajung pe pahare.",
    hu: "A szavazás lezárult. 2026. december 6-tól kiderül, melyik tíz rajz kerül a poharakra.",
    en: "Voting has closed. From 6 December 2026 we know the ten drawings going on the cups.",
  },

  /* Sharing */
  shareTitle: { ro: "Trimite desenul mai departe", hu: "Küldd tovább a rajzot", en: "Share the drawing" },
  siteShareSub: {
    ro: "Oricine primește linkul îl poate vota.",
    hu: "Bárki szavazhat rá, aki megkapja a linket.",
    en: "Anyone with the link can vote for it.",
  },
  shareText: {
    ro: "Copilul meu a desenat Crăciunul pentru paharul Origins. Îl poți vota aici:",
    hu: "A gyerekem lerajzolta a karácsonyt az Origins poharára. Itt szavazhatsz rá:",
    en: "My child drew Christmas for the Origins cup. You can vote for it here:",
  },
  shareTextClosed: {
    ro: "Un desen de Crăciun pentru paharul Origins:",
    hu: "Egy karácsonyi rajz az Origins poharára:",
    en: "A Christmas drawing for the Origins cup:",
  },
  shareCopy: { ro: "Copiază linkul", hu: "Link másolása", en: "Copy link" },
  shareCopied: { ro: "Link copiat", hu: "Link kimásolva", en: "Link copied" },
  shareManual: {
    ro: "Nu am putut copia automat. Linkul e selectat mai jos, copiază-l de aici:",
    hu: "Nem sikerült automatikusan másolni. A link alább ki van jelölve, innen másold ki:",
    en: "We couldn't copy it automatically. The link is selected below, copy it from here:",
  },
  shareLinkLabel: { ro: "Linkul desenului", hu: "A rajz linkje", en: "The drawing's link" },
  posterDownload: { ro: "Descarcă imaginea", hu: "Kép letöltése", en: "Download the image" },
  posterShare: { ro: "Distribuie imaginea", hu: "Kép megosztása", en: "Share the image" },
  posterPreparing: { ro: "Se pregătește imaginea...", hu: "Készül a kép...", en: "Preparing the image..." },
  posterIntro: {
    ro: "O imagine pentru story sau pentru o postare, cu desenul și linkul de vot.",
    hu: "Kép sztoriba vagy bejegyzésbe, a rajzzal és a szavazás linkjével.",
    en: "An image for a story or a post, with the drawing and the voting link.",
  },
  posterStory: { ro: "Story", hu: "Sztori", en: "Story" },
  posterPost: { ro: "Postare", hu: "Bejegyzés", en: "Post" },
  posterStoryTip: {
    ro: "Pe Instagram, pune stickerul „Link” cu adresa desenului peste chenarul punctat.",
    hu: "Instagramon tedd a „Link” matricát a rajz címével a szaggatott keretbe.",
    en: "On Instagram, add the “Link” sticker with the drawing's address over the dashed frame.",
  },
  posterFailed: {
    ro: "Nu am putut pregăti imaginea. Reîncarcă pagina și mai încearcă o dată.",
    hu: "Nem sikerült elkészíteni a képet. Töltsd újra az oldalt, és próbáld meg még egyszer.",
    en: "We could not prepare the image. Reload the page and try again.",
  },
  posterAlt: {
    ro: "Imaginea de distribuit, cu desenul și linkul de vot",
    hu: "A megosztható kép a rajzzal és a szavazás linkjével",
    en: "The image to share, with the drawing and the voting link",
  },
  posterHeadline1: { ro: "Votează desenul", hu: "Szavazz a gyerekem", en: "Vote for my" },
  posterHeadline2: { ro: "copilului meu", hu: "rajzára", en: "child's drawing" },
  posterLinkHint: { ro: "Pune aici linkul", hu: "Ide tedd a linket", en: "Put the link here" },
} satisfies Record<string, I18nText>;
