import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import AdminBar from "@/components/admin/AdminBar";
import PhoneFrame from "@/components/PhoneFrame";
import { readStaffSession } from "@/lib/admin/session";
import { getDb } from "@/lib/db";
import {
  contestLocation,
  contestLocationForStaff,
  drawingIsLive,
  drawingPublishBlock,
} from "@/lib/drawing";
import { votingOpen } from "@/lib/drawing-vote";
import DrawingPhoto from "./DrawingPhoto";

export const metadata: Metadata = {
  title: "Fotografia desenului · Origins",
  robots: { index: false, follow: false },
};

/**
 * One drawing, for the phone at the counter: take the photo, straighten
 * and crop it, publish. Any logged-in staff; a barista only for the
 * drawings of their own café. No parent name and no phone here either.
 */
export default async function DesenAdminPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await readStaffSession();
  if (!session) redirect("/admin");

  const db = getDb();
  const [cafenea, entry] = await Promise.all([
    db.getLocationBySlug(session.locationSlug),
    db.getDrawingEntry((await params).id),
  ]);
  if (!entry) notFound();

  const manager = session.role === "manager";
  if (!manager && contestLocationForStaff(session.locationSlug) !== entry.location) {
    redirect("/admin/desene");
  }

  return (
    <PhoneFrame>
      <AdminBar locationName={cafenea?.name ?? session.locationSlug} role={session.role} />
      <DrawingPhoto
        manager={manager}
        votingOpen={votingOpen()}
        entry={{
          id: entry.id,
          code: entry.code,
          childFirstName: entry.childFirstName,
          childAge: entry.childAge,
          category: entry.category,
          locationName: contestLocation(entry.location).name,
          status: entry.status,
          consentGallery: entry.consentGallery,
          consentReproduction: entry.consentReproduction,
          attribution: entry.attribution,
          imageWeb: entry.imageWeb,
          imageWidth: entry.imageWidth,
          imageHeight: entry.imageHeight,
          hasOriginal: entry.imageOriginal !== null,
          live: drawingIsLive(entry),
          publishedAt: entry.publishedAt,
          // What publishing would say once a photo exists.
          publishBlock: drawingPublishBlock({ ...entry, imageWeb: entry.imageWeb ?? "x" }),
        }}
      />
    </PhoneFrame>
  );
}
