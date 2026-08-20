import type { Metadata } from "next";
import { redirect } from "next/navigation";
import AdminBar from "@/components/admin/AdminBar";
import PhoneFrame from "@/components/PhoneFrame";
import TeamAdmin, { type TeamGroup } from "./TeamAdmin";
import { readStaffSession } from "@/lib/admin/session";
import { getDb } from "@/lib/db";

export const metadata: Metadata = {
  title: "Echipă Origins",
  robots: { index: false, follow: false },
};

export default async function EchipaPage() {
  const session = await readStaffSession();
  if (!session) redirect("/admin");
  if (session.role !== "manager") redirect("/admin/scan");

  const db = getDb();
  const [location, staff, locations, stats] = await Promise.all([
    db.getLocationBySlug(session.locationSlug),
    db.listStaff(),
    db.listLocations(),
    db.getStats(),
  ]);

  // Scanning activity already lives in the stats: reuse it, don't recompute.
  const stamps30d = new Map(
    stats.baristas.map((barista) => [barista.staffId, barista.stamps30d]),
  );

  const groups: TeamGroup[] = locations.map((item) => ({
    slug: item.slug,
    name: item.name,
    members: staff
      .filter((person) => person.locationSlug === item.slug)
      .map((person) => ({
        id: person.id,
        name: person.name,
        role: person.role,
        active: person.active,
        shared: person.shared,
        stamps30d: stamps30d.get(person.id) ?? null,
      })),
  }));

  return (
    <PhoneFrame>
      <AdminBar
        locationName={location?.name ?? session.locationSlug}
        role={session.role}
      />
      <TeamAdmin groups={groups} />
    </PhoneFrame>
  );
}
