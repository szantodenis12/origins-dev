import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import CampaignPhoto from "@/components/campaign-admin/CampaignPhoto";
import Shell from "@/components/campaign-admin/Shell";
import { readCampaignRole } from "@/lib/admin/drawing-access";
import { getDb } from "@/lib/db";
import {
  contestLocation,
  drawingIsLive,
  drawingPublishBlock,
} from "@/lib/drawing";

export const metadata: Metadata = {
  title: "Fotografia desenului · Panoul desenelor",
  robots: { index: false, follow: false },
};

/** One drawing at the counter: photo, straighten, crop, publish. */
export default async function CampaignDrawingPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const role = await readCampaignRole();
  if (!role) redirect("/admin");

  const entry = await getDb().getDrawingEntry((await params).id);
  if (!entry) notFound();

  return (
    <Shell role={role} active={null}>
      {/* Wider than a form, narrower than the list: the crop is judged by
          eye, so the photo wants room, but it is still one thing at a time. */}
      <div className="mx-auto w-full max-w-[900px]">
        <CampaignPhoto
          manager={role === "manager"}
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
            publishBlock: drawingPublishBlock({
              ...entry,
              imageWeb: entry.imageWeb ?? "x",
            }),
          }}
        />
      </div>
    </Shell>
  );
}
