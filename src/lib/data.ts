import type { Category, I18nText, Location, Product } from "./types";

/**
 * Seed data — LOCAL PHASE ONLY. Mirrors the Supabase schema
 * (supabase/migrations/0001_init.sql); swapped for DB queries in phase 3.
 *
 * Locations verified 25.07.2026 (Google listings + client README).
 * Menu transcribed 08.08.2026 from the printed card the client sent,
 * "Meniu Origins Rogerius 2026" — names, ingredients, grammages, volumes and
 * prices are exactly what is on it. Nothing here may be guessed: null = not
 * confirmed → the UI hides the element.
 */

export const locations: Location[] = [
  {
    slug: "era",
    name: "ERA Shopping Park",
    address: { ro: "Calea Aradului 62, Oradea", hu: "Calea Aradului 62, Nagyvárad" },
    hours: { ro: "L-D 09:00 - 21:00", hu: "H-V 09:00 - 21:00", en: "Mon-Sun 09:00 - 21:00" },
    comingSoon: false,
    seasonalNote: null,
    // place id derived from the Maps link on originscafe.ro (ftid 0x4746474580c154a5:0xa7839c9a2d40b69d)
    googlePlaceId: "ChIJpVTBgEVHRkcRnbZALZqcg6c",
    googleRating: 4.9,
    googleReviewCount: 73,
    reviewUrl:
      "https://search.google.com/local/writereview?placeid=ChIJpVTBgEVHRkcRnbZALZqcg6c",
    woltUrl: null, // TODO: confirm "Origins ERA" Wolt URL
    // Client (Roland), 11.08.2026: ERA serves alcohol too.
    servesAlcohol: true,
    photo: "/photos/loc-era.webp",
    heroPhoto: "/photos/hero-era-ddb7862a.webp",
  },
  {
    slug: "gara",
    name: "Palatul Copiilor",
    address: { ro: "Strada Muzeului 2, Oradea", hu: "Strada Muzeului 2, Nagyvárad" },
    hours: null, // to confirm
    comingSoon: false,
    seasonalNote: null,
    googlePlaceId: null,
    googleRating: null,
    googleReviewCount: null,
    reviewUrl: null,
    woltUrl: null,
    // Client (Roland), 11.08.2026: Palatul Copiilor serves alcohol too.
    servesAlcohol: true,
    photo: "/photos/loc-gara.webp",
    heroPhoto: "/photos/hero-gara-f8aee5d8.webp",
  },
  {
    slug: "oraselul",
    name: "Orășelul Copiilor",
    address: { ro: "Calea Corneliu Coposu 8, Oradea", hu: "Calea Corneliu Coposu 8, Nagyvárad" },
    // Client, 08.08.2026: the park kiosk runs a different clock each month.
    // March-June not given yet → null, so those months show nothing instead of
    // a guessed schedule.
    hours: null,
    hoursByMonth: {
      7: { ro: "09:00 - 21:00", hu: "09:00 - 21:00", en: "09:00 - 21:00" },
      8: { ro: "10:00 - 22:00", hu: "10:00 - 22:00", en: "10:00 - 22:00" },
      9: { ro: "09:00 - 21:00", hu: "09:00 - 21:00", en: "09:00 - 21:00" },
      10: { ro: "10:00 - 20:00", hu: "10:00 - 20:00", en: "10:00 - 20:00" },
    },
    comingSoon: false,
    seasonalNote: { ro: "Deschis martie - octombrie", hu: "Nyitva márciustól októberig", en: "Open March - October" },
    googlePlaceId: null, // no listing yet — created in M0
    googleRating: null,
    googleReviewCount: null,
    reviewUrl: null,
    woltUrl: null,
    // Client decision: no alcohol at the children's park, ever.
    servesAlcohol: false,
    photo: "/photos/loc-oraselul-9ff6b6e1.webp",
    heroPhoto: "/photos/hero-oraselul-6f41716b.webp",
  },
  {
    slug: "rogerius",
    name: "Rogerius",
    address: { ro: "Calea Corneliu Coposu 33, Oradea", hu: "Calea Corneliu Coposu 33, Nagyvárad" },
    hours: { ro: "L-V 07:00 - 21:00", hu: "H-P 07:00 - 21:00", en: "Mon-Fri 07:00 - 21:00" }, // weekend: to confirm
    comingSoon: false,
    seasonalNote: null,
    // place id derived from the Maps link on originscafe.ro (ftid 0x474649074b4370af:0x2ebcd64e1fbfcc4a)
    googlePlaceId: "ChIJr3BDSwdJRkcRSsy_H07WvC4",
    googleRating: 4.8,
    googleReviewCount: 127,
    reviewUrl:
      "https://search.google.com/local/writereview?placeid=ChIJr3BDSwdJRkcRSsy_H07WvC4",
    woltUrl: null,
    // Confirmed by the printed Rogerius card (cocktails, beer, spirits).
    servesAlcohol: true,
    photo: "/photos/loc-rogerius-fdd7caf3.webp",
    heroPhoto: "/photos/hero-rogerius-d1859c6f.webp",
  },
  {
    slug: "lazar",
    name: "Aurel Lazăr",
    address: { ro: "Strada Aurel Lazăr 21, Oradea", hu: "Strada Aurel Lazăr 21, Nagyvárad" },
    hours: null,
    comingSoon: true, // reopens as piadinărie — date to confirm
    seasonalNote: null,
    googlePlaceId: null,
    googleRating: null,
    googleReviewCount: null,
    reviewUrl: null,
    woltUrl: null,
    servesAlcohol: null,
  },
];

/** Sections, in the order they are printed on the card. */
export const categories: Category[] = [
  { slug: "cafea", name: { ro: "Cafea", hu: "Kávé", en: "Coffee" }, order: 1, photo: "/photos/cat-cafea-17d01f26.webp" },
  { slug: "patiserie", name: { ro: "Patiserie", hu: "Péksütemény", en: "Pastries" }, order: 2, photo: "/photos/cat-patiserie-76f6bdb8.webp" },
  { slug: "inghetata", name: { ro: "Înghețată", hu: "Fagylalt", en: "Ice cream" }, order: 3, photo: "/photos/cat-inghetata-cc2eed30.webp" },
  { slug: "piadine", name: { ro: "Piadine", hu: "Piadinák", en: "Piadinas" }, order: 4, photo: "/photos/cat-piadine-809cfd86.webp" },
  { slug: "naturale", name: { ro: "Naturale", hu: "Frissek & limonádék", en: "Fresh juices & lemonades" }, order: 5, photo: "/photos/cat-naturale-77096fba.webp" },
  { slug: "racoritoare", name: { ro: "Băuturi răcoritoare", hu: "Üdítők", en: "Soft drinks" }, order: 6, photo: "/photos/cat-racoritoare-9e791952.webp" },
  { slug: "combo", name: { ro: "Combo", hu: "Combo", en: "Combo" }, order: 7, photo: "/photos/cat-combo-947499e3.webp" },
  { slug: "extra", name: { ro: "Extra", hu: "Extrák", en: "Extras" }, order: 8, photo: "/photos/cat-extra-9caf53be.webp" },
  { slug: "cocktailuri", name: { ro: "Cocktailuri", hu: "Koktélok", en: "Cocktails" }, order: 9, photo: "/photos/cat-cocktailuri-dded9dff.webp" },
  { slug: "aperitive", name: { ro: "Aperitive", hu: "Aperitifek", en: "Aperitifs" }, order: 10, photo: "/photos/cat-aperitive-2e311eec.webp" },
  { slug: "bere", name: { ro: "Bere", hu: "Sör", en: "Beer" }, order: 11, photo: "/photos/cat-bere-4323b70a.webp" },
  { slug: "bere-draught", name: { ro: "Bere draught", hu: "Csapolt sör", en: "Draught beer" }, order: 12, photo: "/photos/cat-bere-draught-d79434d8.webp" },
  { slug: "cidru", name: { ro: "Cidru", hu: "Cider", en: "Cider" }, order: 13, photo: "/photos/cat-cidru-034b1a24.webp" },
  { slug: "spirtoase", name: { ro: "Spirtoase", hu: "Röviditalok", en: "Spirits" }, order: 14, photo: "/photos/cat-spirtoase-83c7f654.webp" },
];

/**
 * Whole sections of the card that are alcohol. Stated once here rather than
 * repeated on ~25 rows, so no bottle can reach a location that does not serve
 * alcohol (Orășelul Copiilor, ERA) because a flag was forgotten.
 */
const ALCOHOL_CATEGORIES = new Set([
  "cocktailuri",
  "aperitive",
  "bere",
  "bere-draught",
  "cidru",
  "spirtoase",
]);

interface MenuRow {
  id: string;
  category: string;
  name: I18nText;
  /** Ingredients and volume/grammage, worded as on the printed card. */
  description?: I18nText;
  /** Exact price in lei; omit when only a minimum is confirmed. */
  price?: number;
  /** "de la X lei" when the card shows a range instead of one price. */
  priceFrom?: number;
  /** Location slugs; omitted = the row belongs to every cafenea. */
  locations?: string[];
  /** Only to contradict the category rule above. */
  alcohol?: boolean;
  seasonal?: boolean;
  photo?: string;
}

function menu(rows: MenuRow[]): Product[] {
  return rows.map((row) => ({
    id: row.id,
    categorySlug: row.category,
    name: row.name,
    description: row.description ?? null,
    price: row.price ?? null,
    priceFrom: row.priceFrom ?? null,
    locations: row.locations ?? null,
    alcohol: row.alcohol ?? ALCOHOL_CATEGORIES.has(row.category),
    seasonal: row.seasonal ?? false,
    ...(row.photo ? { photo: row.photo } : {}),
  }));
}

export const products: Product[] = menu([
  /* ------------------------------------------------------------ cafea --- */
  { id: "ristretto", category: "cafea", name: { ro: "Ristretto" }, description: { ro: "22 ml" }, price: 9.5 },
  { id: "espresso", category: "cafea", name: { ro: "Espresso" }, description: { ro: "30 ml" }, price: 9.5, photo: "/photos/p-espresso-5f08cd61.webp" },
  {
    id: "espresso-dublu",
    category: "cafea",
    name: { ro: "Espresso dublu", hu: "Dupla espresso", en: "Double espresso" },
    description: { ro: "60 ml" },
    price: 14,
    photo: "/photos/p-espresso-dublu-733c356b.webp",
  },
  {
    id: "americano",
    category: "cafea",
    name: { ro: "Americano" },
    description: {
      ro: "espresso, apă fierbinte · 120 ml",
      hu: "espresso, forró víz · 120 ml",
      en: "espresso, hot water · 120 ml",
    },
    price: 10.5,
    photo: "/photos/p-americano-06940c2b.webp",
  },
  {
    id: "cappuccino",
    category: "cafea",
    name: { ro: "Cappuccino" },
    description: {
      ro: "espresso, cremă de lapte · 180 ml",
      hu: "espresso, tejhab · 180 ml",
      en: "espresso, steamed milk · 180 ml",
    },
    price: 14.5,
    photo: "/photos/p-cappuccino-cf36e515.webp",
  },
  {
    id: "cappuccino-vienez",
    category: "cafea",
    name: { ro: "Cappuccino vienez", hu: "Bécsi cappuccino", en: "Viennese cappuccino" },
    description: {
      ro: "espresso, cremă de lapte, frișcă · 180 ml",
      hu: "espresso, tejhab, tejszínhab · 180 ml",
      en: "espresso, steamed milk, whipped cream · 180 ml",
    },
    price: 17,
    photo: "/photos/p-cappuccino-vienez-74405830.webp",
  },
  {
    id: "macchiato",
    category: "cafea",
    name: { ro: "Macchiato" },
    description: {
      ro: "espresso, cremă de lapte · 45 ml",
      hu: "espresso, tejhab · 45 ml",
      en: "espresso, steamed milk · 45 ml",
    },
    price: 11.5,
    photo: "/photos/p-macchiato-f6abdc3b.webp",
  },
  {
    id: "flat-white",
    category: "cafea",
    name: { ro: "Flat white" },
    description: {
      ro: "espresso dublu, cremă de lapte · 180 ml",
      hu: "dupla espresso, tejhab · 180 ml",
      en: "double espresso, steamed milk · 180 ml",
    },
    price: 17,
    photo: "/photos/p-flat-white.webp",
  },
  {
    id: "latte-macchiato",
    category: "cafea",
    name: { ro: "Latte macchiato" },
    description: {
      ro: "cremă de lapte, espresso · 300 ml",
      hu: "tejhab, espresso · 300 ml",
      en: "steamed milk, espresso · 300 ml",
    },
    price: 16,
    photo: "/photos/p-latte-macchiato-249a2f31.webp",
  },
  {
    id: "maxi-latte-macchiato",
    category: "cafea",
    name: { ro: "Maxi latte macchiato" },
    description: {
      ro: "cremă de lapte, espresso dublu · 450 ml",
      hu: "tejhab, dupla espresso · 450 ml",
      en: "steamed milk, double espresso · 450 ml",
    },
    price: 18.5,
    photo: "/photos/p-maxi-latte-macchiato-ec1383df.webp",
  },
  {
    id: "ice-coffee",
    category: "cafea",
    name: { ro: "Ice coffee" },
    description: {
      ro: "espresso, înghețată, lapte, frișcă lichidă, gheață · 300 ml",
      hu: "espresso, fagylalt, tej, tejszín, jég · 300 ml",
      en: "espresso, ice cream, milk, cream, ice · 300 ml",
    },
    price: 21,
    photo: "/photos/p-ice-coffee-ea9407c1.webp",
  },
  {
    id: "affogato",
    category: "cafea",
    name: { ro: "Affogato" },
    description: {
      ro: "espresso, 1 glob de înghețată · 120 ml",
      hu: "espresso, 1 gombóc fagylalt · 120 ml",
      en: "espresso, 1 scoop of ice cream · 120 ml",
    },
    price: 16,
    photo: "/photos/p-affogato-4d7c80f1.webp",
  },
  {
    id: "ceai",
    category: "cafea",
    name: { ro: "Ceai", hu: "Tea", en: "Tea" },
    description: {
      ro: "diverse sortimente · 300 ml",
      hu: "többféle ízben · 300 ml",
      en: "assorted blends · 300 ml",
    },
    price: 13.5,
    photo: "/photos/p-ceai-14d76ea8.webp",
  },
  {
    id: "ciocolata-calda",
    category: "cafea",
    name: { ro: "Ciocolată caldă", hu: "Forró csokoládé", en: "Hot chocolate" },
    description: { ro: "200 ml" },
    price: 15,
    photo: "/photos/p-ciocolata-calda-23e26fc6.webp",
  },

  /* -------------------------------------------------------- patiserie --- */
  {
    id: "croissant",
    category: "patiserie",
    name: { ro: "Croissant cu unt", hu: "Vajas croissant", en: "Butter croissant" },
    description: {
      ro: "făină, unt, zahăr · 60 g",
      hu: "liszt, vaj, cukor · 60 g",
      en: "flour, butter, sugar · 60 g",
    },
    price: 7,
    photo: "/photos/p-croissant-78133d3a.webp",
  },
  {
    id: "pain-au-chocolat",
    category: "patiserie",
    name: { ro: "Pain au chocolat" },
    description: {
      ro: "făină, unt, zahăr, ciocolată · 75 g",
      hu: "liszt, vaj, cukor, csokoládé · 75 g",
      en: "flour, butter, sugar, chocolate · 75 g",
    },
    price: 8,
    photo: "/photos/p-pain-au-chocolat-75067397.webp",
  },

  /* -------------------------------------------------------- inghetata --- */
  // Not on the printed Rogerius card — the gelato counter is its own offer,
  // stated by the client 08.08.2026. One row per café because only the number
  // on display differs; PREȚUL NU E CONFIRMAT, so no price is shown yet.
  {
    id: "inghetata-rogerius",
    category: "inghetata",
    name: { ro: "Înghețată", hu: "Fagylalt", en: "Ice cream" },
    description: {
      ro: "13 sortimente la vitrină, din gama de 26",
      hu: "13 ízesítés a pultban, a 26-os kínálatból",
      en: "13 flavours on display, from a range of 26",
    },
    locations: ["rogerius"],
    photo: "/photos/p-inghetata-c3bcab24.webp",
  },
  {
    id: "inghetata-era",
    category: "inghetata",
    name: { ro: "Înghețată", hu: "Fagylalt", en: "Ice cream" },
    description: {
      ro: "8 sortimente la vitrină, din gama de 26",
      hu: "8 ízesítés a pultban, a 26-os kínálatból",
      en: "8 flavours on display, from a range of 26",
    },
    locations: ["era"],
    photo: "/photos/p-inghetata-c3bcab24.webp",
  },
  {
    id: "inghetata-oraselul",
    category: "inghetata",
    name: { ro: "Înghețată", hu: "Fagylalt", en: "Ice cream" },
    description: {
      ro: "16 sortimente la vitrină, din gama de 26",
      hu: "16 ízesítés a pultban, a 26-os kínálatból",
      en: "16 flavours on display, from a range of 26",
    },
    locations: ["oraselul"],
    photo: "/photos/p-inghetata-c3bcab24.webp",
  },

  /* ---------------------------------------------------------- piadine --- */
  {
    id: "piadina-clasica",
    category: "piadine",
    name: { ro: "Piadina Clasica" },
    description: {
      ro: "lipie, mozzarella, prosciutto crudo, rucola · 220 g",
      hu: "lepény, mozzarella, prosciutto crudo, rukkola · 220 g",
      en: "flatbread, mozzarella, prosciutto crudo, rocket · 220 g",
    },
    price: 28,
    photo: "/photos/p-piadina-clasica-c200dc7c.webp",
  },
  {
    id: "piadina-diavola",
    category: "piadine",
    name: { ro: "Piadina Diavola" },
    description: {
      ro: "lipie, salam picant, cremă de brânză, gorgonzola, roșii uscate · 235 g",
      hu: "lepény, csípős szalámi, krémsajt, gorgonzola, aszalt paradicsom · 235 g",
      en: "flatbread, spicy salami, cream cheese, gorgonzola, sun-dried tomatoes · 235 g",
    },
    price: 26.5,
    photo: "/photos/p-piadina-diavola-96496620.webp",
  },
  {
    id: "piadina-cotto-brie",
    category: "piadine",
    name: { ro: "Piadina Cotto e Brie" },
    description: {
      ro: "lipie, prosciutto cotto, cremă de brânză, brânză brie · 215 g",
      hu: "lepény, prosciutto cotto, krémsajt, brie sajt · 215 g",
      en: "flatbread, prosciutto cotto, cream cheese, brie · 215 g",
    },
    price: 25.5,
    photo: "/photos/p-piadina-cotto-brie-4d5dd6ee.webp",
  },
  {
    id: "piadina-vegetariana",
    category: "piadine",
    name: { ro: "Piadina Vegetariană", hu: "Vegetáriánus piadina", en: "Vegetarian piadina" },
    description: {
      ro: "lipie, mozzarella, brie, gorgonzola, ciuperci, rucola · 225 g",
      hu: "lepény, mozzarella, brie, gorgonzola, gomba, rukkola · 225 g",
      en: "flatbread, mozzarella, brie, gorgonzola, mushrooms, rocket · 225 g",
    },
    price: 25.5,
    photo: "/photos/p-piadina-vegetariana-21e52cf7.webp",
  },

  /* --------------------------------------------------------- naturale --- */
  {
    id: "fresh-portocale",
    category: "naturale",
    name: { ro: "Fresh portocale", hu: "Narancs fresh", en: "Orange juice" },
    description: { ro: "300 ml" },
    price: 17.5,
    photo: "/photos/p-fresh-portocale-ba6b0dc6.webp",
  },
  {
    id: "fresh-grapefruit",
    category: "naturale",
    name: { ro: "Fresh grapefruit", hu: "Grapefruit fresh", en: "Grapefruit juice" },
    description: { ro: "300 ml" },
    price: 17.5,
    photo: "/photos/p-fresh-grapefruit-bca71e0a.webp",
  },
  {
    id: "fresh-mixt",
    category: "naturale",
    name: { ro: "Fresh mixt", hu: "Vegyes fresh", en: "Mixed juice" },
    description: { ro: "300 ml" },
    price: 17.5,
    photo: "/photos/p-fresh-mixt-db12bb2d.webp",
  },
  {
    id: "fresh-rodie",
    category: "naturale",
    name: { ro: "Fresh rodie", hu: "Gránátalma fresh", en: "Pomegranate juice" },
    description: { ro: "200 ml" },
    price: 22,
    photo: "/photos/p-fresh-rodie-b8c8ac03.webp",
  },
  {
    id: "limonada",
    category: "naturale",
    name: { ro: "Limonadă", hu: "Limonádé", en: "Lemonade" },
    description: { ro: "450 ml" },
    price: 16,
    photo: "/photos/p-limonada-31b2f921.webp",
  },
  // Three fruit flavours, one line each: the colour differs, so each one earns
  // its own photo instead of hiding behind a generic "cu fructe".
  {
    id: "limonada-mango",
    category: "naturale",
    name: { ro: "Limonadă cu mango", hu: "Mangós limonádé", en: "Mango lemonade" },
    description: {
      ro: "Limonadă cu mango, servită rece · 450 ml",
      hu: "Mangós limonádé, hidegen szervírozva · 450 ml",
      en: "Mango lemonade, served cold · 450 ml",
    },
    price: 20,
    // The card's summer hero; the manager moves the flag from /admin/meniu.
    seasonal: true,
    photo: "/photos/p-limonada-mango-8f130c64.webp",
  },
  {
    id: "limonada-fructe-padure",
    category: "naturale",
    name: {
      ro: "Limonadă cu fructe de pădure",
      hu: "Erdei gyümölcsös limonádé",
      en: "Forest fruit lemonade",
    },
    description: {
      ro: "Limonadă cu fructe de pădure, servită rece · 450 ml",
      hu: "Erdei gyümölcsös limonádé, hidegen szervírozva · 450 ml",
      en: "Forest fruit lemonade, served cold · 450 ml",
    },
    price: 20,
    photo: "/photos/p-limonada-fructe-padure-2055d1cb.webp",
  },
  {
    id: "limonada-capsuni",
    category: "naturale",
    name: { ro: "Limonadă cu căpșuni", hu: "Epres limonádé", en: "Strawberry lemonade" },
    description: {
      ro: "Limonadă cu căpșuni, servită rece · 450 ml",
      hu: "Epres limonádé, hidegen szervírozva · 450 ml",
      en: "Strawberry lemonade, served cold · 450 ml",
    },
    price: 20,
    photo: "/photos/p-limonada-capsuni-a24a14db.webp",
  },

  /* ------------------------------------------------------ racoritoare --- */
  { id: "coca-cola", category: "racoritoare", name: { ro: "Coca Cola" }, description: { ro: "250 ml" }, price: 11 },
  { id: "fanta", category: "racoritoare", name: { ro: "Fanta" }, description: { ro: "250 ml" }, price: 11 },
  { id: "sprite", category: "racoritoare", name: { ro: "Sprite" }, description: { ro: "250 ml" }, price: 11 },
  { id: "schweppes", category: "racoritoare", name: { ro: "Schweppes" }, description: { ro: "250 ml" }, price: 11 },
  {
    id: "dorna-plata",
    category: "racoritoare",
    name: { ro: "Dorna apă plată", hu: "Dorna szénsavmentes víz", en: "Dorna still water" },
    description: { ro: "330 ml" },
    price: 10,
  },
  {
    id: "dorna-minerala",
    category: "racoritoare",
    name: { ro: "Dorna apă minerală", hu: "Dorna ásványvíz", en: "Dorna sparkling water" },
    description: { ro: "330 ml" },
    price: 10,
  },
  {
    id: "cappy-portocale",
    category: "racoritoare",
    name: { ro: "Cappy portocale", hu: "Cappy narancs", en: "Cappy orange" },
    // The printed card gives no volume for this one — left out, not guessed.
    price: 12,
  },
  {
    id: "cappy-portocale-rosii",
    category: "racoritoare",
    name: { ro: "Cappy portocale roșii", hu: "Cappy vérnarancs", en: "Cappy blood orange" },
    description: { ro: "250 ml" },
    price: 12,
  },

  /* ------------------------------------------------------------ combo --- */
  { id: "combo-espresso-cola", category: "combo", name: { ro: "Espresso + Cola" }, price: 16 },
  {
    id: "combo-espresso-apa",
    category: "combo",
    name: { ro: "Espresso + apă", hu: "Espresso + víz", en: "Espresso + water" },
    price: 16,
  },
  { id: "combo-cappuccino-pain", category: "combo", name: { ro: "Cappuccino + pain au chocolat" }, price: 16 },

  /* ------------------------------------------------------------ extra --- */
  {
    id: "extra-lapte-vegetal",
    category: "extra",
    name: { ro: "Lapte vegetal", hu: "Növényi tej", en: "Plant milk" },
    description: {
      ro: "migdale, soia, cocos",
      hu: "mandula, szója, kókusz",
      en: "almond, soy, coconut",
    },
    price: 4,
  },
  {
    id: "extra-aroma",
    category: "extra",
    name: { ro: "Aromă", hu: "Ízesítés", en: "Syrup" },
    description: {
      ro: "choco cookie, caramel, caramel sărat, vanilie, migdale, popcorn, pumpkin spice · 10 ml",
      hu: "choco cookie, karamell, sós karamell, vanília, mandula, popcorn, pumpkin spice · 10 ml",
      en: "choco cookie, caramel, salted caramel, vanilla, almond, popcorn, pumpkin spice · 10 ml",
    },
    price: 3,
  },
  {
    id: "extra-aloe-vera",
    category: "extra",
    name: { ro: "Aloe vera" },
    description: { ro: "10 g" },
    price: 3,
  },

  /* ------------------------------------------------------ cocktailuri --- */
  {
    id: "cuba-libre",
    category: "cocktailuri",
    name: { ro: "Cuba Libre Cubano" },
    description: {
      ro: "rom, cola, lime, gheață · 250 ml",
      hu: "rum, kóla, lime, jég · 250 ml",
      en: "rum, cola, lime, ice · 250 ml",
    },
    price: 25,
    photo: "/photos/p-cuba-libre-c828b306.webp",
  },
  {
    id: "gin-tonic",
    category: "cocktailuri",
    name: { ro: "Gin Tonic" },
    description: {
      ro: "gin, apă tonică, lămâie, gheață · 250 ml",
      hu: "gin, tonik, citrom, jég · 250 ml",
      en: "gin, tonic water, lemon, ice · 250 ml",
    },
    price: 25,
    photo: "/photos/p-gin-tonic-30f24a9b.webp",
  },
  {
    id: "gin-sonic",
    category: "cocktailuri",
    name: { ro: "Gin Sonic" },
    description: {
      ro: "gin, apă tonică, lămâie, sirop soc, suc grepfrut, gheață · 250 ml",
      hu: "gin, tonik, citrom, bodzaszörp, grapefruitlé, jég · 250 ml",
      en: "gin, tonic water, lemon, elderflower syrup, grapefruit juice, ice · 250 ml",
    },
    price: 25,
    photo: "/photos/p-gin-sonic-b0ef13d3.webp",
  },
  {
    id: "mojito",
    category: "cocktailuri",
    name: { ro: "Mojito" },
    description: {
      ro: "rom, sodă, lime, mentă, gheață · 250 ml",
      hu: "rum, szóda, lime, menta, jég · 250 ml",
      en: "rum, soda, lime, mint, ice · 250 ml",
    },
    price: 25,
    photo: "/photos/p-mojito-d92d074a.webp",
  },
  {
    id: "lemon-ginger-gin",
    category: "cocktailuri",
    name: { ro: "Lemon Ginger Gin" },
    description: {
      ro: "gin, suc lămâie, ghimbir, Schweppes bitter lemon, gheață · 250 ml",
      hu: "gin, citromlé, gyömbér, Schweppes bitter lemon, jég · 250 ml",
      en: "gin, lemon juice, ginger, Schweppes bitter lemon, ice · 250 ml",
    },
    price: 25,
    photo: "/photos/p-lemon-ginger-gin-8bc09970.webp",
  },
  {
    id: "aperol-spritz",
    category: "cocktailuri",
    name: { ro: "Aperol Spritz" },
    description: {
      ro: "prosecco, Aperol, sodă, gheață · 300 ml",
      hu: "prosecco, Aperol, szóda, jég · 300 ml",
      en: "prosecco, Aperol, soda, ice · 300 ml",
    },
    price: 25,
    photo: "/photos/p-aperol-spritz-a9ddf703.webp",
  },
  {
    id: "hugo",
    category: "cocktailuri",
    name: { ro: "Hugo" },
    description: {
      ro: "prosecco, sodă, sirop de soc, lime, mentă, gheață · 300 ml",
      hu: "prosecco, szóda, bodzaszörp, lime, menta, jég · 300 ml",
      en: "prosecco, soda, elderflower syrup, lime, mint, ice · 300 ml",
    },
    price: 25,
    photo: "/photos/p-hugo-2087c0b6.webp",
  },
  {
    id: "daiquiri",
    category: "cocktailuri",
    name: { ro: "Daiquiri" },
    description: {
      ro: "rom negru, suc grepfrut, zahăr, grenadine, gheață · 250 ml",
      hu: "sötét rum, grapefruitlé, cukor, grenadine, jég · 250 ml",
      en: "dark rum, grapefruit juice, sugar, grenadine, ice · 250 ml",
    },
    price: 25,
  },

  /* -------------------------------------------------------- aperitive --- */
  { id: "prosecco", category: "aperitive", name: { ro: "Prosecco" }, description: { ro: "125 ml" }, price: 20 },
  {
    id: "prosecco-valdobiaddene",
    category: "aperitive",
    // Spelled as on the printed card (the DOCG region is "Valdobbiadene").
    name: { ro: "Prosecco Valdobiaddene DOC" },
    description: { ro: "750 ml" },
    price: 95,
  },

  /* ------------------------------------------------------------- bere --- */
  { id: "heineken", category: "bere", name: { ro: "Heineken" }, description: { ro: "330 ml" }, price: 11.5 },
  { id: "birra-moretti", category: "bere", name: { ro: "Birra Moretti" }, description: { ro: "330 ml" }, price: 11.5 },
  { id: "ciuc-premium", category: "bere", name: { ro: "Ciuc Premium" }, description: { ro: "330 ml" }, price: 10.5 },
  {
    id: "heineken-zero",
    category: "bere",
    name: { ro: "Heineken 0%" },
    description: { ro: "330 ml" },
    price: 11.5,
    // Alcohol-free, but it is printed in the beer block and reads as beer, so
    // it follows the section and stays off the no-alcohol menus. Flip this in
    // /admin/meniu if Origins wants it listed at ERA and Orășelul.
    alcohol: true,
  },
  { id: "corona", category: "bere", name: { ro: "Corona" }, description: { ro: "330 ml" }, price: 16 },

  /* ----------------------------------------------------- bere draught --- */
  { id: "heineken-draught-250", category: "bere-draught", name: { ro: "Heineken" }, description: { ro: "250 ml" }, price: 12 },
  { id: "heineken-draught-400", category: "bere-draught", name: { ro: "Heineken" }, description: { ro: "400 ml" }, price: 16 },

  /* ------------------------------------------------------------ cidru --- */
  { id: "strongbow-dry-white", category: "cidru", name: { ro: "Strongbow Dry White" }, description: { ro: "330 ml" }, price: 13 },
  { id: "strongbow-rose", category: "cidru", name: { ro: "Strongbow Rose" }, description: { ro: "330 ml" }, price: 13 },
  { id: "strongbow-gold-apple", category: "cidru", name: { ro: "Strongbow Gold Apple" }, description: { ro: "330 ml" }, price: 13 },

  /* -------------------------------------------------------- spirtoase --- */
  { id: "jagermeister", category: "spirtoase", name: { ro: "Jägermeister" }, description: { ro: "40 ml" }, price: 13.5 },
  {
    id: "rom-negru",
    category: "spirtoase",
    name: { ro: "Rom negru", hu: "Sötét rum", en: "Dark rum" },
    description: { ro: "40 ml" },
    price: 13,
  },
  { id: "cognac", category: "spirtoase", name: { ro: "Cognac" }, description: { ro: "40 ml" }, price: 14.5 },
  { id: "vodka-sky", category: "spirtoase", name: { ro: "Vodka Sky" }, description: { ro: "40 ml" }, price: 13.5 },
  {
    id: "johnnie-walker-black",
    category: "spirtoase",
    name: { ro: "Johnnie Walker Black Label" },
    description: { ro: "40 ml" },
    price: 18,
  },
  { id: "unicum", category: "spirtoase", name: { ro: "Unicum" }, description: { ro: "40 ml" }, price: 14.5 },
]);

export function getLocation(slug: string): Location | undefined {
  return locations.find((l) => l.slug === slug);
}
