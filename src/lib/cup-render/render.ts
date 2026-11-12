/**
 * Cup render, the browser side: load the blank-cup photo and its measurements,
 * lay out the flat print (the drawing, the green tab with the white logo, the
 * small green tab with „• CRĂCIUN 2026 •”), warp it onto
 * the cup and hand back a canvas, a PNG Blob or a data URL.
 *
 * Client only (canvas, Image, FontFace). The maths lives in geometry.ts and
 * paint.ts, which have no DOM in them.
 *
 * One-shot, for the upload flow:
 *     const png = await renderCupBlob(file, { attribution: "Desenat de Ana, 7 ani" });
 *
 * Live, for a component that turns the cup:
 *     const scene = await loadCupScene();
 *     const art = await composeArtwork(scene, src);
 *     paintScene(scene, art, canvas, degrees);
 *
 * Swapping the photo: run tools/measure_cup.py on the new one (it writes the
 * jpg, the mask and the json into public/cup/) and pass `cup: "<name>"`, or
 * keep the name `cup-blank` and nothing here changes.
 */
import {
  CUP_DIMS_12OZ,
  CUP_LAYOUT_V2,
  artworkBox,
  buildWarpMap,
  clampRotation,
  cropFor,
  logoBox,
  rotationOf,
  sectorOf,
  tabOutline,
  visibleRadii,
  type Box,
  type CupDims,
  type CupLayout,
  type CupPhoto,
  type WarpMap,
} from "./geometry.ts";
import { DEFAULT_LOOK, paintCup, type Artwork, type Look } from "./paint.ts";

export type DrawingSource = string | Blob | HTMLImageElement | HTMLCanvasElement | ImageBitmap;

export type CupSceneOptions = {
  /** Output size in pixels. Default 1080 x 1350 (4:5). */
  width?: number;
  height?: number;
  /** Share of the output height taken by lid + cup. Default 0.62. */
  fill?: number;
  /** Which measured photo in /public/cup. Default "cup-blank". */
  cup?: string;
  /** Cup dimensions in mm. Default the supplier-confirmed 12 oz. */
  dims?: CupDims;
  /** Tabs, logo and label. Default layout v2. */
  layout?: CupLayout;
  /** Samples per pixel in each direction, 1 or 2. Default 2. */
  quality?: 1 | 2;
};

export type ArtworkOptions = {
  /**
   * The line at the BACK of the cup, next to the seam, e.g. "Desenat de Ana,
   * 7 ani". Off unless given; from the front it is not in view.
   */
  attribution?: string;
  /**
   * "arc" (default): the drawing is bent onto the fan, so its horizon follows
   * the cup's circumference and its two ends meet at the back.
   * "flat": the sheet laid straight over the blank; straight lines bow on the cup.
   */
  placement?: "arc" | "flat";
};

export type CupRenderOptions = CupSceneOptions &
  ArtworkOptions & {
  /** Turn the cup, degrees, clamped to ±40. Default 0 (logo dead centre). */
  rotation?: number;
  /**
   * Only the lid and the cup, on a transparent background, for composing the
   * cup on another backdrop. PNG / WebP only.
   */
  cutout?: boolean;
  look?: Look;
  /** For the Blob / data URL. Default "image/png". */
  type?: "image/png" | "image/jpeg" | "image/webp";
  /** Encoder quality for jpeg / webp, 0..1. */
  encoderQuality?: number;
};

export type CupScene = {
  width: number;
  height: number;
  photo: CupPhoto;
  dims: CupDims;
  layout: CupLayout;
  crop: Box;
  /** The blank photo, cropped, RGBA at output size. */
  base: Uint8ClampedArray;
  /** Wall mask at output size, one byte per pixel. */
  mask: Uint8Array;
  /** Lid + cup silhouette at output size, or null when the photo has none. */
  cutout: Uint8Array | null;
  map: WarpMap;
  logo: LogoPaths;
};

type LogoPaths = { viewBox: string; paths: string[] };

const ASSET_BASE = "/cup";
const INK = "#121212";
const LABEL = "• CRĂCIUN 2026 •";
const MONO = "Origins Cup Mono";
const DISPLAY = "Origins Cup Display";

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    // a drawing served from storage on another origin must come with CORS
    // headers, or the canvas is tainted and cannot be read back
    if (/^https?:/i.test(src) && !src.startsWith(window.location.origin)) img.crossOrigin = "anonymous";
    img.decoding = "async";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`cup-render: could not load ${src.slice(0, 120)}`));
    img.src = src;
  });
}

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`cup-render: ${url} -> ${res.status}`);
  return (await res.json()) as T;
}

let fontReady: Promise<void> | null = null;
function loadFont(): Promise<void> {
  fontReady ??= (async () => {
    const faces: [string, string, string][] = [
      [DISPLAY, "BarlowCondensed-ExtraBold.ttf", "800"],
      [MONO, "DMMono-Medium.ttf", "500"],
    ];
    await Promise.all(
      faces.map(async ([family, file, weight]) => {
        try {
          const face = new FontFace(family, `url(${ASSET_BASE}/${file})`, { weight });
          await face.load();
          document.fonts.add(face);
        } catch {
          // the text falls back to a system face; the render still works
        }
      }),
    );
  })();
  return fontReady;
}

function canvasOf(width: number, height: number): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("cup-render: no 2d canvas");
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  return { canvas, ctx };
}

const scenes = new Map<string, Promise<CupScene>>();

/** Photo, mask, measurements and warp lookup for one output size. Cached. */
export function loadCupScene(options: CupSceneOptions = {}): Promise<CupScene> {
  const width = Math.round(options.width ?? 1080);
  const height = Math.round(options.height ?? 1350);
  const fill = options.fill ?? 0.62;
  const cup = options.cup ?? "cup-blank";
  const dims = options.dims ?? CUP_DIMS_12OZ;
  const layout = options.layout ?? CUP_LAYOUT_V2;
  const ss = options.quality ?? 2;
  const key = JSON.stringify([cup, width, height, fill, ss, dims, layout]);
  let scene = scenes.get(key);
  if (!scene) {
    scene = (async () => {
      const [photo, logo] = await Promise.all([
        fetchJson<CupPhoto>(`${ASSET_BASE}/${cup}.json`),
        fetchJson<LogoPaths>(`${ASSET_BASE}/origins-logo-paths.json`),
        loadFont(),
      ]);
      const [photoImg, maskImg, cutImg] = await Promise.all([
        loadImage(photo.photo),
        loadImage(photo.mask),
        photo.cutout ? loadImage(photo.cutout) : null,
      ]);
      const crop = cropFor(photo, width, height, fill);
      const { ctx } = canvasOf(width, height);
      ctx.drawImage(photoImg, crop.x, crop.y, crop.w, crop.h, 0, 0, width, height);
      const base = ctx.getImageData(0, 0, width, height).data;
      ctx.clearRect(0, 0, width, height);
      ctx.drawImage(maskImg, crop.x, crop.y, crop.w, crop.h, 0, 0, width, height);
      const red = () => {
        const rgba = ctx.getImageData(0, 0, width, height).data;
        const one = new Uint8Array(width * height);
        for (let i = 0; i < one.length; i++) one[i] = rgba[i << 2];
        return one;
      };
      const mask = red();
      let cutout: Uint8Array | null = null;
      if (cutImg) {
        ctx.clearRect(0, 0, width, height);
        ctx.drawImage(cutImg, crop.x, crop.y, crop.w, crop.h, 0, 0, width, height);
        cutout = red();
      }
      const map = buildWarpMap(photo, dims, crop, width, height, ss);
      return { width, height, photo, dims, layout, crop, base, mask, cutout, map, logo };
    })();
    scenes.set(key, scene);
    scene.catch(() => scenes.delete(key));
  }
  return scene;
}

async function toDrawable(src: DrawingSource): Promise<{ image: CanvasImageSource; w: number; h: number; done: () => void }> {
  if (typeof src === "string") {
    const image = await loadImage(src);
    return { image, w: image.naturalWidth, h: image.naturalHeight, done: () => {} };
  }
  if (src instanceof Blob) {
    const url = URL.createObjectURL(src);
    try {
      const image = await loadImage(url);
      return { image, w: image.naturalWidth, h: image.naturalHeight, done: () => URL.revokeObjectURL(url) };
    } catch (error) {
      URL.revokeObjectURL(url);
      throw error;
    }
  }
  if (src instanceof HTMLImageElement) {
    if (!src.complete) await src.decode();
    return { image: src, w: src.naturalWidth, h: src.naturalHeight, done: () => {} };
  }
  return { image: src, w: src.width, h: src.height, done: () => {} };
}

/**
 * Tracked text on a circle of the blank: every glyph stands on the arc of
 * radius `r`, the line is centred on `centre` (radians on the blank), so on the
 * cup it runs level around the wall.
 */
function arcText(
  ctx: CanvasRenderingContext2D,
  text: string,
  font: string,
  size: number,
  tracking: number,
  r: number,
  centre: number | { endAt: number },
) {
  ctx.font = font;
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  const chars = Array.from(text);
  const widths = chars.map((ch) => ctx.measureText(ch).width);
  const gap = tracking * size;
  const total = widths.reduce((sum, w) => sum + w, 0) + gap * (chars.length - 1);
  const start = typeof centre === "number" ? centre * r - total / 2 : centre.endAt * r - total;
  let at = start;
  chars.forEach((ch, i) => {
    const a = (at + widths[i] / 2) / r;
    ctx.save();
    ctx.translate(r * Math.sin(a), -r * Math.cos(a));
    ctx.rotate(a);
    ctx.fillText(ch, 0, 0);
    ctx.restore();
    at += widths[i] + gap;
  });
}

/**
 * The flat print file as pixels, same layout as 06_Cup_Design/build_pahar.py
 * (v2): the drawing over the whole wall, a green tab with the white Origins
 * logo hanging from the top, a smaller green tab with „• CRĂCIUN 2026 •” rising
 * from the base, and optionally the attribution at the back, by the seam.
 */
export async function composeArtwork(
  scene: CupScene,
  drawing: DrawingSource,
  options: ArtworkOptions = {},
): Promise<Artwork> {
  const { dims, photo, layout } = scene;
  const sector = sectorOf(dims);
  const box = artworkBox(dims, sector);
  const vis = visibleRadii(dims, sector);
  // about one texel per output pixel in the middle of the cup, where the print
  // is least squeezed: sharper than that reads as pasted on, not printed
  const outPerMm = (scene.width / scene.crop.w) * ((2 * photo.top.a) / dims.topDiameter);
  const ppm = Math.min(10, Math.max(3, Math.round(outPerMm * 1.05)));
  const { ctx } = canvasOf(Math.round(box.w * ppm), Math.round(box.h * ppm));
  const W = ctx.canvas.width;
  const H = ctx.canvas.height;
  const toMm = () => ctx.setTransform(W / box.w, 0, 0, H / box.h, -box.x * (W / box.w), -box.y * (H / box.h));
  // a drawing smaller than the wall is completed with the white of the sheet
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, W, H);

  const d = await toDrawable(drawing);
  try {
    if (options.placement === "flat") {
      const s = Math.max(W / d.w, H / d.h);
      ctx.drawImage(d.image, (W - d.w * s) / 2, (H - d.h * s) / 2, d.w * s, d.h * s);
    } else {
      // bend the sheet onto the fan: thin radial strips, each one a column of
      // the drawing. Width of the sheet = once around the cup (plus bleed).
      toMm();
      const rTop = vis.top + dims.bleed;
      const rBottom = vis.bottom - dims.bleed;
      const halfAngle = sector.theta / 2 + dims.bleed / sector.rOuter;
      const around = 2 * halfAngle * ((vis.top + vis.bottom) / 2);
      const k = Math.max(around / d.w, (rTop - rBottom) / d.h); // mm per source pixel, cover
      const srcW = around / k;
      const srcH = (rTop - rBottom) / k;
      const sx0 = (d.w - srcW) / 2;
      const sy0 = (d.h - srcH) / 2;
      const strips = Math.ceil((2 * halfAngle * rTop * ppm) / 1.5);
      const stripMm = (2 * halfAngle * rTop) / strips;
      for (let i = 0; i < strips; i++) {
        ctx.save();
        ctx.rotate(-halfAngle + ((i + 0.5) / strips) * 2 * halfAngle);
        // a little wider than its share, so neighbours overlap instead of leaving hairlines
        ctx.drawImage(d.image, sx0 + (i / strips) * srcW, sy0, (srcW / strips) * 1.5, srcH, -stripMm / 2, -rTop, stripMm * 1.5, rTop - rBottom);
        ctx.restore();
      }
    }
  } finally {
    d.done();
  }

  // from here on, draw in millimetres with the apex of the cone at the origin
  toMm();
  ctx.fillStyle = layout.green;
  for (const which of ["top", "bottom"] as const) {
    const outline = tabOutline(which, dims, layout, sector);
    ctx.beginPath();
    outline.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
    ctx.closePath();
    ctx.fill();
  }

  ctx.fillStyle = "#fff";
  const [vx, vy, vw, vh] = scene.logo.viewBox.split(/\s+/).map(Number);
  const lb = logoBox(vw / vh, dims, layout, sector);
  ctx.save();
  ctx.translate(lb.x, lb.y);
  ctx.scale(lb.w / vw, lb.w / vw);
  ctx.translate(-vx, -vy);
  for (const path of scene.logo.paths) ctx.fill(new Path2D(path), "evenodd");
  ctx.restore();

  const bt = layout.bottomTab;
  arcText(ctx, LABEL, `800 ${bt.fontSize}px "${DISPLAY}", "Arial Narrow", sans-serif`, bt.fontSize, bt.tracking, vis.bottom + bt.baseline, 0);

  const who = options.attribution?.trim();
  if (who) {
    const at = layout.attribution;
    const r = vis.bottom + at.baseline;
    ctx.fillStyle = INK;
    arcText(ctx, who.toLocaleUpperCase("ro"), `500 ${at.fontSize}px "${MONO}", ui-monospace, Menlo, monospace`, at.fontSize, 0.12, r, {
      endAt: sector.theta / 2 - at.endBeforeSeam / r,
    });
  }

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  return { data: ctx.getImageData(0, 0, W, H).data, width: W, height: H, box };
}

/** Paint the scene with this artwork into `target` (resized to the scene). */
export function paintScene(
  scene: CupScene,
  artwork: Artwork,
  target: HTMLCanvasElement,
  rotationDeg = 0,
  look: Look = DEFAULT_LOOK,
  cutout = false,
): void {
  if (target.width !== scene.width) target.width = scene.width;
  if (target.height !== scene.height) target.height = scene.height;
  const ctx = target.getContext("2d");
  if (!ctx) throw new Error("cup-render: no 2d canvas");
  const image = new ImageData(scene.width, scene.height);
  paintCup({
    base: scene.base,
    out: image.data,
    width: scene.width,
    height: scene.height,
    mask: scene.mask,
    map: scene.map,
    artwork,
    rotation: rotationOf(scene.dims, clampRotation(rotationDeg)),
    paperWhite: scene.photo.paperWhite,
    look,
  });
  if (cutout) {
    if (!scene.cutout) throw new Error("cup-render: this cup photo has no cut-out mask (re-run measure_cup.py)");
    for (let i = 0; i < scene.cutout.length; i++) image.data[(i << 2) + 3] = scene.cutout[i];
  }
  ctx.putImageData(image, 0, 0);
}

/** The drawing on the cup, as a canvas. */
export async function renderCupToCanvas(drawing: DrawingSource, options: CupRenderOptions = {}): Promise<HTMLCanvasElement> {
  const scene = await loadCupScene(options);
  const artwork = await composeArtwork(scene, drawing, options);
  const canvas = document.createElement("canvas");
  paintScene(scene, artwork, canvas, options.rotation ?? 0, options.look, options.cutout);
  return canvas;
}

/** The drawing on the cup, as an image Blob (PNG by default): the share / OG image. */
export async function renderCupBlob(drawing: DrawingSource, options: CupRenderOptions = {}): Promise<Blob> {
  const canvas = await renderCupToCanvas(drawing, options);
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("cup-render: the canvas could not be encoded"))),
      options.type ?? "image/png",
      options.encoderQuality,
    );
  });
}

/** Same, as a data URL. */
export async function renderCupDataUrl(drawing: DrawingSource, options: CupRenderOptions = {}): Promise<string> {
  const canvas = await renderCupToCanvas(drawing, options);
  return canvas.toDataURL(options.type ?? "image/png", options.encoderQuality);
}
