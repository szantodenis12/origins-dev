import assert from "node:assert/strict";
import test from "node:test";

// Photo rules for the menu editor. `lib/images.ts` is deliberately free of fs
// and React so it runs here under plain Node; the store adapter is exercised
// through the same memory db the rest of the admin tests use.
import {
  imageExtension,
  isPhotoPath,
  photoLabel,
  photoSlug,
  uploadFilename,
} from "../src/lib/images.ts";
import { createMemoryDb } from "../src/lib/db/memory.ts";

const db = createMemoryDb();

test("only real image types are accepted", () => {
  assert.equal(imageExtension("image/jpeg"), "jpg");
  assert.equal(imageExtension("image/png"), "png");
  assert.equal(imageExtension("image/webp"), "webp");

  // An SVG is a script container, a HEIC is not renderable by next/image.
  assert.equal(imageExtension("image/svg+xml"), null);
  assert.equal(imageExtension("image/heic"), null);
  assert.equal(imageExtension("application/pdf"), null);
  assert.equal(imageExtension(""), null);
});

test("uploaded files get a readable, collision-free name", () => {
  assert.equal(
    uploadFilename("Cafea de vară.JPG", "image/jpeg", "9f3a1c2b"),
    "cafea-de-vara-9f3a1c2b.jpg",
  );
  // Nothing usable in the name: still a file, never an empty one.
  assert.equal(uploadFilename("!!!.png", "image/png", "0011aabb"), "poza-0011aabb.png");
  assert.equal(uploadFilename("x.jpg", "image/svg+xml", "0011aabb"), null);

  // Two uploads of the same photo must not overwrite each other.
  assert.notEqual(
    uploadFilename("latte.webp", "image/webp", "aaaaaaaa"),
    uploadFilename("latte.webp", "image/webp", "bbbbbbbb"),
  );
});

test("photoSlug strips diacritics and punctuation", () => {
  assert.equal(photoSlug("Piadină cu șuncă.webp"), "piadina-cu-sunca");
  assert.equal(photoSlug("   "), "");
});

test("the photo field only accepts paths this app produces", () => {
  assert.ok(isPhotoPath("/photos/p-espresso.webp"));
  assert.ok(isPhotoPath("/photos/uploads/latte-9f3a1c2b.jpg"));

  // Everything a crafted form POST could try instead.
  assert.ok(!isPhotoPath("/photos/../../.env"));
  assert.ok(!isPhotoPath("/photos/uploads/../secret.webp"));
  assert.ok(!isPhotoPath("https://evil.example/tracker.png"));
  assert.ok(!isPhotoPath("//evil.example/tracker.png"));
  assert.ok(!isPhotoPath("javascript:alert(1)"));
  assert.ok(!isPhotoPath("/brand/logo.svg"));
  assert.ok(!isPhotoPath("/photos/note.txt"));
  assert.ok(!isPhotoPath(""));
});

test("photoLabel drops the upload token", () => {
  assert.equal(photoLabel("/photos/uploads/latte-9f3a1c2b.jpg"), "latte");
  assert.equal(photoLabel("/photos/p-espresso.webp"), "p-espresso");
});

test("products, categories and locations keep or clear their photo", async () => {
  const product = await db.updateProduct("espresso", {
    photo: "/photos/uploads/test-espresso.webp",
  });
  assert.equal(product.photo, "/photos/uploads/test-espresso.webp");

  // Clearing deletes the key: "no photo" is undefined everywhere in the UI,
  // never a null the public components would have to guard separately.
  const cleared = await db.updateProduct("espresso", { photo: null });
  assert.equal("photo" in cleared, false);

  // A patch without the field leaves the photo alone.
  await db.updateProduct("espresso", { photo: "/photos/p-espresso.webp" });
  const untouched = await db.updateProduct("espresso", { price: 9.5 });
  assert.equal(untouched.photo, "/photos/p-espresso.webp");

  const category = await db.updateCategory("cafea", {
    photo: "/photos/uploads/test-cafea.webp",
  });
  assert.equal(category.photo, "/photos/uploads/test-cafea.webp");
  await db.updateCategory("cafea", { photo: "/photos/cat-cafea.webp" });
  assert.equal(await db.updateCategory("nu-exista", {}), null);

  // The two location photos are independent slots.
  const location = await db.updateLocation("gara", {
    photo: "/photos/uploads/test-gara.webp",
    heroPhoto: "/photos/uploads/test-gara-hero.webp",
  });
  assert.equal(location.photo, "/photos/uploads/test-gara.webp");
  assert.equal(location.heroPhoto, "/photos/uploads/test-gara-hero.webp");

  const withoutHero = await db.updateLocation("gara", { heroPhoto: null });
  assert.equal("heroPhoto" in withoutHero, false);
  assert.equal(withoutHero.photo, "/photos/uploads/test-gara.webp");

  await db.updateLocation("gara", {
    photo: "/photos/loc-gara.webp",
    heroPhoto: "/photos/hero-cafea.webp",
  });
});

test("a new product can be created with a photo, or without one", async () => {
  const withPhoto = await db.createProduct({
    categorySlug: "cafea",
    name: { ro: "Test cu poză" },
    photo: "/photos/uploads/test-nou.webp",
  });
  assert.equal(withPhoto.photo, "/photos/uploads/test-nou.webp");

  const withoutPhoto = await db.createProduct({
    categorySlug: "cafea",
    name: { ro: "Test fără poză" },
  });
  assert.equal("photo" in withoutPhoto, false);

  await db.updateProduct(withPhoto.id, { active: false });
  await db.updateProduct(withoutPhoto.id, { active: false });
});
