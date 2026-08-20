"use client";

import { useRef, useState, useTransition } from "react";
import Image from "next/image";
import { ImagePlus, Images, Loader2, TriangleAlert, X } from "lucide-react";
import { uploadPhotoAction } from "./actions";
import { hintClass, labelClass } from "./ui";
import { IMAGE_ACCEPT_ATTRIBUTE, photoLabel } from "@/lib/images";

/**
 * One photo slot: preview, upload, library, remove. The value travels in a
 * hidden input, so the row's own form saves the photo together with everything
 * else — nothing changes on the public menu until the manager presses Salvează.
 *
 * The upload itself cannot be a nested <form> (illegal inside the row form), so
 * the file input calls the Server Function directly in a transition.
 */

/** Staff screen: Romanian only. */
const strings = {
  upload: "Încarcă poză",
  library: "Alege din bibliotecă",
  closeLibrary: "Închide biblioteca",
  remove: "Scoate poza",
  empty: "Fără poză",
  uploading: "Se încarcă...",
  libraryEmpty: "Nu există încă poze încărcate.",
};

const RATIO = {
  square: "aspect-square w-[104px]",
  wide: "aspect-[16/7] w-full",
  card: "aspect-[4/3] w-[148px]",
} as const;

export default function ImageField({
  name,
  label,
  hint,
  value,
  library,
  ratio = "square",
}: {
  /** Form field the path is submitted under (e.g. "poza", "pozaHero"). */
  name: string;
  label: string;
  hint?: string;
  value?: string;
  /** Everything already in the image store, newest first. */
  library: string[];
  ratio?: keyof typeof RATIO;
}) {
  const [path, setPath] = useState<string>(value ?? "");
  const [known, setKnown] = useState<string[]>(library);
  const [picking, setPicking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const fileInput = useRef<HTMLInputElement>(null);

  function upload(file: File) {
    const payload = new FormData();
    payload.set("fisier", file);

    startTransition(async () => {
      const result = await uploadPhotoAction(null, payload);
      if (result?.ok) {
        setPath(result.path);
        setKnown((current) => [result.path, ...current]);
        setPicking(false);
        setError(null);
      } else {
        setError(result?.text ?? strings.uploading);
      }
    });
  }

  return (
    <div className="mt-4">
      <span className={labelClass}>{label}</span>

      <input type="hidden" name={name} value={path} />

      <div className="mt-2 flex items-start gap-3">
        <div
          className={`shrink-0 overflow-hidden rounded-card border border-line bg-cream ${RATIO[ratio]}`}
        >
          {path ? (
            <Image
              src={path}
              alt=""
              width={320}
              height={320}
              sizes="160px"
              className="size-full object-cover"
            />
          ) : (
            <span className="flex size-full items-center justify-center text-[11px] font-semibold text-muted">
              {strings.empty}
            </span>
          )}
        </div>

        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <button
            type="button"
            onClick={() => fileInput.current?.click()}
            disabled={pending}
            className="flex items-center gap-2 rounded-btn border border-line bg-paper px-3 py-2.5 text-[13px] font-semibold text-ink disabled:opacity-45"
          >
            {pending ? (
              <Loader2
                className="size-[15px] shrink-0 animate-spin"
                strokeWidth={2}
              />
            ) : (
              <ImagePlus
                className="size-[15px] shrink-0 text-sage-deep"
                strokeWidth={2.25}
              />
            )}
            {pending ? strings.uploading : strings.upload}
          </button>

          <button
            type="button"
            onClick={() => setPicking((open) => !open)}
            className="flex items-center gap-2 rounded-btn border border-line bg-paper px-3 py-2.5 text-[13px] font-semibold text-ink"
          >
            <Images
              className="size-[15px] shrink-0 text-sage-deep"
              strokeWidth={2.25}
            />
            {picking ? strings.closeLibrary : strings.library}
          </button>

          {path && (
            <button
              type="button"
              onClick={() => setPath("")}
              className="flex items-center gap-2 px-1 py-1 text-[12.5px] font-semibold text-muted"
            >
              <X className="size-[14px] shrink-0" strokeWidth={2.25} />
              {strings.remove}
            </button>
          )}
        </div>
      </div>

      {/* Hidden until clicked: a bare file input in a staff form reads as junk. */}
      <input
        ref={fileInput}
        type="file"
        accept={IMAGE_ACCEPT_ATTRIBUTE}
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          // Reset first: picking the same file twice must fire onChange again.
          event.target.value = "";
          if (file) upload(file);
        }}
      />

      {hint && <p className={hintClass}>{hint}</p>}

      {error && (
        <div
          role="alert"
          className="mt-2 flex items-start gap-2 rounded-card bg-cream px-3 py-2 text-[12px] font-semibold text-ink"
        >
          <TriangleAlert
            className="mt-px size-[14px] shrink-0 text-sage-deep"
            strokeWidth={2}
          />
          <span>{error}</span>
        </div>
      )}

      {picking && (
        <div className="mt-2.5 rounded-card border border-line p-2.5">
          {known.length === 0 ? (
            <p className="p-2 text-[12.5px] text-muted">
              {strings.libraryEmpty}
            </p>
          ) : (
            <div className="grid max-h-[280px] grid-cols-3 gap-2 overflow-y-auto">
              {known.map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => {
                    setPath(option);
                    setPicking(false);
                  }}
                  title={photoLabel(option)}
                  className={`overflow-hidden rounded-btn border-2 ${
                    option === path ? "border-sage-deep" : "border-transparent"
                  }`}
                >
                  <Image
                    src={option}
                    alt={photoLabel(option)}
                    width={160}
                    height={160}
                    sizes="90px"
                    className="aspect-square w-full object-cover"
                  />
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
