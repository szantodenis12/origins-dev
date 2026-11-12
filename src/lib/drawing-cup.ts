/**
 * ============================ CUP RENDER SLOT ============================
 * Where the admin upload turns the cropped drawing into the cup mockup that
 * the Open Graph image uses (what WhatsApp and Facebook show for a shared
 * drawing link). Wired to lib/cup-render: `renderCupBlob(drawing, options)`,
 * default placement "arc", 1080 x 1350.
 *
 * JPEG on purpose, not PNG: the mockup is a photo of a cup, and link
 * previews skip images that weigh megabytes. A PNG is still accepted by
 * the upload route if this ever changes.
 *
 * The module is imported lazily so the staff screen does not carry the
 * render code until a photo is actually saved. A failure here must never
 * block the upload: the caller (admin/desene/[id]/DrawingPhoto.tsx) treats
 * a throw the same as null and the public page falls back to the drawing.
 * ==========================================================================
 */
export async function makeCupMockup(drawing: HTMLCanvasElement): Promise<Blob | null> {
  const { renderCupBlob } = await import("@/lib/cup-render/render");
  return renderCupBlob(drawing, { type: "image/jpeg", encoderQuality: 0.88 });
}
