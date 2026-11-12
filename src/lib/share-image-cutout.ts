import { renderCupToCanvas } from "@/lib/cup-render/render";

/**
 * The cup with this drawing, cut out on a transparent ground, for the share
 * poster. Kept in its own module on purpose: it is the only poster code
 * that pulls in the cup renderer, and components/ShareImage.tsx imports it
 * only on a desktop. Phones use the stored mockup JPEG instead.
 */
export function renderCupCutout(drawingUrl: string): Promise<HTMLCanvasElement> {
  return renderCupToCanvas(drawingUrl, { cutout: true, width: 900, height: 1125, fill: 0.9 });
}
