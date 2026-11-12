"use client";

import CupRender from "./CupRender";
import type { PublicDrawing } from "@/lib/drawing";

/**
 * ============================ CUP RENDER SLOT ============================
 * The drawing on the Origins cup, live: <CupRender> warps the gallery image
 * around the cup in the browser, and dragging sideways turns it.
 *
 * Callers render it only when the drawing has a stored mockup
 * (`drawing.cupImage`), which the upload generates only with reproduction
 * consent: a drawing that may not be printed is never shown on a cup. The
 * stored mockup itself is the Open Graph image; here the cup is drawn fresh
 * from `drawing.image`, the same file the flat view shows.
 * ==========================================================================
 */
export default function DrawingCupSlot({
  drawing,
  attribution,
  alt,
}: {
  drawing: PublicDrawing;
  /** "Desenat de Ana, 7 ani": the small line at the back of the cup. */
  attribution?: string;
  alt: string;
}) {
  return <CupRender src={drawing.image} attribution={attribution} alt={alt} />;
}
