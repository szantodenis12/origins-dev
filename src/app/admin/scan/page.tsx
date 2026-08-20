import type { Metadata } from "next";
import { redirect } from "next/navigation";
import AdminBar from "@/components/admin/AdminBar";
import PhoneFrame from "@/components/PhoneFrame";
import ScanView from "@/components/admin/ScanView";
import { readStaffSession } from "@/lib/admin/session";
import { getDb } from "@/lib/db";

export const metadata: Metadata = {
  title: "Scanare card Origins",
  robots: { index: false, follow: false },
};

export default async function ScanPage() {
  const session = await readStaffSession();
  if (!session) redirect("/admin");

  const location = await getDb().getLocationBySlug(session.locationSlug);

  return (
    <PhoneFrame>
      <AdminBar
        locationName={location?.name ?? session.locationSlug}
        role={session.role}
      />
      {/* The card-control actions (blocare, cod QR nou) are manager-only;
          the server re-checks the role, this flag only decides what shows. */}
      <ScanView manager={session.role === "manager"} />
    </PhoneFrame>
  );
}
