import type { Metadata } from "next";
import LegalPage, { type LegalSection } from "@/components/LegalPage";
import { getDb } from "@/lib/db";
import type { LoyaltyConfig } from "@/lib/program";
import {
  birthdayRule,
  doubleStampRule,
  freeDrinkRule,
  goldCardRule,
  goldKeepRule,
  goldPerksRule,
  goldQualifyRule,
  midRewardRule,
  rewardValueCapRule,
  stampWindowRule,
  toGoDisclaimer,
} from "@/lib/program-copy";

/**
 * Program rules for Origins Circle. Every mechanic stated here is GENERATED
 * from the live program settings (lib/program-copy.ts), so the rules page can
 * never promise a deal the app no longer gives. Final wording passes through
 * the client (and their lawyer, together with /confidentialitate) before
 * launch; see CLIENTI/OriginsCafe/PLATFORMA/SPEC_GDPR_INSCRIERE.md.
 */

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Regulamentul programului Origins Circle",
  description:
    "Cum funcționează cardul de fidelitate Origins Circle: ștampile, recompense, Student Circle.",
};

/** Drops the rules that are turned off, so nothing empty is printed. */
function present<T>(items: (T | null)[]): T[] {
  return items.filter((item): item is T => item !== null);
}

const sections = (config: LoyaltyConfig): LegalSection[] => [
  {
    heading: null,
    body: [
      {
        ro: "Origins Circle este programul de fidelitate al cafenelelor Origins Coffee & Drinks din Oradea, operat de BISTRO ARABICA S.R.L. Cardul e gratuit și stă în telefonul tău: îl primești pe o pagină web, iar în curând și în Apple Wallet sau Google Wallet.",
        hu: "Az Origins Circle a nagyváradi Origins Coffee & Drinks kávézók hűségprogramja, amelyet a BISTRO ARABICA S.R.L. működtet. A kártya ingyenes, és a telefonodban él: egy weboldalon kapod meg, hamarosan pedig Apple Walletben vagy Google Walletben is.",
        en: "Origins Circle is the loyalty program of the Origins Coffee & Drinks coffee shops in Oradea, run by BISTRO ARABICA S.R.L. The card is free and lives in your phone: you get it as a web page, and soon in Apple Wallet or Google Wallet too.",
      },
      toGoDisclaimer(),
    ],
  },
  {
    heading: { ro: "Cum aduni ștampile", hu: "Így gyűjtesz pecsétet", en: "How you collect stamps" },
    body: [
      {
        ro: "La fiecare comandă, arată codul QR de pe card la casă. Barista îl scanează și primești o ștampilă.",
        hu: "Minden rendelésnél mutasd meg a kártyád QR-kódját a kasszánál. A barista beolvassa, és kapsz egy pecsétet.",
        en: "With every order, show the QR code on your card at the counter. The barista scans it and you get a stamp.",
      },
      ...present([doubleStampRule(config)]),
      stampWindowRule(config),
      {
        ro: "O singură dată poți primi o ștampilă bonus pentru o recenzie lăsată pe Google. Se acordă de baristă, la casă.",
        hu: "Egyszer egy bónusz pecsétet is kaphatsz egy Google-értékelésért. A barista adja, a kasszánál.",
        en: "Once, you can get a bonus stamp for leaving a Google review. The barista adds it at the counter.",
      },
    ],
  },
  {
    heading: { ro: "Recompense", hu: "Jutalmak", en: "Rewards" },
    body: [
      ...present([midRewardRule(config)]),
      freeDrinkRule(config),
      ...present([birthdayRule(config), rewardValueCapRule(config)]),
      {
        ro: "Recompensele se predau la casă și nu se pot schimba în bani.",
        hu: "A jutalmakat a kasszánál kapod meg, pénzre nem válthatók.",
        en: "Rewards are handed over at the counter and cannot be exchanged for money.",
      },
    ],
  },
  {
    heading: { ro: "Student Circle", hu: "Student Circle", en: "Student Circle" },
    body: [
      {
        ro: "Elevii și studenții primesc cardul Student Circle, cu reducere la combo-uri. Bifezi la înscriere că ești elev sau student, iar reducerea se activează după ce arăți carnetul sau legitimația la casă, o singură dată.",
        hu: "A diákok és egyetemisták Student Circle kártyát kapnak, kedvezménnyel a combókra. A regisztrációnál jelölöd be, a kedvezmény pedig azután él, hogy egyszer megmutattad a diákigazolványod a kasszánál.",
        en: "Pupils and students get the Student Circle card, with a discount on combos. You tick the box at signup, and the discount activates once you show your student ID at the counter, one time.",
      },
    ],
  },
  // Gold turned off in /admin/setari means the rules must not describe it at
  // all. The section disappears rather than shrinking: half a Gold chapter
  // would read as a program the café no longer runs, which is exactly what a
  // regulament is not allowed to do.
  ...(config.gold.enabled
    ? [
        {
          heading: {
            ro: "Origins Gold",
            hu: "Origins Gold",
            en: "Origins Gold",
          },
          body: [
            goldQualifyRule(config),
            ...present([goldCardRule(config), goldPerksRule(config)]),
            goldKeepRule(config),
          ],
        },
      ]
    : []),
  {
    heading: { ro: "Cardul tău", hu: "A kártyád", en: "Your card" },
    body: [
      {
        ro: "Un număr de telefon înseamnă un singur card. Cardul e personal.",
        hu: "Egy telefonszámhoz egy kártya tartozik. A kártya személyes.",
        en: "One phone number means one card. The card is personal.",
      },
      {
        ro: "Sub 16 ani, înscrierea se face cu acordul unui părinte sau al unui tutore.",
        hu: "16 év alatt a regisztrációhoz szülő vagy gondviselő beleegyezése szükséges.",
        en: "Under 16, signing up requires the consent of a parent or guardian.",
      },
      {
        ro: "Dacă pierzi linkul cardului, îl primești înapoi la casă, după numărul de telefon.",
        hu: "Ha elveszted a kártyád linkjét, a kasszánál visszakapod a telefonszámod alapján.",
        en: "If you lose your card link, you can get it back at the counter using your phone number.",
      },
    ],
  },
  // /desen links here as /regulament#desen. Placeholder until the lawyer
  // signs off the contest rules; the real text replaces this one paragraph.
  {
    id: "desen",
    heading: {
      ro: "Concursul de desene 2026",
      hu: "Rajzpályázat 2026",
      en: "Drawing contest 2026",
    },
    body: [
      {
        ro: "Regulamentul concursului „Crăciunul, desenat de cei mici. Ediția I, 2026” se publică după validarea juridică.",
        hu: "„A karácsony, ahogy a kicsik rajzolják. I. kiadás, 2026” pályázat szabályzata a jogi ellenőrzés után jelenik meg.",
        en: "The rules of the 2026 drawing contest are published after legal review.",
      },
      // Calendar and public vote: fixed by the client on 10.11.2026
      // (lib/drawing.ts CONTEST_CALENDAR, lib/drawing-vote.ts).
      {
        ro: "Desenele se primesc în cafenele între 16 noiembrie și 1 decembrie 2026. Cu acordul părintelui, fiecare desen apare în galeria online în cel mult 24 de ore de la depunere.",
        hu: "A rajzokat 2026. november 16. és december 1. között várjuk a kávézókban. A szülő hozzájárulásával minden rajz a leadástól számított legfeljebb 24 órán belül megjelenik az online galériában.",
        en: "Drawings are accepted in the cafés from 16 November to 1 December 2026. With the parent's consent, each drawing appears in the online gallery within 24 hours of being handed in.",
      },
      {
        ro: "Pe paharele Origins ajung zece desene: șapte alese de juriu și trei alese prin vot public, câte unul pentru fiecare grupă de vârstă (3-5, 6-9 și 10-14 ani). Câștigătorii votului se stabilesc primii, iar juriul alege din celelalte desene. Anunțul se face pe 6 decembrie 2026.",
        hu: "Az Origins poharakra tíz rajz kerül: hetet a zsűri választ, hármat a közönség szavazata, korcsoportonként egyet (3-5, 6-9 és 10-14 év). Először a közönségszavazás nyertesei dőlnek el, a zsűri a többi rajz közül választ. Az eredményhirdetés 2026. december 6-án lesz.",
        en: "Ten drawings go on the Origins cups: seven chosen by the jury and three by public vote, one for each age group (3-5, 6-9 and 10-14). The vote winners are decided first, and the jury chooses from the other drawings. The announcement is on 6 December 2026.",
      },
      {
        ro: "Un desen poate fi votat din momentul în care apare în galerie până pe 3 decembrie 2026, ora 23:59. Votul se confirmă cu un cod primit pe e-mail. Fiecare adresă de e-mail poate da un singur vot pentru un desen și poate vota mai multe desene.",
        hu: "Egy rajzra attól a pillanattól lehet szavazni, hogy megjelenik a galériában, 2026. december 3-án 23:59-ig. A szavazatot e-mailben kapott kóddal kell megerősíteni. Egy e-mail-címről egy rajzra egy szavazat adható, de több rajzra is lehet szavazni.",
        en: "A drawing can be voted for from the moment it appears in the gallery until 3 December 2026, 23:59. The vote is confirmed with a code received by e-mail. Each e-mail address can give one vote per drawing and can vote for several drawings.",
      },
      {
        ro: "La fiecare grupă de vârstă câștigă desenul cu cele mai multe voturi pe zi, adică voturile primite împărțite la numărul de zile de când desenul e în galerie, ca desenele aduse mai târziu să aibă aceeași șansă. Numărul de voturi nu se afișează public.",
        hu: "Minden korcsoportban az a rajz nyer, amelyik naponta átlagosan a legtöbb szavazatot kapta, vagyis a szavazatok számát elosztjuk a galériában töltött napok számával, hogy a később behozott rajzoknak is ugyanannyi esélyük legyen. A szavazatok száma nem nyilvános.",
        en: "In each age group the winner is the drawing with the most votes per day, meaning the votes received divided by the number of days the drawing has been in the gallery, so that drawings brought in later have the same chance. Vote counts are not shown publicly.",
      },
    ],
  },
  {
    heading: { ro: "Despre program", hu: "A programról", en: "About the program" },
    body: [
      {
        ro: "Origins poate modifica sau încheia programul. Anunțăm schimbările în cafenele, iar regulamentul actualizat se publică pe această pagină.",
        hu: "Az Origins módosíthatja vagy lezárhatja a programot. A változásokról a kávézókban szólunk, a friss szabályzat pedig ezen az oldalon jelenik meg.",
        en: "Origins may change or end the program. We announce changes in the coffee shops, and the updated rules are published on this page.",
      },
      {
        ro: "Întrebări: contact@originscafe.ro sau la casă, în orice cafenea Origins.",
        hu: "Kérdésed van? contact@originscafe.ro, vagy kérdezz a kasszánál bármelyik Origins kávézóban.",
        en: "Questions: contact@originscafe.ro, or ask at the counter in any Origins coffee shop.",
      },
    ],
  },
];

export default async function RegulamentPage() {
  const config = await getDb().getLoyaltyConfig();

  return (
    <LegalPage
      eyebrow={{ ro: "Origins Circle" }}
      title={{
        ro: "Regulamentul programului",
        hu: "A program szabályzata",
        en: "Program rules",
      }}
      sections={sections(config)}
    />
  );
}
