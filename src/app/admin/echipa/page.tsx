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
  const scanning = new Map(stats.baristas.map((barista) => [barista.staffId, barista]));

  // Grouped by home cafenea, because that is where a person belongs. Where
  // they can actually start a shift is `locationSlugs` on the row, and the
  // two differ for anybody covering shifts elsewhere.
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
        stamps30d: scanning.get(person.id)?.stamps30d ?? null,
        locationSlug: person.locationSlug,
        locationSlugs: person.locationSlugs,
        stampsByLocation: scanning.get(person.id)?.byLocation ?? [],
      })),
    // Whoever can start a shift here but is filed somewhere else. Listed as
    // a line, not as rows: their buttons belong on their own row, under
    // their own cafenea, so there is one place to rename or deactivate them.
    visitors: staff
      .filter(
        (person) =>
          person.locationSlug !== item.slug &&
          person.locationSlugs.includes(item.slug),
      )
      .map((person) => ({
        name: person.name,
        from:
          locations.find((l) => l.slug === person.locationSlug)?.name ??
          person.locationSlug,
      })),
  }));

  return (
    <PhoneFrame>
      <AdminBar
        locationName={location?.name ?? session.locationSlug}
        role={session.role}
      />
      <TeamAdmin
        groups={groups}
        locations={locations.map(({ slug, name }) => ({ slug, name }))}
      />
    </PhoneFrame>
  );
}
