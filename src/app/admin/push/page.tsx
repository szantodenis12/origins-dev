import type { Metadata } from "next";
import { redirect } from "next/navigation";
import AdminBar from "@/components/admin/AdminBar";
import PhoneFrame from "@/components/PhoneFrame";
import PushComposer from "./PushComposer";
import { readStaffSession } from "@/lib/admin/session";
import { getDb } from "@/lib/db";

export const metadata: Metadata = {
  title: "Mesaje Origins",
  robots: { index: false, follow: false },
};

export default async function PushPage() {
  const session = await readStaffSession();
  if (!session) redirect("/admin");
  if (session.role !== "manager") redirect("/admin/scan");

  const [location, campaigns] = await Promise.all([
    getDb().getLocationBySlug(session.locationSlug),
    getDb().listPushCampaigns(),
  ]);

  return (
    <PhoneFrame>
      <AdminBar
        locationName={location?.name ?? session.locationSlug}
        role={session.role}
      />
      <PushComposer initialCampaigns={campaigns} />
    </PhoneFrame>
  );
}
