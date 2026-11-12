"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  Camera,
  Check,
  Download,
  ExternalLink,
  EyeOff,
  Globe,
  ImageUp,
  Loader2,
  RotateCcw,
  RotateCw,
  TriangleAlert,
  X,
} from "lucide-react";
import {
  publishDrawingAction,
  setDrawingStatusAction,
  unpublishDrawingAction,
  type DrawingAdminState,
} from "../actions";
import { formatBucharestDate } from "../../push/shared";
import type { DrawingAttribution, DrawingStatus, PublishBlock } from "@/lib/drawing";
import { makeCupMockup } from "@/lib/drawing-cup";
import { fitWithin, WEB_MAX_SIDE } from "@/lib/drawing-image";

/**
 * The 30-second screen: photo from the phone camera, two rotate buttons, a
 * crop frame with four corners, one button that saves and publishes.
 *
 * All image work happens here, in the browser: the canvas produces the
 * gallery JPEG (<= 1600 px) and the cup mockup for link previews
 * (lib/drawing-cup.ts). The untouched camera file is uploaded next to
 * them. The server re-checks every file (admin/desene/[id]/imagine).
 */

/** Staff screen: Romanian only. */
const strings = {
  back: "Înapoi la listă",
  eyebrow: "Origins · concurs de desene",
  years: "ani",
  noName: "fără prenume în public",
  status: {
    inregistrat: "Înregistrat",
    depus: "Depus",
    expus: "Expus",
    selectat: "Selectat",
    returnat: "Returnat",
  } satisfies Record<DrawingStatus, string>,
  markHandedIn: "Marchează depus",
  handInFirst:
    "Desenul e doar înregistrat. Marchează-l ca depus când foaia e la cafenea; abia apoi se poate publica.",
  noConsent:
    "Părintele nu a dat acordul pentru galeria online. Poți salva fotografia pentru juriu și tipar, dar desenul nu se publică.",
  noReproduction: "Fără acord de reproducere: poate fi în galerie, dar nu pe pahar.",
  photoTitle: "Fotografia desenului",
  noPhoto: "Încă nu are fotografie.",
  take: "Fă o poză",
  pick: "Alege din telefon",
  retake: "Altă poză",
  tips: "Foaia întreagă în cadru, lumină bună, fără umbra telefonului.",
  editTitle: "Îndreaptă și decupează",
  editHint: "Trage de colțuri până rămâne doar desenul.",
  rotateLeft: "Rotește la stânga",
  rotateRight: "Rotește la dreapta",
  cancel: "Renunță",
  saveAndPublish: "Salvează și publică în galerie",
  saveOnly: "Salvează fotografia",
  saveOnlyAlt: "Salvează fără să publici",
  saving: "Se încarcă...",
  publish: "Publică în galerie",
  unpublish: "Retrage din galerie",
  liveSince: "Online din",
  notLive: "Nu e în galerie.",
  wasLive: "A fost retras din galerie. Publicat prima dată pe",
  openPublic: "Vezi pagina publică",
  original: "Descarcă originalul",
  unreadable:
    "Nu am putut deschide fotografia. Fă poza din nou sau alege un JPG din telefon.",
  failed: "Nu am putut încărca fotografia. Verifică internetul și încearcă din nou.",
  corner: "Colț de decupare",
  voteClosed: "Votul public s-a încheiat. Desenul rămâne în galerie ca expoziție.",
};

export interface DrawingPhotoEntry {
  id: string;
  code: string;
  childFirstName: string;
  childAge: number;
  category: string;
  locationName: string;
  status: DrawingStatus;
  consentGallery: boolean;
  consentReproduction: boolean;
  attribution: DrawingAttribution;
  imageWeb: string | null;
  imageWidth: number | null;
  imageHeight: number | null;
  hasOriginal: boolean;
  live: boolean;
  publishedAt: string | null;
  /** Why publishing would be refused once a photo exists; null = allowed. */
  publishBlock: PublishBlock | null;
}

type Notice = { ok: boolean; text: string } | null;

function NoticeBox({ notice }: { notice: Notice | DrawingAdminState }) {
  if (!notice) return null;
  return notice.ok ? (
    <div
      role="status"
      className="flex items-start gap-2 rounded-card bg-sage px-3.5 py-2.5 text-[12.5px] font-semibold text-olive"
    >
      <Check className="mt-px size-[15px] shrink-0" strokeWidth={3} />
      <span>{notice.text}</span>
    </div>
  ) : (
    <div
      role="alert"
      className="flex items-start gap-2 rounded-card bg-cream px-3.5 py-2.5 text-[12.5px] font-semibold text-ink"
    >
      <TriangleAlert className="mt-px size-[15px] shrink-0 text-sage-deep" strokeWidth={2} />
      <span>{notice.text}</span>
    </div>
  );
}

/* ---------------------------------------------------------------- editor --- */

/** Crop rectangle in fractions (0..1) of the ROTATED image. */
interface Crop {
  x: number;
  y: number;
  w: number;
  h: number;
}

const FULL: Crop = { x: 0, y: 0, w: 1, h: 1 };
/** The frame never gets smaller than this share of a side. */
const MIN_CROP = 0.15;

type Corner = "nw" | "ne" | "sw" | "se";
type Quarter = 0 | 1 | 2 | 3;

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

/** Size of the source once turned by `quarter` x 90 degrees. */
function rotatedSize(source: ImageBitmap, quarter: Quarter) {
  return quarter % 2 === 0
    ? { width: source.width, height: source.height }
    : { width: source.height, height: source.width };
}

/**
 * Draws `crop` of the rotated source into a canvas `width` x `height`.
 * One function for the on-screen preview (full frame, small) and for the
 * exported file (cropped, up to 1600 px), so what staff see is what is saved.
 */
function drawRotated(
  canvas: HTMLCanvasElement,
  source: ImageBitmap,
  quarter: Quarter,
  crop: Crop,
  width: number,
  height: number,
): void {
  const full = rotatedSize(source, quarter);
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) return;
  // Paper white under transparent PNGs, instead of JPEG black.
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, width, height);

  const scale = width / (crop.w * full.width);
  context.save();
  context.scale(scale, scale);
  context.translate(-crop.x * full.width, -crop.y * full.height);
  context.translate(full.width / 2, full.height / 2);
  context.rotate((quarter * Math.PI) / 2);
  context.imageSmoothingQuality = "high";
  context.drawImage(source, -source.width / 2, -source.height / 2);
  context.restore();
}

function canvasBlob(canvas: HTMLCanvasElement, type: string, quality?: number) {
  return new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality));
}

/** The classes of the editor's own controls; the campaign panel brings its own. */
export interface EditorSkin {
  iconButton: string;
  stage: string;
  primary: string;
  secondary: string;
  cancel: string;
  title: string;
  hint: string;
}

const PLATFORM_SKIN: EditorSkin = {
  iconButton:
    "flex size-11 items-center justify-center rounded-full border border-line bg-paper text-ink disabled:opacity-45",
  stage: "mt-3 rounded-card bg-ink p-5",
  primary:
    "flex w-full items-center justify-center gap-2 rounded-btn bg-ink p-[15px] text-[15px] font-semibold text-paper disabled:opacity-45",
  secondary:
    "flex w-full items-center justify-center gap-2 rounded-btn border border-line bg-paper p-[13px] text-[14px] font-semibold text-ink disabled:opacity-45",
  cancel:
    "flex w-full items-center justify-center gap-1.5 p-2 text-[13px] font-semibold text-muted disabled:opacity-45",
  title: "text-[13.5px] font-semibold text-ink",
  hint: "mt-0.5 text-[12px] text-muted",
};

export function Editor({
  source,
  busy,
  canPublish,
  onCancel,
  onSave,
  skin = PLATFORM_SKIN,
}: {
  source: ImageBitmap;
  busy: boolean;
  canPublish: boolean;
  onCancel: () => void;
  onSave: (quarter: Quarter, crop: Crop, publish: boolean) => void;
  skin?: EditorSkin;
}) {
  const [quarter, setQuarter] = useState<Quarter>(0);
  const [crop, setCrop] = useState<Crop>(FULL);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);

  const full = rotatedSize(source, quarter);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    // The preview is always the whole frame; the crop is drawn on top of it.
    const size = fitWithin(full.width, full.height, 900);
    drawRotated(canvas, source, quarter, FULL, size.width, size.height);
  }, [source, quarter, full.width, full.height]);

  const turn = (by: 1 | 3) => {
    setQuarter((current) => ((current + by) % 4) as Quarter);
    setCrop(FULL);
  };

  /** One corner follows the finger; the opposite corner stays where it is. */
  const dragCorner = (corner: Corner) => (event: React.PointerEvent<HTMLButtonElement>) => {
    const frame = frameRef.current?.getBoundingClientRect();
    if (!frame) return;
    event.preventDefault();
    const handle = event.currentTarget;
    handle.setPointerCapture(event.pointerId);

    const move = (e: PointerEvent) => {
      const px = clamp((e.clientX - frame.left) / frame.width, 0, 1);
      const py = clamp((e.clientY - frame.top) / frame.height, 0, 1);
      setCrop((current) => {
        const right = current.x + current.w;
        const bottom = current.y + current.h;
        const left = corner.endsWith("w") ? Math.min(px, right - MIN_CROP) : current.x;
        const top = corner.startsWith("n") ? Math.min(py, bottom - MIN_CROP) : current.y;
        const newRight = corner.endsWith("e") ? Math.max(px, left + MIN_CROP) : right;
        const newBottom = corner.startsWith("s") ? Math.max(py, top + MIN_CROP) : bottom;
        return { x: left, y: top, w: newRight - left, h: newBottom - top };
      });
    };
    const stop = () => {
      handle.removeEventListener("pointermove", move);
      handle.removeEventListener("pointerup", stop);
      handle.removeEventListener("pointercancel", stop);
    };
    handle.addEventListener("pointermove", move);
    handle.addEventListener("pointerup", stop);
    handle.addEventListener("pointercancel", stop);
  };

  const corners: { corner: Corner; className: string }[] = [
    { corner: "nw", className: "-top-[18px] -left-[18px]" },
    { corner: "ne", className: "-top-[18px] -right-[18px]" },
    { corner: "sw", className: "-bottom-[18px] -left-[18px]" },
    { corner: "se", className: "-right-[18px] -bottom-[18px]" },
  ];
  const pct = (value: number) => `${value * 100}%`;
  const iconButton = skin.iconButton;

  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className={skin.title}>{strings.editTitle}</div>
          <div className={skin.hint}>{strings.editHint}</div>
        </div>
        <div className="flex shrink-0 gap-2">
          <button
            type="button"
            onClick={() => turn(3)}
            disabled={busy}
            aria-label={strings.rotateLeft}
            title={strings.rotateLeft}
            className={iconButton}
          >
            <RotateCcw className="size-[18px]" strokeWidth={2} />
          </button>
          <button
            type="button"
            onClick={() => turn(1)}
            disabled={busy}
            aria-label={strings.rotateRight}
            title={strings.rotateRight}
            className={iconButton}
          >
            <RotateCw className="size-[18px]" strokeWidth={2} />
          </button>
        </div>
      </div>

      {/* Room around the frame so the corner handles are never clipped. */}
      <div className={skin.stage}>
        {/* Never taller than about half the screen: a portrait photo must
            leave the save button in reach without scrolling over the frame. */}
        <div ref={frameRef} className="relative mx-auto w-fit touch-none select-none">
          <canvas
            ref={canvasRef}
            className="block h-auto max-h-[52vh] w-auto max-w-full"
            style={{ aspectRatio: `${full.width} / ${full.height}` }}
          />
          {/* The shadow dims everything outside the frame. */}
          <div className="pointer-events-none absolute inset-0 overflow-hidden">
            <div
              className="absolute border-2 border-paper shadow-[0_0_0_2000px_rgba(19,20,16,0.6)]"
              style={{
                left: pct(crop.x),
                top: pct(crop.y),
                width: pct(crop.w),
                height: pct(crop.h),
              }}
            />
          </div>
          <div
            className="absolute"
            style={{
              left: pct(crop.x),
              top: pct(crop.y),
              width: pct(crop.w),
              height: pct(crop.h),
            }}
          >
            {corners.map(({ corner, className }) => (
              <button
                key={corner}
                type="button"
                disabled={busy}
                data-corner={corner}
                aria-label={strings.corner}
                onPointerDown={dragCorner(corner)}
                className={`absolute flex size-9 touch-none items-center justify-center ${className}`}
              >
                <span className="block size-[18px] rounded-full border-2 border-ink bg-paper" />
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-4 flex flex-col gap-2">
        {canPublish && (
          <button
            type="button"
            disabled={busy}
            onClick={() => onSave(quarter, crop, true)}
            className={skin.primary}
          >
            {busy ? (
              <Loader2 className="size-[18px] animate-spin" strokeWidth={2} />
            ) : (
              <Globe className="size-[18px]" strokeWidth={2} />
            )}
            {busy ? strings.saving : strings.saveAndPublish}
          </button>
        )}
        <button
          type="button"
          disabled={busy}
          onClick={() => onSave(quarter, crop, false)}
          className={canPublish ? skin.secondary : skin.primary}
        >
          {!canPublish && busy && <Loader2 className="size-[18px] animate-spin" strokeWidth={2} />}
          {canPublish ? strings.saveOnlyAlt : busy ? strings.saving : strings.saveOnly}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={onCancel}
          className={skin.cancel}
        >
          <X className="size-[14px]" strokeWidth={2.25} />
          {strings.cancel}
        </button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ page --- */

/**
 * Everything the photo screen DOES, without how it looks: picking a file,
 * the rotate/crop save (gallery JPEG + cup mockup + original, one upload),
 * and the status / publish / unpublish server functions. The Origins admin
 * screen below and the campaign panel's screen
 * (components/campaign-admin/CampaignPhoto.tsx) both run on this, so the
 * two cannot drift apart. `uploadUrl` is the only thing that differs.
 */
export function useDrawingPhoto(entry: DrawingPhotoEntry, uploadUrl: string) {
  const router = useRouter();
  const [picked, setPicked] = useState<{ file: File; source: ImageBitmap } | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);
  const [statusState, statusAction, statusPending] = useActionState(setDrawingStatusAction, null);
  const [publishState, publishAction, publishPending] = useActionState(publishDrawingAction, null);
  const [unpublishState, unpublishAction, unpublishPending] = useActionState(
    unpublishDrawingAction,
    null,
  );

  const choose = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    // Same file twice must fire again.
    event.target.value = "";
    if (!file) return;
    setNotice(null);
    try {
      // `from-image` applies the EXIF turn, so a portrait phone photo
      // arrives upright before staff touch the rotate buttons.
      const source = await createImageBitmap(file, { imageOrientation: "from-image" });
      setPicked({ file, source });
    } catch {
      setNotice({ ok: false, text: strings.unreadable });
    }
  };

  const close = () => {
    picked?.source.close();
    setPicked(null);
  };

  const save = async (quarter: Quarter, crop: Crop, publish: boolean) => {
    if (!picked) return;
    setBusy(true);
    setNotice(null);
    try {
      const full = rotatedSize(picked.source, quarter);
      const size = fitWithin(crop.w * full.width, crop.h * full.height, WEB_MAX_SIDE);
      const canvas = document.createElement("canvas");
      drawRotated(canvas, picked.source, quarter, crop, size.width, size.height);
      const web = await canvasBlob(canvas, "image/jpeg", 0.86);
      if (!web) throw new Error("no web image");

      // CUP RENDER SLOT (lib/drawing-cup.ts). Only for a drawing that may be
      // printed; a failed render never blocks the upload.
      const cup = entry.consentReproduction
        ? await makeCupMockup(canvas).catch(() => null)
        : null;

      const body = new FormData();
      body.set("original", picked.file);
      body.set("web", web, `${entry.code}.jpg`);
      if (cup) body.set("pahar", cup, `${entry.code}-pahar.jpg`);
      if (publish) body.set("publica", "1");

      const response = await fetch(uploadUrl, {
        method: "POST",
        body,
      });
      const result = (await response.json()) as { ok: boolean; text: string };
      setNotice(result);
      if (result.ok) {
        close();
        router.refresh();
      }
    } catch {
      setNotice({ ok: false, text: strings.failed });
    } finally {
      setBusy(false);
    }
  };

  return {
    picked,
    busy,
    notice,
    choose,
    close,
    save,
    statusState,
    statusAction,
    statusPending,
    publishState,
    publishAction,
    publishPending,
    unpublishState,
    unpublishAction,
    unpublishPending,
  };
}

export const photoStrings = strings;

export default function DrawingPhoto({
  entry,
  manager,
  votingOpen,
}: {
  entry: DrawingPhotoEntry;
  manager: boolean;
  votingOpen: boolean;
}) {
  const {
    picked,
    busy,
    notice,
    choose,
    close,
    save,
    statusState,
    statusAction,
    statusPending,
    publishState,
    publishAction,
    publishPending,
    unpublishState,
    unpublishAction,
    unpublishPending,
  } = useDrawingPhoto(entry, `/admin/desene/${entry.id}/imagine`);

  const fileButton =
    "flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-btn p-[13px] text-[14px] font-semibold";
  const quiet =
    "flex w-full items-center justify-center gap-2 rounded-btn border border-line bg-paper p-[13px] text-[14px] font-semibold text-ink disabled:opacity-45";
  const canPublishAfterSave = entry.publishBlock === null;

  return (
    <div className="pb-8">
      <div className="px-5 pt-[22px] pb-1.5">
        <Link
          href="/admin/desene"
          className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-sage-deep"
        >
          <ArrowLeft className="size-[14px]" strokeWidth={2.25} />
          {strings.back}
        </Link>
        <div className="mt-3 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[11px] font-bold tracking-[0.18em] text-sage-deep uppercase">
              {strings.eyebrow}
            </div>
            <h1 className="mt-1 text-[34px] leading-none font-extrabold tracking-[-0.02em] tabular-nums">
              {entry.code}
            </h1>
            <div className="mt-2 text-[14px] font-semibold text-ink">
              {entry.childFirstName}, {entry.childAge} {strings.years}
              {entry.attribution === "none" && (
                <span className="font-normal text-muted"> · {strings.noName}</span>
              )}
            </div>
            <div className="mt-0.5 text-[12px] text-muted">
              {entry.category} {strings.years} · {entry.locationName}
            </div>
          </div>
          <span className="mt-1 inline-flex shrink-0 items-center rounded-full bg-cream px-2.5 py-1 text-[10.5px] font-semibold text-sage-deep">
            {strings.status[entry.status]}
          </span>
        </div>
      </div>

      <div className="flex flex-col gap-3 px-5 pt-3">
        {!entry.consentGallery && (
          <p className="rounded-card bg-cream px-4 py-3 text-[12.5px] leading-[1.5] text-ink/80">
            {strings.noConsent}
          </p>
        )}
        {entry.consentGallery && !entry.consentReproduction && (
          <p className="rounded-card bg-cream px-4 py-3 text-[12.5px] leading-[1.5] text-ink/80">
            {strings.noReproduction}
          </p>
        )}

        {entry.status === "inregistrat" && (
          <form action={statusAction} className="rounded-card border border-line p-4">
            <p className="text-[12.5px] leading-[1.5] text-ink/80">{strings.handInFirst}</p>
            <input type="hidden" name="entryId" value={entry.id} />
            <input type="hidden" name="status" value="depus" />
            <button type="submit" disabled={statusPending} className={`mt-3 ${quiet}`}>
              {statusPending ? (
                <Loader2 className="size-[16px] animate-spin" strokeWidth={2} />
              ) : (
                <Check className="size-[16px] text-sage-deep" strokeWidth={2.25} />
              )}
              {strings.markHandedIn}
            </button>
          </form>
        )}
        <NoticeBox notice={statusState} />

        {picked ? (
          <Editor
            source={picked.source}
            busy={busy}
            canPublish={canPublishAfterSave}
            onCancel={close}
            onSave={save}
          />
        ) : (
          <section>
            <h2 className="text-[11px] font-bold tracking-[0.16em] text-sage-deep uppercase">
              {strings.photoTitle}
            </h2>
            {entry.imageWeb ? (
              <div className="mt-2 overflow-hidden rounded-card bg-cream p-2">
                <Image
                  src={entry.imageWeb}
                  alt={entry.code}
                  width={entry.imageWidth ?? 4}
                  height={entry.imageHeight ?? 3}
                  sizes="(min-width: 481px) 358px, 100vw"
                  className="h-auto w-full"
                />
              </div>
            ) : (
              <p className="mt-2 text-[12.5px] text-muted">
                {strings.noPhoto} {strings.tips}
              </p>
            )}

            <div className="mt-3 flex gap-2">
              <label className={`${fileButton} bg-ink text-paper`}>
                <Camera className="size-[17px]" strokeWidth={2} />
                {entry.imageWeb ? strings.retake : strings.take}
                {/* `capture` opens the back camera directly on a phone. */}
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={choose}
                  data-input="camera"
                  className="sr-only"
                />
              </label>
              <label className={`${fileButton} border border-line bg-paper text-ink`}>
                <ImageUp className="size-[17px] text-sage-deep" strokeWidth={2} />
                {strings.pick}
                <input
                  type="file"
                  accept="image/*"
                  onChange={choose}
                  data-input="library"
                  className="sr-only"
                />
              </label>
            </div>
          </section>
        )}

        <NoticeBox notice={notice} />

        {!picked && entry.imageWeb && (
          <section className="mt-2 flex flex-col gap-2 border-t border-line pt-4">
            <div className="flex items-center gap-2 text-[13px] font-semibold text-ink">
              {entry.live ? (
                <Globe className="size-[15px] text-open" strokeWidth={2.25} />
              ) : (
                <EyeOff className="size-[15px] text-muted" strokeWidth={2.25} />
              )}
              {entry.live
                ? `${strings.liveSince} ${formatBucharestDate(entry.publishedAt!)}`
                : entry.publishedAt
                  ? `${strings.wasLive} ${formatBucharestDate(entry.publishedAt)}.`
                  : strings.notLive}
            </div>

            {entry.live ? (
              <>
                <a
                  href={`/desene/${entry.code}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={quiet}
                >
                  <ExternalLink className="size-[16px] text-sage-deep" strokeWidth={2} />
                  {strings.openPublic}
                </a>
                <form action={unpublishAction}>
                  <input type="hidden" name="entryId" value={entry.id} />
                  <button type="submit" disabled={unpublishPending} className={quiet}>
                    {unpublishPending ? (
                      <Loader2 className="size-[16px] animate-spin" strokeWidth={2} />
                    ) : (
                      <EyeOff className="size-[16px] text-sage-deep" strokeWidth={2} />
                    )}
                    {strings.unpublish}
                  </button>
                </form>
              </>
            ) : (
              entry.consentGallery && (
                <form action={publishAction}>
                  <input type="hidden" name="entryId" value={entry.id} />
                  <button
                    type="submit"
                    disabled={publishPending}
                    className="flex w-full items-center justify-center gap-2 rounded-btn bg-ink p-[15px] text-[15px] font-semibold text-paper disabled:opacity-45"
                  >
                    {publishPending ? (
                      <Loader2 className="size-[18px] animate-spin" strokeWidth={2} />
                    ) : (
                      <Globe className="size-[18px]" strokeWidth={2} />
                    )}
                    {strings.publish}
                  </button>
                </form>
              )
            )}
            <NoticeBox notice={publishState} />
            <NoticeBox notice={unpublishState} />

            {manager && entry.hasOriginal && (
              <form method="post" action={`/admin/desene/${entry.id}/original`}>
                <button type="submit" className={quiet}>
                  <Download className="size-[16px] text-sage-deep" strokeWidth={2} />
                  {strings.original}
                </button>
              </form>
            )}
          </section>
        )}

        {!votingOpen && entry.live && (
          <p className="text-[12px] leading-[1.5] text-muted">{strings.voteClosed}</p>
        )}
      </div>
    </div>
  );
}
