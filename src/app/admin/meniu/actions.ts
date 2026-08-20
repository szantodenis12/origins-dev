"use server";

import { revalidatePath } from "next/cache";
import { getDb } from "@/lib/db";
import { recordAdminAudit } from "@/lib/admin/audit";
import { readStaffSession } from "@/lib/admin/session";
import { getImageStore } from "@/lib/storage";
import { ACCEPTED_IMAGE_MIMES, MAX_IMAGE_BYTES } from "@/lib/images";
import type { StaffSession } from "@/lib/db";
import type { I18nText } from "@/lib/types";

/**
 * Menu editor mutations. Like the barista actions, every one of these is a
 * plain POST endpoint once it ships, so each re-reads the cookie and re-checks
 * the manager role instead of trusting the form it came from.
 */

export type SaveState = { ok: true; text: string } | { ok: false; text: string } | null;

/** Staff screen: Romanian only. */
const strings = {
  noSession: "Sesiunea a expirat. Intră din nou în tură.",
  notManager: "Doar managerul poate schimba meniul.",
  productSaved: "Produs salvat.",
  productAdded: "Produs adăugat.",
  locationSaved: "Cafenea salvată.",
  categorySaved: "Categorie salvată.",
  categoryMissingRow: "Categoria nu mai există. Reîncarcă pagina.",
  photoMissing: "Alege un fișier.",
  photoType: "Doar poze JPG, PNG sau WEBP.",
  photoTooLarge: "Poza depășește 8 MB. Trimite una mai mică.",
  photoUnknown: "Poza aleasă nu mai există. Încarcă alta.",
  productMissing: "Produsul nu mai există. Reîncarcă pagina.",
  locationMissing: "Cafeneaua nu mai există. Reîncarcă pagina.",
  categoryMissing: "Alege o categorie din listă.",
  nameMissing: "Scrie numele produsului în română.",
  badPrice: "Prețul trebuie să fie un număr pozitiv.",
  noLocations: "Bifează cel puțin o cafenea sau alege toate cafenelele.",
  badRating: "Ratingul este un număr între 1 și 5.",
  badReviews: "Numărul de recenzii este un întreg pozitiv.",
  badWolt: "Linkul Wolt trebuie să înceapă cu https://",
  badPlaceId: "Google Place ID nu pare valid.",
  locationNameMissing: "Scrie numele cafenelei.",
  locationExists: "Există deja o cafenea cu numele acesta.",
  locationAdded: (pins: string) =>
    `Cafenea adăugată. Coduri barista (se afișează o singură dată): ${pins}. Notează-le acum.`,
  // Login is only offered for cafenele deschise: say so instead of letting a
  // barista discover it at the counter.
  locationHidden:
    " Cafeneaua este în curând, așa că nici codurile nu intră în tură până nu bifezi Deschisă publicului.",
};

function fail(text: string): SaveState {
  return { ok: false, text };
}

/** Null means "do not touch anything and tell the client why". */
async function managerSession(): Promise<
  { session: StaffSession } | { error: string }
> {
  const session = await readStaffSession();
  if (!session) return { error: strings.noSession };
  if (session.role !== "manager") return { error: strings.notManager };
  return { session };
}

/* ------------------------------------------------------------ parsing --- */

type Amount = { ok: true; value: number | null } | { ok: false };

/**
 * Empty input means "not confirmed" and becomes null, which is how the public
 * menu knows to render nothing. Anything else must be a positive number;
 * Romanian keyboards type a comma, so accept it.
 */
function parseAmount(
  raw: FormDataEntryValue | null,
  limits?: { integer?: boolean; max?: number; allowZero?: boolean },
): Amount {
  const text = String(raw ?? "").trim().replace(",", ".");
  if (text === "") return { ok: true, value: null };

  const value = Number(text);
  if (
    !Number.isFinite(value) ||
    value < 0 ||
    (value === 0 && !limits?.allowZero)
  ) {
    return { ok: false };
  }
  if (limits?.integer && !Number.isInteger(value)) return { ok: false };
  if (limits?.max !== undefined && value > limits.max) return { ok: false };

  return { ok: true, value };
}

function parseText(raw: FormDataEntryValue | null): string | null {
  const text = String(raw ?? "").trim();
  return text === "" ? null : text;
}

/**
 * The photo field carries a path the client got from the picker or from an
 * upload, so it is untrusted like any other form value: the store re-checks the
 * shape and that the file is really there. Empty means "no photo".
 */
async function parsePhoto(
  formData: FormData,
  field = "poza",
): Promise<{ ok: true; photo: string | null } | { ok: false }> {
  const value = String(formData.get(field) ?? "").trim();
  if (value === "") return { ok: true, photo: null };

  return (await getImageStore().has(value))
    ? { ok: true, photo: value }
    : { ok: false };
}

/** A product carries either an exact price or a "de la" price, never both. */
function parsePrice(
  formData: FormData,
): { ok: true; price: number | null; priceFrom: number | null } | { ok: false } {
  const mode = String(formData.get("tipPret") ?? "fara");
  const amount = parseAmount(formData.get("pret"));
  if (!amount.ok) return { ok: false };

  if (amount.value === null || mode === "fara") {
    return { ok: true, price: null, priceFrom: null };
  }
  return mode === "dela"
    ? { ok: true, price: null, priceFrom: amount.value }
    : { ok: true, price: amount.value, priceFrom: null };
}

/** null = every cafe. An explicit list must contain at least one real slug. */
function parseLocations(
  formData: FormData,
  known: Set<string>,
): { ok: true; locations: string[] | null } | { ok: false } {
  if (formData.get("toateLocatiile") !== null) {
    return { ok: true, locations: null };
  }
  const picked = formData
    .getAll("locatii")
    .map(String)
    .filter((slug) => known.has(slug));

  return picked.length === 0 ? { ok: false } : { ok: true, locations: picked };
}

function parseHours(
  formData: FormData,
  current: I18nText | null,
): I18nText | null {
  const ro = parseText(formData.get("orarRo"));
  if (!ro) return null;
  const hu = parseText(formData.get("orarHu"));
  // The staff form edits RO+HU only. While the text is unchanged, keep the
  // stored value so its EN translation survives; once it changes, EN is
  // stale — drop it and let the public UI fall back to RO.
  if (current && current.ro === ro && current.hu === (hu ?? undefined)) {
    return current;
  }
  return hu ? { ro, hu } : { ro };
}

/* ------------------------------------------------------------- poze --- */

export type UploadState =
  | { ok: true; path: string }
  | { ok: false; text: string }
  | null;

/**
 * Upload happens on its own, before the row is saved: the manager picks a
 * photo, sees it in the preview, then still has to press Salvează. A file that
 * is uploaded but never attached costs one orphaned image and nothing else.
 */
export async function uploadPhotoAction(
  _prev: UploadState,
  formData: FormData,
): Promise<UploadState> {
  const auth = await managerSession();
  if ("error" in auth) return { ok: false, text: auth.error };

  const file = formData.get("fisier");
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, text: strings.photoMissing };
  }
  // Cheap checks before pulling megabytes into memory.
  if (!ACCEPTED_IMAGE_MIMES.includes(file.type)) {
    return { ok: false, text: strings.photoType };
  }
  if (file.size > MAX_IMAGE_BYTES) {
    return { ok: false, text: strings.photoTooLarge };
  }

  const saved = await getImageStore().save({
    bytes: new Uint8Array(await file.arrayBuffer()),
    filename: file.name,
    mime: file.type,
  });

  if (saved.status === "unsupported_type") {
    return { ok: false, text: strings.photoType };
  }
  if (saved.status === "too_large") {
    return { ok: false, text: strings.photoTooLarge };
  }

  return { ok: true, path: saved.path };
}

/* --------------------------------------------------------- categorii --- */

export async function saveCategoryAction(
  _prev: SaveState,
  formData: FormData,
): Promise<SaveState> {
  const auth = await managerSession();
  if ("error" in auth) return fail(auth.error);

  const db = getDb();
  const slug = String(formData.get("slug") ?? "");
  const categories = await db.listCategories();
  if (!categories.some((category) => category.slug === slug)) {
    return fail(strings.categoryMissingRow);
  }

  const photo = await parsePhoto(formData);
  if (!photo.ok) return fail(strings.photoUnknown);

  const saved = await db.updateCategory(slug, { photo: photo.photo });
  if (!saved) return fail(strings.categoryMissingRow);

  revalidatePath("/", "layout");
  return { ok: true, text: strings.categorySaved };
}

/* ----------------------------------------------------------- products --- */

export async function saveProductAction(
  _prev: SaveState,
  formData: FormData,
): Promise<SaveState> {
  const auth = await managerSession();
  if ("error" in auth) return fail(auth.error);

  const db = getDb();
  const products = await db.listAdminProducts();
  const product = products.find(
    (p) => p.id === String(formData.get("productId") ?? ""),
  );
  if (!product) return fail(strings.productMissing);

  const ro = parseText(formData.get("numeRo"));
  if (!ro) return fail(strings.nameMissing);
  const hu = parseText(formData.get("numeHu"));
  const descriptionRo = parseText(formData.get("descriereRo"));
  const descriptionHu = parseText(formData.get("descriereHu"));

  const categorySlug = String(formData.get("categorie") ?? "");
  const categories = await db.listCategories();
  if (!categories.some((category) => category.slug === categorySlug)) {
    return fail(strings.categoryMissing);
  }

  const price = parsePrice(formData);
  if (!price.ok) return fail(strings.badPrice);

  const allLocations = await db.listLocations();
  const where = parseLocations(
    formData,
    new Set(allLocations.map((l) => l.slug)),
  );
  if (!where.ok) return fail(strings.noLocations);

  const photo = await parsePhoto(formData);
  if (!photo.ok) return fail(strings.photoUnknown);

  const active = formData.get("active") !== null;
  // A hidden product cannot be the public seasonal hero.
  const seasonal = active && formData.get("seasonal") !== null;
  // The form intentionally edits RO/HU only. Preserve the verified EN copy
  // when those fields did not change; otherwise drop the now-stale EN value
  // and let the public UI fall back to RO.
  const name =
    product.name.ro === ro && (product.name.hu ?? null) === hu
      ? product.name
      : hu
        ? { ro, hu }
        : { ro };
  const description =
    (product.description?.ro ?? null) === descriptionRo &&
    (product.description?.hu ?? null) === descriptionHu
      ? product.description
      : descriptionRo
        ? descriptionHu
          ? { ro: descriptionRo, hu: descriptionHu }
          : { ro: descriptionRo }
        : null;

  const saved = await db.updateProduct(product.id, {
    categorySlug,
    name,
    description,
    price: price.price,
    priceFrom: price.priceFrom,
    locations: where.locations,
    alcohol: formData.get("alcool") !== null,
    active,
    photo: photo.photo,
  });
  if (!saved) return fail(strings.productMissing);

  const seasonalSaved = await db.setSeasonalProduct(product.id, seasonal);
  if (!seasonalSaved) return fail(strings.productMissing);

  revalidatePath("/", "layout");
  return { ok: true, text: strings.productSaved };
}

export async function createProductAction(
  _prev: SaveState,
  formData: FormData,
): Promise<SaveState> {
  const auth = await managerSession();
  if ("error" in auth) return fail(auth.error);

  const db = getDb();

  const ro = parseText(formData.get("numeRo"));
  if (!ro) return fail(strings.nameMissing);
  const hu = parseText(formData.get("numeHu"));
  const descriptionRo = parseText(formData.get("descriereRo"));
  const descriptionHu = parseText(formData.get("descriereHu"));

  const categorySlug = String(formData.get("categorie") ?? "");
  const categories = await db.listCategories();
  if (!categories.some((c) => c.slug === categorySlug)) {
    return fail(strings.categoryMissing);
  }

  const price = parsePrice(formData);
  if (!price.ok) return fail(strings.badPrice);

  const allLocations = await db.listLocations();
  const where = parseLocations(
    formData,
    new Set(allLocations.map((l) => l.slug)),
  );
  if (!where.ok) return fail(strings.noLocations);

  const photo = await parsePhoto(formData);
  if (!photo.ok) return fail(strings.photoUnknown);

  await db.createProduct({
    categorySlug,
    name: hu ? { ro, hu } : { ro },
    description: descriptionRo
      ? descriptionHu
        ? { ro: descriptionRo, hu: descriptionHu }
        : { ro: descriptionRo }
      : null,
    price: price.price,
    priceFrom: price.priceFrom,
    locations: where.locations,
    alcohol: formData.get("alcool") !== null,
    photo: photo.photo,
  });

  revalidatePath("/", "layout");
  return { ok: true, text: strings.productAdded };
}

/* ---------------------------------------------------------- cafenele --- */

export async function saveLocationAction(
  _prev: SaveState,
  formData: FormData,
): Promise<SaveState> {
  const auth = await managerSession();
  if ("error" in auth) return fail(auth.error);

  const db = getDb();
  const slug = String(formData.get("slug") ?? "");
  const location = (await db.listLocations()).find((l) => l.slug === slug);
  if (!location) return fail(strings.locationMissing);

  const wolt = parseText(formData.get("wolt"));
  if (wolt && !/^https:\/\/\S+$/.test(wolt)) return fail(strings.badWolt);

  const alcohol = String(formData.get("alcool") ?? "neconfirmat");
  const servesAlcohol =
    alcohol === "da" ? true : alcohol === "nu" ? false : null;

  const rating = parseAmount(formData.get("rating"), { max: 5 });
  if (!rating.ok) return fail(strings.badRating);

  const reviews = parseAmount(formData.get("recenzii"), {
    integer: true,
    allowZero: true,
  });
  if (!reviews.ok) return fail(strings.badReviews);

  const photo = await parsePhoto(formData);
  const heroPhoto = await parsePhoto(formData, "pozaHero");
  if (!photo.ok || !heroPhoto.ok) return fail(strings.photoUnknown);

  const googlePlaceId = parseText(formData.get("googlePlaceId"));
  if (googlePlaceId && !/^[A-Za-z0-9_-]{10,200}$/.test(googlePlaceId)) {
    return fail(strings.badPlaceId);
  }

  const saved = await db.updateLocation(slug, {
    hours: parseHours(formData, location.hours),
    woltUrl: wolt,
    servesAlcohol,
    googleRating: rating.value,
    googleReviewCount: reviews.value,
    googlePlaceId,
    reviewUrl: googlePlaceId
      ? `https://search.google.com/local/writereview?placeid=${encodeURIComponent(googlePlaceId)}`
      : null,
    comingSoon: formData.get("deschisa") === null,
    photo: photo.photo,
    heroPhoto: heroPhoto.photo,
  });
  if (!saved) return fail(strings.locationMissing);

  revalidatePath("/", "layout");
  return { ok: true, text: strings.locationSaved };
}

export async function createLocationAction(
  _prev: SaveState,
  formData: FormData,
): Promise<SaveState> {
  const auth = await managerSession();
  if ("error" in auth) return fail(auth.error);

  const name = parseText(formData.get("numeCafenea"));
  if (!name) return fail(strings.locationNameMissing);

  // New cafenele start hidden; "Deschisă publicului" flips it later.
  const comingSoon = formData.get("deschisa") === null;

  const result = await getDb().createLocation({
    name,
    addressRo: parseText(formData.get("adresa")),
    hoursRo: parseText(formData.get("orarRo")),
    hoursHu: parseText(formData.get("orarHu")),
    comingSoon,
  });

  if (result.status === "invalid_name") return fail(strings.locationNameMissing);
  if (result.status === "name_exists") return fail(strings.locationExists);

  // A new cafenea comes with fresh barista codes; the Jurnal records the
  // cafenea only — the codes exist exactly once, in the notice below.
  await recordAdminAudit(auth.session, {
    action: "cafenea.creare",
    target: result.location.slug,
    summary: `A adăugat cafeneaua ${result.location.name}${comingSoon ? " (în curând)" : ""}.`,
  });

  revalidatePath("/", "layout");
  const pins = strings.locationAdded(
    result.staffPins.map((p) => `${p.name}: ${p.pin}`).join(", "),
  );
  return { ok: true, text: comingSoon ? pins + strings.locationHidden : pins };
}
