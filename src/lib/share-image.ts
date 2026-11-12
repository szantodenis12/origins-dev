import QRCode from "qrcode";

/**
 * The image a parent downloads to post: Instagram story, WhatsApp status,
 * Facebook. Drawn entirely in the browser on a canvas, no server render.
 *
 *   story  1080 x 1920, with an empty outlined slot for Instagram's link
 *          sticker; nothing important in the top 180 px or the bottom 190 px,
 *          where the story chrome sits
 *   post   1080 x 1350
 *
 * Content, top to bottom: Origins logo, the call to vote (no kicker), the cup with THIS
 * drawing (when the drawing may be printed) and the whole flat drawing as a
 * tilted card with its attribution, the link as text + QR and the closing
 * date. (The contest name is not printed: Roland, 10.11.2026.) A drawing without reproduction consent gets the
 * same poster with the flat drawing only.
 *
 * Same language as the gallery pages: white ground, ink type, the two-line
 * headline (first line Inter Tight 800, second line 300 and set off to the
 * right), rounded corners, and a dark rounded panel at the bottom for the
 * link. Inter Tight only; no kicker above the headline. No gradients: the only
 * soft thing is the shadow under the cup and the card.
 */

export type ShareFormat = "story" | "post";

export const SHARE_SIZES: Record<ShareFormat, { width: number; height: number }> = {
  story: { width: 1080, height: 1920 },
  post: { width: 1080, height: 1350 },
};

export interface ShareImageInput {
  format: ShareFormat;
  /** The gallery image of this drawing (same URL the page shows). */
  drawingUrl: string;
  /**
   * The cup on the poster. "cutout": a canvas with the cup cut out on a
   * transparent ground, rendered by the caller (desktop only, see
   * lib/share-image-cutout.ts; this module never references the cup-render
   * code, so a phone cannot end up downloading it). "photo": the stored
   * mockup JPEG in a rounded frame, no rendering (phones). "none": the
   * drawing may not be printed, so only the flat drawing is shown.
   */
  cup:
    | { mode: "cutout"; canvas: HTMLCanvasElement }
    | { mode: "photo"; url: string }
    | { mode: "none" };
  /** "Ana, 7 ani" or "Desenul R-002": exactly what the page shows. */
  label: string;
  /** Absolute URL of the drawing page; printed without the scheme and in the QR. */
  url: string;
  text: {
    headline1: string;
    headline2: string;
    linkHint: string;
    closes: string;
  };
}

const INK = "#121212";
const WHITE = "#ffffff";

/** The real family names behind next/font's CSS variables. */
function fontFamily(variable: string, fallback: string): string {
  const value = getComputedStyle(document.documentElement).getPropertyValue(variable).trim();
  return value ? `${value}, ${fallback}` : fallback;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    // A drawing served from another origin (storage bucket) needs CORS
    // headers, or the canvas cannot be exported.
    if (/^https?:/i.test(src) && !src.startsWith(window.location.origin)) {
      image.crossOrigin = "anonymous";
    }
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("share-image: could not load the drawing"));
    image.src = src;
  });
}

/** Letter-spaced text, centred or left-aligned, without relying on ctx.letterSpacing. */
function trackedText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  tracking: number,
  align: "left" | "center",
): void {
  const chars = [...text];
  const widths = chars.map((char) => ctx.measureText(char).width);
  const total = widths.reduce((sum, w) => sum + w, 0) + tracking * (chars.length - 1);
  let cursor = align === "center" ? x - total / 2 : x;
  ctx.textAlign = "left";
  for (const [index, char] of chars.entries()) {
    ctx.fillText(char, cursor, y);
    cursor += widths[index] + tracking;
  }
}

/** Largest font size (<= `size`) at which `text` fits `maxWidth`. */
function fitFont(
  ctx: CanvasRenderingContext2D,
  text: string,
  font: (size: number) => string,
  size: number,
  maxWidth: number,
): number {
  let current = size;
  ctx.font = font(current);
  while (ctx.measureText(text).width > maxWidth && current > 20) {
    current -= 2;
    ctx.font = font(current);
  }
  return current;
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

async function drawLogo(
  ctx: CanvasRenderingContext2D,
  centerX: number,
  top: number,
  width: number,
): Promise<void> {
  // The same vector the cup render prints on the cup: sharp at any size.
  const response = await fetch("/cup/origins-logo-paths.json");
  if (!response.ok) throw new Error("share-image: logo");
  const logo = (await response.json()) as { viewBox: string; paths: string[] };
  const [vx, vy, vw] = logo.viewBox.split(/\s+/).map(Number);
  const scale = width / vw;
  ctx.save();
  ctx.translate(centerX - width / 2, top);
  ctx.scale(scale, scale);
  ctx.translate(-vx, -vy);
  ctx.fillStyle = INK;
  for (const path of logo.paths) ctx.fill(new Path2D(path), "evenodd");
  ctx.restore();
}

/** Bounding box of the non-transparent pixels (the cup inside its cut-out canvas). */
function opaqueBox(canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext("2d")!;
  const { data, width, height } = ctx.getImageData(0, 0, canvas.width, canvas.height);
  let left = width;
  let right = 0;
  let top = height;
  let bottom = 0;
  for (let y = 0; y < height; y += 2) {
    for (let x = 0; x < width; x += 2) {
      if (data[(y * width + x) * 4 + 3] > 24) {
        if (x < left) left = x;
        if (x > right) right = x;
        if (y < top) top = y;
        if (y > bottom) bottom = y;
      }
    }
  }
  return right > left && bottom > top
    ? { x: left, y: top, w: right - left, h: bottom - top }
    : { x: 0, y: 0, w: width, h: height };
}

/** The flat drawing as a rounded white card with the attribution under it. */
function drawCard(
  ctx: CanvasRenderingContext2D,
  image: HTMLImageElement,
  label: string,
  sans: string,
  center: { x: number; y: number },
  maxWidth: number,
  maxHeight: number,
  degrees: number,
): void {
  const pad = Math.round(maxWidth * 0.04);
  const caption = Math.round(maxWidth * 0.15);
  const scale = Math.min(
    (maxWidth - pad * 2) / image.naturalWidth,
    (maxHeight - pad - caption) / image.naturalHeight,
  );
  const iw = image.naturalWidth * scale;
  const ih = image.naturalHeight * scale;
  const w = iw + pad * 2;
  const h = ih + pad + caption;

  ctx.save();
  ctx.translate(center.x, center.y);
  ctx.rotate((degrees * Math.PI) / 180);
  ctx.shadowColor = "rgba(18, 18, 18, 0.28)";
  ctx.shadowBlur = 46;
  ctx.shadowOffsetY = 20;
  ctx.fillStyle = WHITE;
  roundRect(ctx, -w / 2, -h / 2, w, h, 26);
  ctx.fill();
  ctx.shadowColor = "transparent";

  ctx.save();
  roundRect(ctx, -iw / 2, -h / 2 + pad, iw, ih, 14);
  ctx.clip();
  ctx.drawImage(image, -iw / 2, -h / 2 + pad, iw, ih);
  ctx.restore();
  // A hairline around the sheet: a white drawing on a white card needs an edge.
  ctx.strokeStyle = "rgba(18, 18, 18, 0.12)";
  ctx.lineWidth = 1.5;
  roundRect(ctx, -iw / 2, -h / 2 + pad, iw, ih, 14);
  ctx.stroke();

  ctx.fillStyle = INK;
  ctx.textBaseline = "middle";
  const text = label.toLocaleUpperCase("ro");
  const font = (size: number) => `700 ${size}px ${sans}`;
  const size = fitFont(ctx, text, font, Math.round(caption * 0.4), w - pad * 3);
  ctx.font = font(size);
  trackedText(ctx, text, 0, h / 2 - caption / 2 + 1, size * 0.05, "center");
  ctx.restore();
  ctx.textBaseline = "alphabetic";
}

function drawQr(
  ctx: CanvasRenderingContext2D,
  url: string,
  x: number,
  y: number,
  size: number,
): void {
  const qr = QRCode.create(url, { errorCorrectionLevel: "M" });
  const count = qr.modules.size;
  const quiet = Math.round(size * 0.09);
  const cell = (size - quiet * 2) / count;
  ctx.fillStyle = WHITE;
  roundRect(ctx, x, y, size, size, 22);
  ctx.fill();
  ctx.fillStyle = INK;
  for (let row = 0; row < count; row += 1) {
    for (let col = 0; col < count; col += 1) {
      if (qr.modules.get(row, col)) {
        // Rounded to whole pixels with a hair of overlap: no seams between modules.
        const px = Math.floor(x + quiet + col * cell);
        const py = Math.floor(y + quiet + row * cell);
        ctx.fillRect(px, py, Math.ceil(cell + 0.5), Math.ceil(cell + 0.5));
      }
    }
  }
}

/** "https://app.originscafe.ro/desene/R-002" -> "app.originscafe.ro/desene/R-002". */
export function printableUrl(url: string): string {
  return url.replace(/^https?:\/\//i, "").replace(/^www\./i, "");
}

/** Every measurement of the two posters, in output pixels. */
const LAYOUT = {
  story: {
    logo: { top: 196, width: 204 },
    headline: { x: 92, baseline: 468, size: 104, indent: 170 },
    cup: { centerX: 722, top: 672, height: 668 },
    card: { x: 290, y: 1096, w: 446, h: 400, tilt: -6 },
    cardOnly: { x: 540, y: 1010, w: 840, h: 600, tilt: -3 },
    panel: { top: 1404, radius: 72 },
    qr: { x: 84, y: 1466, size: 188 },
    slot: { x: 308, y: 1508, w: 688, h: 96 },
    hint: { x: 308, y: 1490, size: 24 },
    url: { x: 308, y: 1648, size: 29, maxWidth: 688 },
    closes: { y: 1746, size: 28 },
  },
  post: {
    logo: { top: 52, width: 166 },
    headline: { x: 92, baseline: 270, size: 98, indent: 160 },
    cup: { centerX: 742, top: 452, height: 548 },
    card: { x: 292, y: 790, w: 416, h: 360, tilt: -6 },
    cardOnly: { x: 540, y: 740, w: 720, h: 470, tilt: -3 },
    panel: { top: 1058, radius: 64 },
    qr: { x: 84, y: 1100, size: 168 },
    slot: null,
    hint: null,
    url: { x: 290, y: 1158, size: 30, maxWidth: 706 },
    closes: { y: 1214, size: 26 },
  },
} as const;

export async function renderShareImage(input: ShareImageInput): Promise<Blob> {
  const { width, height } = SHARE_SIZES[input.format];
  const L = LAYOUT[input.format];
  const sans = fontFamily("--font-inter-tight", "system-ui, sans-serif");

  // Fonts must be in before the first fillText, diacritics included.
  await Promise.all([
    document.fonts.load(`800 100px ${sans}`, "VOTEAZĂ ȘȚÂÎ"),
    document.fonts.load(`300 100px ${sans}`, "COPILULUI ĂȘȚÂÎ"),
    document.fonts.load(`700 40px ${sans}`, "DESENUL ĂȘȚÂÎ"),
    document.fonts.load(`600 30px ${sans}`, "Votul se închide ăâîșț"),
  ]).catch(() => {});

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("share-image: no 2d canvas");

  ctx.fillStyle = WHITE;
  ctx.fillRect(0, 0, width, height);

  await drawLogo(ctx, width / 2, L.logo.top, L.logo.width);

  // Headline: first line 800, second line 300 and set off to the right.
  const line1 = input.text.headline1.toLocaleUpperCase("ro");
  const line2 = input.text.headline2.toLocaleUpperCase("ro");
  const room = width - L.headline.x * 2;
  const headSize = Math.min(
    fitFont(ctx, line1, (s) => `800 ${s}px ${sans}`, L.headline.size, room),
    fitFont(ctx, line2, (s) => `300 ${s}px ${sans}`, L.headline.size, room - L.headline.indent),
  );
  ctx.fillStyle = INK;
  ctx.textAlign = "left";
  ctx.font = `800 ${headSize}px ${sans}`;
  ctx.fillText(line1, L.headline.x, L.headline.baseline);
  ctx.font = `300 ${headSize}px ${sans}`;
  ctx.fillText(line2, L.headline.x + L.headline.indent, L.headline.baseline + headSize * 1.14);

  // The dark rounded panel that carries the link, as on the site.
  ctx.fillStyle = INK;
  ctx.beginPath();
  ctx.moveTo(0, height);
  ctx.lineTo(0, L.panel.top + L.panel.radius);
  ctx.arcTo(0, L.panel.top, L.panel.radius, L.panel.top, L.panel.radius);
  ctx.lineTo(width - L.panel.radius, L.panel.top);
  ctx.arcTo(width, L.panel.top, width, L.panel.top + L.panel.radius, L.panel.radius);
  ctx.lineTo(width, height);
  ctx.closePath();
  ctx.fill();

  const drawing = await loadImage(input.drawingUrl);

  if (input.cup.mode === "photo") {
    const photo = await loadImage(input.cup.url);
    const h = L.cup.height;
    const w = h * 0.8;
    const x = L.cup.centerX - w / 2;
    ctx.save();
    roundRect(ctx, x, L.cup.top, w, h, 40);
    ctx.clip();
    // Cover: the mockup is 4:5, the frame is 4:5; any other ratio is cropped centred.
    const scale = Math.max(w / photo.naturalWidth, h / photo.naturalHeight);
    const pw = photo.naturalWidth * scale;
    const ph = photo.naturalHeight * scale;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(photo, x + (w - pw) / 2, L.cup.top + (h - ph) / 2, pw, ph);
    ctx.restore();
    drawCard(ctx, drawing, input.label, sans, L.card, L.card.w, L.card.h, L.card.tilt);
  } else if (input.cup.mode === "cutout") {
    const cup = input.cup.canvas;
    const box = opaqueBox(cup);
    const scale = L.cup.height / box.h;
    const cw = box.w * scale;
    const cx = L.cup.centerX - cw / 2;

    // Contact shadow: the cup stands on the page, it does not float.
    ctx.save();
    ctx.shadowColor = "rgba(18, 18, 18, 0.4)";
    ctx.shadowBlur = 40;
    ctx.fillStyle = "rgba(18, 18, 18, 0.32)";
    ctx.beginPath();
    ctx.ellipse(L.cup.centerX, L.cup.top + L.cup.height - 6, cw * 0.36, 14, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(cup, box.x, box.y, box.w, box.h, cx, L.cup.top, cw, L.cup.height);
    drawCard(ctx, drawing, input.label, sans, L.card, L.card.w, L.card.h, L.card.tilt);
  } else {
    drawCard(ctx, drawing, input.label, sans, L.cardOnly, L.cardOnly.w, L.cardOnly.h, L.cardOnly.tilt);
  }

  drawQr(ctx, input.url, L.qr.x, L.qr.y, L.qr.size);

  if (L.slot && L.hint) {
    // An instruction for the parent, in plain words: not a label, not a tag.
    ctx.fillStyle = "rgba(255, 255, 255, 0.8)";
    ctx.textAlign = "left";
    ctx.font = `500 ${L.hint.size}px ${sans}`;
    ctx.fillText(input.text.linkHint, L.hint.x, L.hint.y);
    // The empty place for Instagram's link sticker: outlined, never filled.
    ctx.save();
    ctx.strokeStyle = "rgba(255, 255, 255, 0.6)";
    ctx.lineWidth = 3;
    ctx.setLineDash([16, 12]);
    roundRect(ctx, L.slot.x, L.slot.y, L.slot.w, L.slot.h, L.slot.h / 2);
    ctx.stroke();
    ctx.restore();
  }

  const link = printableUrl(input.url);
  ctx.fillStyle = WHITE;
  ctx.textAlign = "left";
  const urlSize = fitFont(ctx, link, (s) => `600 ${s}px ${sans}`, L.url.size, L.url.maxWidth);
  ctx.font = `600 ${urlSize}px ${sans}`;
  ctx.fillText(link, L.url.x, L.url.y);

  const closing =
    input.format === "story"
      ? { align: "center" as const, x: width / 2 }
      : { align: "left" as const, x: L.url.x };
  ctx.textAlign = closing.align;
  ctx.fillStyle = WHITE;
  ctx.font = `600 ${L.closes.size}px ${sans}`;
  ctx.fillText(input.text.closes, closing.x, L.closes.y);

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/jpeg", 0.92),
  );
  if (!blob) throw new Error("share-image: could not export");
  return blob;
}
