import type { Metadata } from "next";
import { redirect } from "next/navigation";
import AdminBar from "@/components/admin/AdminBar";
import PhoneFrame from "@/components/PhoneFrame";
import { readStaffSession } from "@/lib/admin/session";
import { getDb } from "@/lib/db";
import { CONTEST_LOCATIONS, contestLocationForStaff } from "@/lib/drawing";
import DrawingCounterForm from "./DrawingCounterForm";

export const metadata: Metadata = {
  title: "Înscriere desen · Origins",
  robots: { index: false, follow: false },
};

/** Any logged-in staff: the parent is at the counter, the barista types. */
export default async function DesenNouPage() {
  const session = await readStaffSession();
  if (!session) redirect("/admin");

  const location = await getDb().getLocationBySlug(session.locationSlug);

  return (
    <PhoneFrame>
      <AdminBar
        locationName={location?.name ?? session.locationSlug}
        role={session.role}
      />
      <DrawingCounterForm
        locations={CONTEST_LOCATIONS.map(({ slug, name }) => ({ slug, name }))}
        defaultLocation={contestLocationForStaff(session.locationSlug)}
      />
    </PhoneFrame>
  );
}
