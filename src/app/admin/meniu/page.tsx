import type { Metadata } from "next";
import { redirect } from "next/navigation";
import AdminBar from "@/components/admin/AdminBar";
import PhoneFrame from "@/components/PhoneFrame";
import MenuAdmin from "./MenuAdmin";
import { readStaffSession } from "@/lib/admin/session";
import { getDb } from "@/lib/db";
import { getImageStore } from "@/lib/storage";

export const metadata: Metadata = {
  title: "Meniu Origins",
  robots: { index: false, follow: false },
};

export default async function MenuPage() {
  const session = await readStaffSession();
  if (!session) redirect("/admin");
  if (session.role !== "manager") redirect("/admin/scan");

  const db = getDb();
  const [location, categories, products, locations, images] = await Promise.all([
    db.getLocationBySlug(session.locationSlug),
    db.listCategories(),
    db.listAdminProducts(),
    db.listLocations(),
    // One read for the whole screen: every photo field offers the same library.
    getImageStore().list(),
  ]);

  return (
    <PhoneFrame>
      <AdminBar
        locationName={location?.name ?? session.locationSlug}
        role={session.role}
      />
      <MenuAdmin
        categories={categories}
        products={products}
        locations={locations}
        library={images.map((image) => image.path)}
      />
    </PhoneFrame>
  );
}
