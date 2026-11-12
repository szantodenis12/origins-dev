"use client";

import Image from "next/image";
import Link from "next/link";
import { ArrowLeft, Camera, Check, Download, ExternalLink, EyeOff, Globe, ImageUp, Loader2 } from "lucide-react";
import {
  Editor,
  photoStrings,
  useDrawingPhoto,
  type DrawingPhotoEntry,
  type EditorSkin,
} from "@/app/admin/desene/[id]/DrawingPhoto";
import { formatBucharestDate } from "@/app/admin/push/shared";
import { Notice } from "./Rows";
import { BTN_GREEN, BTN_PRIMARY, BTN_QUIET, CHIP, NOTE, STATUS_LABEL } from "./ui";

/**
 * The counter screen of the campaign panel: camera first, then rotate, crop
 * and publish. All of what it does is `useDrawingPhoto` and `Editor` from
 * the Origins admin's photo screen; only the look and the addresses are
 * its own, so the two screens cannot disagree about what a save means.
 */

const SKIN: EditorSkin = {
  iconButton:
    "flex size-[52px] items-center justify-center rounded-full border border-o-ink/20 bg-white text-o-ink disabled:opacity-50",
  stage: "mt-3 rounded-3xl bg-o-ink p-5",
  primary: BTN_GREEN,
  secondary: BTN_QUIET,
  cancel:
    "flex min-h-[48px] w-full items-center justify-center gap-2 text-[15px] font-semibold text-o-ink/60 disabled:opacity-50",
  title: "text-[17px] font-bold",
  hint: "mt-0.5 text-[14px] text-o-ink/60",
};

export default function CampaignPhoto({
  entry,
  manager,
}: {
  entry: DrawingPhotoEntry;
  manager: boolean;
}) {
  const photo = useDrawingPhoto(entry, `/admin/${entry.id}/imagine`);
  const canPublishAfterSave = entry.publishBlock === null;
  const fileButton = "cursor-pointer";

  return (
    <div className="flex flex-col gap-4">
      <Link
        href="/admin"
        className="inline-flex min-h-[44px] items-center gap-2 self-start text-[15px] font-semibold text-o-ink/65"
      >
        <ArrowLeft className="size-[18px]" strokeWidth={1.75} />
        Toate desenele
      </Link>

      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-[44px] leading-none font-extrabold tracking-[-0.02em] tabular-nums">
            {entry.code}
          </h1>
          <p className="mt-2 text-[17px] font-semibold">
            {entry.childFirstName}, {entry.childAge} ani
            {entry.attribution === "none" && (
              <span className="font-normal text-o-ink/55"> · {photoStrings.noName}</span>
            )}
          </p>
          <p className="mt-0.5 text-[14.5px] text-o-ink/60">
            {entry.category.replace("-", "–")} ani · {entry.locationName}
          </p>
        </div>
        <span className={`${CHIP} !min-h-[36px] bg-o-wall !px-3.5 !text-[13px]`}>
          {STATUS_LABEL[entry.status]}
        </span>
      </div>

      {photo.picked ? (
        <Editor
          source={photo.picked.source}
          busy={photo.busy}
          canPublish={canPublishAfterSave}
          onCancel={photo.close}
          onSave={photo.save}
          skin={SKIN}
        />
      ) : (
        <>
          {/* The camera is the first thing under the name: one thumb, one tap. */}
          <label className={`${BTN_PRIMARY} ${fileButton} !min-h-[68px] !text-[18px]`}>
            <Camera className="size-[24px]" strokeWidth={1.75} />
            {entry.imageWeb ? "Fotografiază din nou" : "Fotografiază desenul"}
            <input
              type="file"
              accept="image/*"
              capture="environment"
              onChange={photo.choose}
              data-input="camera"
              className="sr-only"
            />
          </label>
          <label className={`${BTN_QUIET} ${fileButton}`}>
            <ImageUp className="size-[20px]" strokeWidth={1.75} />
            Alege din telefon
            <input
              type="file"
              accept="image/*"
              onChange={photo.choose}
              data-input="library"
              className="sr-only"
            />
          </label>
          {!entry.imageWeb && <p className="text-[14px] text-o-ink/60">{photoStrings.tips}</p>}
        </>
      )}

      <Notice state={photo.notice} />

      {!entry.consentGallery && <p className={NOTE}>{photoStrings.noConsent}</p>}
      {entry.consentGallery && !entry.consentReproduction && (
        <p className={NOTE}>{photoStrings.noReproduction}</p>
      )}

      {entry.status === "inregistrat" && !photo.picked && (
        <form action={photo.statusAction} className="flex flex-col gap-3 rounded-3xl border border-o-ink/12 p-4">
          <p className="text-[14.5px] leading-[1.5] text-o-ink/85">{photoStrings.handInFirst}</p>
          <input type="hidden" name="entryId" value={entry.id} />
          <input type="hidden" name="status" value="depus" />
          <button type="submit" disabled={photo.statusPending} className={BTN_QUIET}>
            {photo.statusPending ? (
              <Loader2 className="size-[18px] animate-spin" strokeWidth={2} />
            ) : (
              <Check className="size-[18px]" strokeWidth={2} />
            )}
            {photoStrings.markHandedIn}
          </button>
        </form>
      )}
      <Notice state={photo.statusState} />

      {!photo.picked && entry.imageWeb && (
        <section className="flex flex-col gap-3 border-t border-o-ink/10 pt-4">
          <div className="overflow-hidden rounded-3xl bg-o-wall p-3">
            <Image
              src={entry.imageWeb}
              alt={entry.code}
              width={entry.imageWidth ?? 4}
              height={entry.imageHeight ?? 3}
              sizes="(min-width: 720px) 660px, 100vw"
              className="h-auto w-full rounded-xl"
            />
          </div>

          <p className="flex items-center gap-2 text-[15px] font-semibold">
            {entry.live ? (
              <Globe className="size-[17px] text-o-green" strokeWidth={2} />
            ) : (
              <EyeOff className="size-[17px] text-o-ink/45" strokeWidth={2} />
            )}
            {entry.live
              ? `${photoStrings.liveSince} ${formatBucharestDate(entry.publishedAt!)}`
              : entry.publishedAt
                ? `${photoStrings.wasLive} ${formatBucharestDate(entry.publishedAt)}.`
                : photoStrings.notLive}
          </p>

          {entry.live ? (
            <>
              <a href={`/${entry.code}`} target="_blank" rel="noopener noreferrer" className={BTN_QUIET}>
                <ExternalLink className="size-[18px]" strokeWidth={1.75} />
                {photoStrings.openPublic}
              </a>
              <form action={photo.unpublishAction}>
                <input type="hidden" name="entryId" value={entry.id} />
                <button type="submit" disabled={photo.unpublishPending} className={BTN_QUIET}>
                  {photo.unpublishPending ? (
                    <Loader2 className="size-[18px] animate-spin" strokeWidth={2} />
                  ) : (
                    <EyeOff className="size-[18px]" strokeWidth={1.75} />
                  )}
                  {photoStrings.unpublish}
                </button>
              </form>
            </>
          ) : (
            entry.consentGallery && (
              <form action={photo.publishAction}>
                <input type="hidden" name="entryId" value={entry.id} />
                <button type="submit" disabled={photo.publishPending} className={BTN_GREEN}>
                  {photo.publishPending ? (
                    <Loader2 className="size-[19px] animate-spin" strokeWidth={2} />
                  ) : (
                    <Globe className="size-[19px]" strokeWidth={1.75} />
                  )}
                  {photoStrings.publish}
                </button>
              </form>
            )
          )}
          <Notice state={photo.publishState} />
          <Notice state={photo.unpublishState} />

          {manager && entry.hasOriginal && (
            <form method="post" action={`/admin/${entry.id}/original`}>
              <button type="submit" className={BTN_QUIET}>
                <Download className="size-[18px]" strokeWidth={1.75} />
                {photoStrings.original}
              </button>
            </form>
          )}
        </section>
      )}
    </div>
  );
}
