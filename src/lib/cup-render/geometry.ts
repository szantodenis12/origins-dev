/**
 * Cup render, the geometry. Pure functions, no DOM: `node --test` imports this.
 *
 * Three spaces, in the order a pixel travels through them:
 *
 *   photo    pixels of the blank-cup photo. The visible wall is the band between
 *            two half ellipses (under the lid, at the base) and the two silhouette
 *            lines; all four come from the measured `CupPhoto`.
 *   wall     where on the real cup that pixel sits: `angle` around the cup
 *            (0 = dead centre front, ±π/2 = the silhouettes) and `v` down the
 *            visible wall (0 under the lid, 1 at the base).
 *   artwork  the flat print file, in millimetres: the cup wall unrolled into a
 *            sector of a ring, exactly as `06_Cup_Design/build_pahar.py` draws it
 *            (origin at the apex of the cone, y pointing down, wall centred on
 *            the negative y axis). Everything printed lives here: the drawing
 *            bent onto the fan, the green tab with the white logo hanging from
 *            the top, the small green tab with the label rising from the base.
 *            Because the tabs are built on the sector, they curve with the cone
 *            on the cup exactly as they will when printed.
 */

export type Ellipse = {
  /** Centre, photo pixels. */
  cx: number;
  cy: number;
  /** Half width and half height. The visible edge is the lower half. */
  a: number;
  b: number;
};

/** What `tools/measure_cup.py` writes to `public/cup/<name>.json`. */
export type CupPhoto = {
  photo: string;
  mask: string;
  /** Lid + cup silhouette, for the transparent cut-out. Optional. */
  cutout?: string;
  width: number;
  height: number;
  /** Edge of the visible wall under the lid. */
  top: Ellipse;
  /** Edge of the visible wall at the base. */
  bottom: Ellipse;
  /** The brightest paper on the wall, sRGB 0-255. */
  paperWhite: [number, number, number];
  /** Lid + cup, the box the crop is built around. */
  subject: { x0: number; y0: number; x1: number; y1: number };
};

/** The cup itself, in millimetres. Same names and values as build_pahar.py. */
export type CupDims = {
  topDiameter: number;
  bottomDiameter: number;
  /** Vertical height of the wall, not the slant. */
  wallHeight: number;
  /** Unprinted band at the top of the blank (glue / rolled lip): never seen. */
  topBand: number;
  /** Glue flap at the back, where the two ends of the wrap meet. */
  seam: number;
  bleed: number;
  /** Logo and text stay this far inside the visible limit. */
  safe: number;
  /**
   * Slant millimetres of wall that the photo does not show: under the lid at
   * the top, and at the base (0 = the wall is visible down to the table).
   */
  hiddenTop: number;
  hiddenBottom: number;
};

/**
 * 12 oz single-wall cup: rim Ø 90, base Ø 60, height 110 mm, 3 mm bleed.
 * CONFIRMED by the supplier's dieline (10.11.2026); the same numbers the print
 * template (build_pahar.py) is built on. The glue seam is at the back, so the
 * wrap meets behind the cup and the logo sits dead centre at the front.
 *
 * The supplier's flat blank measures 270 (top) x 192 (bottom) x 128 mm deep; an
 * ideal cone with these diameters unrolls to about 274 x 183 x 131. The few
 * millimetres of difference are not visible in a render, but the print file
 * must be built on the supplier's dieline itself, not on this cone.
 *
 * Still an estimate: hiddenTop, how far the lid covers the wall in the photo.
 * A different cup = a new object of this type.
 */
export const CUP_DIMS_12OZ: CupDims = {
  topDiameter: 90,
  bottomDiameter: 60,
  wallHeight: 110,
  topBand: 6,
  seam: 8,
  bleed: 3,
  safe: 4,
  hiddenTop: 6,
  hiddenBottom: 0,
};

/**
 * Layout v2 (Roland, 10.11.2026): what is printed besides the drawing. All in
 * millimetres on the flat blank; build_pahar.py carries the same numbers.
 */
export type CupLayout = {
  /** Flat brand green, one CMYK fill in print. */
  green: string;
  /** Hangs from the top of the visible wall, centred front, white logo inside. */
  topTab: {
    /** Arc length along the visible top edge. */
    width: number;
    /** Depth below the visible top edge. */
    height: number;
    /** Radius of the two bottom corners. */
    radius: number;
    logoWidth: number;
    /** Top of the logo below the visible top edge; at least `safe`. */
    logoTop: number;
  };
  /** Rises from the base, centred front, „• CRĂCIUN 2026 •” in white. */
  bottomTab: {
    width: number;
    height: number;
    radius: number;
    fontSize: number;
    /** Letter spacing, in em. */
    tracking: number;
    /** Baseline above the visible bottom edge; at least `safe`. */
    baseline: number;
  };
  /** Optional line at the back of the wrap, ending before the seam. */
  attribution: { fontSize: number; baseline: number; endBeforeSeam: number };
};

export const CUP_LAYOUT_V2: CupLayout = {
  green: "#1F4D3A",
  topTab: { width: 42, height: 26, radius: 6, logoWidth: 31, logoTop: 4.6 },
  bottomTab: { width: 36, height: 10.4, radius: 4, fontSize: 4.3, tracking: 0.07, baseline: 4.2 },
  attribution: { fontSize: 2.6, baseline: 5, endBeforeSeam: 8 },
};

export type Sector = {
  /** Radius of the top edge and of the bottom edge of the unrolled wall. */
  rOuter: number;
  rInner: number;
  /** Slant length of the wall. */
  slant: number;
  /** Full opening angle of the sector, radians: one turn around the cup. */
  theta: number;
};

/** The unrolled wall of a truncated cone. */
export function sectorOf(dims: CupDims): Sector {
  const r1 = dims.topDiameter / 2;
  const r2 = dims.bottomDiameter / 2;
  if (!(r1 > r2)) throw new Error("cup-render: the cup must be wider at the top");
  const slant = Math.hypot(dims.wallHeight, r1 - r2);
  const rOuter = (r1 * slant) / (r1 - r2);
  return { rOuter, rInner: rOuter - slant, slant, theta: (2 * Math.PI * r1) / rOuter };
}

export type Box = { x: number; y: number; w: number; h: number };

/**
 * Bounding box of the sector plus bleed, in artwork millimetres: the size of
 * the artwork bitmap. With the 12 oz numbers it is about 281 x 137 mm.
 */
export function artworkBox(dims: CupDims, sector: Sector = sectorOf(dims)): Box {
  const ro = sector.rOuter + dims.bleed;
  const ri = sector.rInner - dims.bleed;
  const half = sector.theta / 2 + dims.bleed / sector.rOuter;
  const xMax = ro * Math.sin(half);
  const yTop = -ro;
  const yBottom = -ri * Math.cos(half);
  return { x: -xMax, y: yTop, w: 2 * xMax, h: yBottom - yTop };
}

/** Radius of the top and of the bottom of what is seen on the formed cup. */
export function visibleRadii(dims: CupDims, sector: Sector = sectorOf(dims)): { top: number; bottom: number } {
  return { top: sector.rOuter - dims.topBand, bottom: sector.rInner };
}

/** Polar point of the blank to artwork millimetres. */
export function polar(r: number, angle: number): { x: number; y: number } {
  return { x: r * Math.sin(angle), y: -r * Math.cos(angle) };
}

/**
 * Outline of a tab, as a closed polygon in artwork millimetres. A tab is a
 * rounded rectangle drawn in (arc length, depth) on the wall and then bent onto
 * the sector: its sides run down the cone, its free edge follows the cup's
 * circumference. It starts `bleed` beyond the visible limit, so it hangs from
 * the edge with no gap, and only the two free corners are rounded.
 */
export function tabOutline(
  which: "top" | "bottom",
  dims: CupDims,
  layout: CupLayout = CUP_LAYOUT_V2,
  sector: Sector = sectorOf(dims),
): { x: number; y: number }[] {
  const vis = visibleRadii(dims, sector);
  const tab = which === "top" ? layout.topTab : layout.bottomTab;
  const edge = which === "top" ? vis.top : vis.bottom;
  const dir = which === "top" ? -1 : 1; // depth runs away from the edge, into the wall
  const half = tab.width / 2;
  const rad = Math.min(tab.radius, half, tab.height);
  const local: [number, number][] = [];
  const line = (s0: number, h0: number, s1: number, h1: number) => {
    const n = Math.max(1, Math.ceil(Math.hypot(s1 - s0, h1 - h0)));
    for (let i = 0; i < n; i++) local.push([s0 + ((s1 - s0) * i) / n, h0 + ((h1 - h0) * i) / n]);
  };
  const corner = (cs: number, ch: number, from: number) => {
    for (let i = 0; i < 12; i++) {
      const t = from + (i / 12) * (Math.PI / 2);
      local.push([cs + rad * Math.cos(t), ch + rad * Math.sin(t)]);
    }
  };
  // (s, h): s across, h = depth; clockwise from the attached edge, left side first
  line(half, -dims.bleed, half, tab.height - rad);
  corner(half - rad, tab.height - rad, 0);
  line(half - rad, tab.height, -(half - rad), tab.height);
  corner(-(half - rad), tab.height - rad, Math.PI / 2);
  line(-half, tab.height - rad, -half, -dims.bleed);
  line(-half, -dims.bleed, half, -dims.bleed);
  return local.map(([sArc, h]) => polar(edge + dir * h, sArc / edge));
}

/** Where the white logo sits in the top tab: its box in artwork millimetres. */
export function logoBox(
  aspect: number,
  dims: CupDims,
  layout: CupLayout = CUP_LAYOUT_V2,
  sector: Sector = sectorOf(dims),
): Box {
  const w = layout.topTab.logoWidth;
  return { x: -w / 2, y: -(visibleRadii(dims, sector).top - layout.topTab.logoTop), w, h: w / aspect };
}

const lerp = (p: number, q: number, t: number) => p + (q - p) * t;

/** The cross-section of the wall at height `v` (0 under the lid, 1 at the base). */
export function ellipseAt(photo: CupPhoto, v: number): Ellipse {
  const { top, bottom } = photo;
  return {
    cx: lerp(top.cx, bottom.cx, v),
    cy: lerp(top.cy, bottom.cy, v),
    a: lerp(top.a, bottom.a, v),
    b: lerp(top.b, bottom.b, v),
  };
}

/** Wall to photo: where a point of the cup lands in the picture. */
export function wallToPhoto(photo: CupPhoto, angle: number, v: number): { x: number; y: number } {
  const e = ellipseAt(photo, v);
  return { x: e.cx + e.a * Math.sin(angle), y: e.cy + e.b * Math.cos(angle) };
}

/** y of the visible edge at height v, in the pixel column x. Rises with v. */
function edgeY(photo: CupPhoto, x: number, v: number): number {
  const { top, bottom } = photo;
  const a = lerp(top.a, bottom.a, v);
  const t = (x - lerp(top.cx, bottom.cx, v)) / a;
  const c = t * t >= 1 ? 0 : Math.sqrt(1 - t * t);
  return lerp(top.cy, bottom.cy, v) + lerp(top.b, bottom.b, v) * c;
}

/**
 * Photo to wall: which point of the cup a pixel shows, or null when the pixel
 * is off the wall. `angle` is asin of the position across the silhouette, which
 * is what squeezes the print toward the edges.
 */
export function photoToWall(photo: CupPhoto, x: number, y: number): { angle: number; v: number } | null {
  if (y < edgeY(photo, x, 0) || y > edgeY(photo, x, 1)) return null;
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 18; i++) {
    const mid = (lo + hi) / 2;
    if (edgeY(photo, x, mid) < y) lo = mid;
    else hi = mid;
  }
  const v = (lo + hi) / 2;
  const e = ellipseAt(photo, v);
  const t = (x - e.cx) / e.a;
  if (t <= -1 || t >= 1) return null;
  return { angle: Math.asin(t), v };
}

/**
 * Wall to artwork, millimetres. `angle` is around the cup, so a full turn
 * (2π) spans the whole sector angle; `v` runs over the visible part of the
 * slant only.
 */
export function wallToArtwork(
  dims: CupDims,
  angle: number,
  v: number,
  sector: Sector = sectorOf(dims),
): { x: number; y: number } {
  const visible = sector.slant - dims.hiddenTop - dims.hiddenBottom;
  const r = sector.rOuter - dims.hiddenTop - v * visible;
  return polar(r, (angle * sector.theta) / (2 * Math.PI));
}

/**
 * Turning the cup by `degrees` is a rotation of the flat artwork about the
 * apex. Returns the cos/sin of that small artwork angle.
 */
export function rotationOf(dims: CupDims, degrees: number, sector: Sector = sectorOf(dims)): { cos: number; sin: number } {
  const delta = ((degrees * Math.PI) / 180) * (sector.theta / (2 * Math.PI));
  return { cos: Math.cos(delta), sin: Math.sin(delta) };
}

/** The drag is limited so the seam at the back never comes into view. */
export const MAX_ROTATION_DEG = 40;

export function clampRotation(degrees: number): number {
  if (!Number.isFinite(degrees)) return 0;
  return Math.max(-MAX_ROTATION_DEG, Math.min(MAX_ROTATION_DEG, degrees));
}

/**
 * The part of the photo that becomes the output image: the lid and cup fill
 * `fill` of the output height, centred, and the crop never leaves the photo.
 */
export function cropFor(photo: CupPhoto, outWidth: number, outHeight: number, fill = 0.62): Box {
  const s = photo.subject;
  const subjectH = s.y1 - s.y0;
  // output pixels per photo pixel; never so small that the crop outgrows the photo
  const scale = Math.max((fill * outHeight) / subjectH, outWidth / photo.width, outHeight / photo.height);
  const w = outWidth / scale;
  const h = outHeight / scale;
  const x = Math.min(Math.max((s.x0 + s.x1) / 2 - w / 2, 0), photo.width - w);
  const y = Math.min(Math.max((s.y0 + s.y1) / 2 - h / 2, 0), photo.height - h);
  return { x, y, w, h };
}

/**
 * The lookup the painter runs on: for every sample of the output that lies on
 * the wall, the artwork millimetre it shows (at rotation 0). `ss` samples per
 * output pixel in each direction. Off-wall samples are NaN.
 */
export type WarpMap = {
  /** Output-pixel rectangle that contains the wall. */
  x0: number;
  y0: number;
  w: number;
  h: number;
  ss: number;
  /** (w*ss) x (h*ss) each, row-major. */
  ax: Float32Array;
  ay: Float32Array;
};

export function buildWarpMap(
  photo: CupPhoto,
  dims: CupDims,
  crop: Box,
  outWidth: number,
  outHeight: number,
  ss = 2,
): WarpMap {
  const sector = sectorOf(dims);
  const sx = outWidth / crop.w;
  const sy = outHeight / crop.h;
  const { top, bottom } = photo;
  const px0 = Math.min(top.cx - top.a, bottom.cx - bottom.a);
  const px1 = Math.max(top.cx + top.a, bottom.cx + bottom.a);
  const py0 = Math.min(top.cy, bottom.cy);
  const py1 = Math.max(top.cy + top.b, bottom.cy + bottom.b);
  const x0 = Math.max(0, Math.floor((px0 - crop.x) * sx) - 1);
  const y0 = Math.max(0, Math.floor((py0 - crop.y) * sy) - 1);
  const x1 = Math.min(outWidth, Math.ceil((px1 - crop.x) * sx) + 1);
  const y1 = Math.min(outHeight, Math.ceil((py1 - crop.y) * sy) + 1);
  const w = Math.max(0, x1 - x0);
  const h = Math.max(0, y1 - y0);
  const mw = w * ss;
  const mh = h * ss;
  const ax = new Float32Array(mw * mh).fill(NaN);
  const ay = new Float32Array(mw * mh).fill(NaN);
  for (let j = 0; j < mh; j++) {
    const py = crop.y + (y0 + (j + 0.5) / ss) / sy;
    for (let i = 0; i < mw; i++) {
      const px = crop.x + (x0 + (i + 0.5) / ss) / sx;
      const wall = photoToWall(photo, px, py);
      if (!wall) continue;
      const p = wallToArtwork(dims, wall.angle, wall.v, sector);
      ax[j * mw + i] = p.x;
      ay[j * mw + i] = p.y;
    }
  }
  return { x0, y0, w, h, ss, ax, ay };
}
