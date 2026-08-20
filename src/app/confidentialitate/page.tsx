import type { Metadata } from "next";
import LegalPage, { type LegalSection } from "@/components/LegalPage";

/**
 * Privacy policy for the Origins Circle program. Content follows
 * CLIENTI/OriginsCafe/PLATFORMA/SPEC_GDPR_INSCRIERE.md; operator data
 * verified 26.07.2026 (originscafe.ro footer + Registrul Comerțului).
 * Before launch: lawyer validates the under-16 wording, client confirms the
 * 24-month retention and the GDPR contact address.
 */

export const metadata: Metadata = {
  title: "Politica de confidențialitate · Origins Circle",
  description:
    "Ce date colectează programul Origins Circle, de ce, cât timp și care sunt drepturile tale.",
};

const sections: LegalSection[] = [
  {
    heading: { ro: "Operatorul de date", hu: "Az adatkezelő", en: "Data controller" },
    body: [
      {
        ro: "Datele tale sunt prelucrate de BISTRO ARABICA S.R.L. (Origins Coffee & Drinks), CUI RO36205635, Reg. Com. J2016001204055, Str. Transilvaniei nr. 9, Oradea, jud. Bihor. Contact: contact@originscafe.ro sau 0740 038 569.",
        hu: "Adataidat a BISTRO ARABICA S.R.L. (Origins Coffee & Drinks) kezeli, CUI RO36205635, cégjegyzékszám J2016001204055, Str. Transilvaniei 9., Nagyvárad, Bihar megye. Kapcsolat: contact@originscafe.ro vagy 0740 038 569.",
        en: "Your data is processed by BISTRO ARABICA S.R.L. (Origins Coffee & Drinks), VAT RO36205635, Trade Registry J2016001204055, Str. Transilvaniei 9, Oradea, Bihor county, Romania. Contact: contact@originscafe.ro or 0740 038 569.",
      },
    ],
  },
  {
    heading: { ro: "Ce date colectăm", hu: "Milyen adatokat gyűjtünk", en: "What data we collect" },
    body: [
      {
        ro: "Numele și prenumele: apar pe card și te identifică la casă.",
        hu: "A neved: a kártyán jelenik meg, és a kasszánál azonosít.",
        en: "Your name: it appears on the card and identifies you at the counter.",
      },
      {
        ro: "Numărul de telefon: identificatorul unic al cardului. Un număr, un card.",
        hu: "A telefonszámod: a kártya egyedi azonosítója. Egy szám, egy kártya.",
        en: "Your phone number: the card's unique identifier. One number, one card.",
      },
      {
        ro: "Data nașterii: pentru verificarea vârstei și aplicarea regulilor pentru minori.",
        hu: "A születési dátumod: az életkor ellenőrzéséhez és a kiskorúakra vonatkozó szabályok alkalmazásához.",
        en: "Your birthdate: to verify age and apply the rules for minors.",
      },
      {
        ro: "Limba aleasă: limba în care îți trimitem mesajele.",
        hu: "A választott nyelv: ezen a nyelven kapod az üzeneteket.",
        en: "Your chosen language: the language of the messages we send you.",
      },
      {
        ro: "Opțiunea pentru notificări promoționale: o salvăm doar dacă alegi separat să le primești.",
        hu: "A promóciós értesítések beállítása: csak akkor tároljuk, ha külön kéred ezeket az üzeneteket.",
        en: "Your promotional notification choice: we store it only if you separately opt in to receive them.",
      },
      {
        ro: "Bifa de elev sau student: pentru cardul Student Circle.",
        hu: "A diák jelölés: a Student Circle kártyához.",
        en: "The student tick box: for the Student Circle card.",
      },
      {
        ro: "Seria cardului și ștampilele: fără ele programul nu funcționează.",
        hu: "A kártya sorszáma és a pecsétek: ezek nélkül a program nem működik.",
        en: "The card serial and your stamps: the program cannot run without them.",
      },
      {
        ro: "Atât. Fără email, fără adresă.",
        hu: "Ennyi. Se email, se lakcím.",
        en: "That's all. No email, no address.",
      },
    ],
  },
  {
    heading: { ro: "De ce le folosim", hu: "Miért használjuk", en: "Why we use it" },
    body: [
      {
        ro: "Numele, telefonul și ștampilele sunt necesare ca programul să funcționeze: fără ele cardul nu există (art. 6 alin. 1 lit. b GDPR).",
        hu: "A név, a telefonszám és a pecsétek a program működéséhez kellenek: nélkülük nincs kártya (GDPR 6. cikk (1) b).",
        en: "Your name, phone and stamps are needed for the program to work: without them there is no card (art. 6(1)(b) GDPR).",
      },
      {
        ro: "Data nașterii o folosim pentru verificarea vârstei la înscriere și aplicarea regulilor pentru minori.",
        hu: "A születési dátumodat a regisztrációkori életkor-ellenőrzéshez és a kiskorúakra vonatkozó szabályok alkalmazásához használjuk.",
        en: "We use your birthdate to verify age at signup and apply the rules for minors.",
      },
      {
        ro: "Mesajele promoționale se trimit numai dacă bifezi separat acordul pentru marketing (art. 6 alin. 1 lit. a GDPR). Bifa este opțională și acordul poate fi retras oricând.",
        hu: "Promóciós üzenetet csak akkor küldünk, ha ehhez külön hozzájárulsz (GDPR 6. cikk (1) a). A hozzájárulás nem kötelező, és bármikor visszavonható.",
        en: "We send promotional messages only if you separately opt in to marketing (art. 6(1)(a) GDPR). Consent is optional and can be withdrawn at any time.",
      },
      {
        ro: "Nu vindem datele și nu le dăm mai departe pentru publicitatea altora.",
        hu: "Az adataidat nem adjuk el, és nem adjuk tovább mások hirdetéseihez.",
        en: "We do not sell your data and we do not pass it on for anyone else's advertising.",
      },
    ],
  },
  {
    heading: { ro: "Cât timp le păstrăm", hu: "Meddig tároljuk", en: "How long we keep it" },
    body: [
      {
        ro: "Cât timp ești membru. Dacă trec 24 de luni fără nicio ștampilă, cardul și datele tale se șterg sau se anonimizează automat.",
        hu: "Amíg tag vagy. Ha 24 hónapig egyetlen pecsétet sem gyűjtesz, a kártyád és az adataid automatikusan törlődnek vagy anonimizálódnak.",
        en: "For as long as you are a member. After 24 months without a single stamp, your card and data are automatically deleted or anonymised.",
      },
    ],
  },
  {
    heading: { ro: "Drepturile tale", hu: "A jogaid", en: "Your rights" },
    body: [
      {
        ro: "Poți cere oricând accesul la datele tale, corectarea sau ștergerea lor, ori retragerea consimțământului: la casă sau la contact@originscafe.ro. Răspundem în cel mult 30 de zile.",
        hu: "Bármikor kérheted az adataidhoz való hozzáférést, a javításukat vagy törlésüket, illetve visszavonhatod a hozzájárulásod: a kasszánál vagy a contact@originscafe.ro címen. Legfeljebb 30 napon belül válaszolunk.",
        en: "You can request access to your data, its correction or deletion, or withdraw your consent at any time: at the counter or at contact@originscafe.ro. We reply within 30 days.",
      },
      {
        ro: "Dacă ceri ștergerea, cardul și ștampilele tale se șterg definitiv.",
        hu: "Ha törlést kérsz, a kártyád és a pecséteid véglegesen törlődnek.",
        en: "If you request deletion, your card and stamps are permanently removed.",
      },
      {
        ro: "Ai dreptul să depui o plângere la ANSPDCP (dataprotection.ro).",
        hu: "Panaszt tehetsz a román adatvédelmi hatóságnál, az ANSPDCP-nél (dataprotection.ro).",
        en: "You have the right to lodge a complaint with the Romanian data protection authority, ANSPDCP (dataprotection.ro).",
      },
    ],
  },
  {
    heading: { ro: "Minori", hu: "Kiskorúak", en: "Minors" },
    body: [
      {
        ro: "Vârsta o verificăm după data nașterii. Sub 16 ani, înscrierea se face doar cu acordul unui părinte sau al unui tutore, bifat la înscriere.",
        hu: "Az életkort a születési dátum alapján ellenőrizzük. 16 év alatt csak szülő vagy gondviselő beleegyezésével lehet regisztrálni, amit a regisztrációnál kell megerősíteni.",
        en: "We verify age from the birthdate. Under 16, signup requires the consent of a parent or guardian, confirmed at signup.",
      },
    ],
  },
];

export default function ConfidentialitatePage() {
  return (
    <LegalPage
      eyebrow={{ ro: "Origins Circle" }}
      title={{
        ro: "Politica de confidențialitate",
        hu: "Adatkezelési tájékoztató",
        en: "Privacy policy",
      }}
      sections={sections}
    />
  );
}
