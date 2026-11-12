import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  CUP_DIMS_12OZ,
  CUP_LAYOUT_V2,
  MAX_ROTATION_DEG,
  artworkBox,
  buildWarpMap,
  clampRotation,
  cropFor,
  ellipseAt,
  logoBox,
  photoToWall,
  rotationOf,
  sectorOf,
  tabOutline,
  visibleRadii,
  wallToArtwork,
  wallToPhoto,
} from "../src/lib/cup-render/geometry.ts";
import { paintCup } from "../src/lib/cup-render/paint.ts";

/**
 * The drawing on the cup. What must hold, whatever photo or cup size is
 * swapped in later: the middle of the cup shows the middle of the print, the
 * silhouettes show a quarter turn to each side, nothing folds over itself, and
 * white artwork leaves the photo exactly as it was.
 */

const photo = JSON.parse(readFileSync(new URL("../public/cup/cup-blank.json", import.meta.url), "utf8"));
const dims = CUP_DIMS_12OZ;
const near = (a, b, eps, msg) => assert.ok(Math.abs(a - b) <= eps, `${msg ?? ""} ${a} vs ${b}`);

test("the unrolled wall matches the print template (build_pahar.py)", () => {
  const s = sectorOf(dims);
  near(s.rOuter, 333.1, 0.05);
  near(s.rInner, 222.0, 0.05);
  near((s.theta * 180) / Math.PI, 48.6, 0.05);
  near(s.rOuter * s.theta, Math.PI * dims.topDiameter, 1e-9, "top arc = top circumference");
  near(s.rInner * s.theta, Math.PI * dims.bottomDiameter, 1e-9, "bottom arc = bottom circumference");
  const box = artworkBox(dims);
  near(box.x + box.w / 2, 0, 1e-9, "artwork is centred on the logo axis");
  assert.ok(box.w > 270 && box.w < 290 && box.h > 125 && box.h < 145, "about the supplier's blank");
});

test("layout v2: both tabs sit centred front, on the wall, and curve with the cone", () => {
  const s = sectorOf(dims);
  const vis = visibleRadii(dims);
  const L = CUP_LAYOUT_V2;
  near(vis.top, s.rOuter - dims.topBand, 1e-9);
  near(vis.bottom, s.rInner, 1e-9);
  for (const which of ["top", "bottom"]) {
    const tab = which === "top" ? L.topTab : L.bottomTab;
    const edge = which === "top" ? vis.top : vis.bottom;
    const pts = tabOutline(which, dims).map((p) => ({ r: Math.hypot(p.x, p.y), a: Math.atan2(p.x, -p.y) }));
    const rs = pts.map((p) => p.r);
    const as = pts.map((p) => p.a);
    near(Math.max(...as), tab.width / 2 / edge, 1e-6, "sides run down the cone (constant angle)");
    near(Math.min(...as), -tab.width / 2 / edge, 1e-6, "symmetric about the logo axis");
    if (which === "top") {
      near(Math.max(...rs), vis.top + dims.bleed, 1e-6, "hangs from beyond the visible top");
      near(Math.min(...rs), vis.top - tab.height, 1e-6, "free edge follows the circumference");
    } else {
      near(Math.min(...rs), vis.bottom - dims.bleed, 1e-6, "rises from beyond the visible base");
      near(Math.max(...rs), vis.bottom + tab.height, 1e-6);
    }
    // on the cup: how much of the front the tab takes
    const turn = ((tab.width / 2 / edge) * 2 * Math.PI) / s.theta;
    assert.ok(turn < Math.PI / 2, "fully in view from the front");
  }
  const frontShare = Math.sin(((L.topTab.width / 2 / vis.top) * 2 * Math.PI) / s.theta);
  assert.ok(frontShare > 0.4 && frontShare < 0.5, `top tab is about 45% of the front width (${frontShare})`);
  assert.ok(L.bottomTab.width < L.topTab.width && L.bottomTab.height < L.topTab.height, "the bottom tab is the smaller one");
});

test("layout v2: logo and label keep the supplier's 4 mm safe margin, inside the green", () => {
  const vis = visibleRadii(dims);
  const L = CUP_LAYOUT_V2;
  const lb = logoBox(320.29 / 169.85, dims);
  near(lb.x + lb.w / 2, 0, 1e-9, "logo centred");
  assert.ok(vis.top - -lb.y >= dims.safe, "logo top at least 4 mm under the visible limit");
  assert.ok(lb.h + L.topTab.logoTop + 3 <= L.topTab.height, "logo ends at least 3 mm above the tab's edge");
  const sideAtLogoBottom = ((vis.top - L.topTab.logoTop - lb.h) / vis.top) * (L.topTab.width / 2);
  assert.ok(sideAtLogoBottom - lb.w / 2 >= 3, "at least 3 mm of green left and right of the logo");
  assert.ok(L.bottomTab.baseline >= dims.safe, "label baseline at least 4 mm above the base");
  assert.ok(L.bottomTab.baseline + L.bottomTab.fontSize * 0.75 + 2 <= L.bottomTab.height, "caps end 2 mm under the tab's edge");
  assert.ok((L.bottomTab.fontSize / 25.4) * 72 > 10 && (L.attribution.fontSize / 25.4) * 72 > 6, "text well above 6 pt");
  assert.ok(L.attribution.baseline >= dims.safe);
});

test("the measured photo is sane", () => {
  for (const e of [photo.top, photo.bottom]) {
    assert.ok(e.a > 0 && e.b > 0 && e.b < e.a);
    assert.ok(e.cx - e.a >= 0 && e.cx + e.a <= photo.width);
  }
  assert.ok(photo.bottom.cy > photo.top.cy, "base below the lid");
  assert.ok(photo.top.a > photo.bottom.a, "wider at the top");
});

test("cross-sections interpolate between the two measured ellipses", () => {
  assert.deepEqual(ellipseAt(photo, 0), photo.top);
  assert.deepEqual(ellipseAt(photo, 1), photo.bottom);
  const mid = ellipseAt(photo, 0.5);
  for (const k of ["cx", "cy", "a", "b"]) near(mid[k], (photo.top[k] + photo.bottom[k]) / 2, 1e-9, k);
});

test("centre of the cup shows the centre of the wrap, the silhouettes a quarter turn", () => {
  for (const v of [0.1, 0.5, 0.9]) {
    const e = ellipseAt(photo, v);
    const centre = photoToWall(photo, e.cx, e.cy + e.b);
    near(centre.angle, 0, 1e-6);
    near(centre.v, v, 1e-4);
    const left = photoToWall(photo, e.cx - e.a * 0.999999, e.cy + 0.01);
    const right = photoToWall(photo, e.cx + e.a * 0.999999, e.cy + 0.01);
    // a hair inside the silhouette line: the wrap is within a few degrees of the quarter turn
    near(left.angle, -Math.PI / 2, 0.1);
    near(right.angle, Math.PI / 2, 0.1);
  }
});

test("photo -> wall -> photo is the identity, and off-wall pixels are refused", () => {
  for (const angle of [-1.4, -0.7, 0, 0.3, 1.2]) {
    for (const v of [0.02, 0.4, 0.77, 0.98]) {
      const p = wallToPhoto(photo, angle, v);
      const w = photoToWall(photo, p.x, p.y);
      near(w.angle, angle, 1e-3);
      near(w.v, v, 1e-4);
    }
  }
  const { top, bottom } = photo;
  assert.equal(photoToWall(photo, top.cx, top.cy + top.b - 3), null, "the lid");
  assert.equal(photoToWall(photo, bottom.cx, bottom.cy + bottom.b + 3), null, "the table");
  assert.equal(photoToWall(photo, top.cx - top.a - 3, (top.cy + bottom.cy) / 2), null, "left of the cup");
  assert.equal(photoToWall(photo, top.cx + top.a + 3, top.cy + 5), null, "right of the cup");
});

test("across a row the wrap only ever advances, and squeezes toward the edges", () => {
  const e = ellipseAt(photo, 0.5);
  const y = e.cy + e.b * 0.5;
  let last = -Infinity;
  const xs = [];
  for (let x = Math.ceil(e.cx - e.a) + 2; x < e.cx + e.a - 2; x += 1) {
    const w = photoToWall(photo, x, y);
    if (!w) continue;
    const a = wallToArtwork(dims, w.angle, w.v);
    assert.ok(a.x > last, `artwork x must grow with photo x (at ${x})`);
    last = a.x;
    xs.push(a.x);
  }
  const mid = Math.floor(xs.length / 2);
  const stepCentre = xs[mid + 1] - xs[mid];
  const stepEdge = xs[2] - xs[1];
  assert.ok(stepEdge > stepCentre * 2, "a pixel near the silhouette spans more print than one in the middle");
});

test("down a column the wrap only ever descends", () => {
  const { top, bottom } = photo;
  let last = -Infinity;
  for (let y = top.cy + top.b + 1; y < bottom.cy + bottom.b - 1; y += 3) {
    const w = photoToWall(photo, top.cx, y);
    assert.ok(w.v > last);
    last = w.v;
  }
});

test("the visible half is the middle half of the print, inside the hidden rim", () => {
  const s = sectorOf(dims);
  const topCentre = wallToArtwork(dims, 0, 0);
  near(topCentre.x, 0, 1e-9);
  near(-topCentre.y, s.rOuter - dims.hiddenTop, 1e-9);
  const baseCentre = wallToArtwork(dims, 0, 1);
  near(-baseCentre.y, s.rInner + dims.hiddenBottom, 1e-9);
  const edge = wallToArtwork(dims, Math.PI / 2, 0);
  near(Math.atan2(edge.x, -edge.y), s.theta / 4, 1e-9, "a quarter turn of the cup = a quarter of the sector");
  const box = artworkBox(dims);
  for (const angle of [-Math.PI / 2, Math.PI / 2])
    for (const v of [0, 1]) {
      const p = wallToArtwork(dims, angle, v);
      assert.ok(p.x > box.x && p.x < box.x + box.w && p.y > box.y && p.y < box.y + box.h);
    }
});

test("rotation is clamped and stays on the printed sector", () => {
  assert.equal(clampRotation(999), MAX_ROTATION_DEG);
  assert.equal(clampRotation(-999), -MAX_ROTATION_DEG);
  assert.equal(clampRotation(NaN), 0);
  const s = sectorOf(dims);
  const r = rotationOf(dims, MAX_ROTATION_DEG);
  const p = wallToArtwork(dims, Math.PI / 2, 0);
  const x = p.x * r.cos - p.y * r.sin;
  const y = p.x * r.sin + p.y * r.cos;
  assert.ok(Math.abs(Math.atan2(x, -y)) < s.theta / 2, "the seam at the back never turns into view");
  near(rotationOf(dims, 0).cos, 1, 1e-12);
});

test("the crop keeps the whole cup and never leaves the photo", () => {
  for (const [w, h] of [[1080, 1350], [1200, 630], [1080, 1080], [540, 675]]) {
    const c = cropFor(photo, w, h);
    assert.ok(c.x >= 0 && c.y >= 0 && c.x + c.w <= photo.width + 1e-6 && c.y + c.h <= photo.height + 1e-6);
    near(c.w / c.h, w / h, 1e-9);
    const s = photo.subject;
    assert.ok(c.x <= s.x0 && c.x + c.w >= s.x1 && c.y <= s.y0 && c.y + c.h >= s.y1, `${w}x${h} holds the cup`);
  }
});

function scene(w, h, ss) {
  const crop = cropFor(photo, w, h);
  const map = buildWarpMap(photo, dims, crop, w, h, ss);
  const base = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) base.set([200, 190, 180, 255], i * 4);
  const mask = new Uint8Array(w * h).fill(255);
  return { crop, map, base, mask };
}

test("the warp map covers the wall and nothing else", () => {
  const w = 216;
  const h = 270;
  const { crop, map } = scene(w, h, 1);
  assert.ok(map.w > 0 && map.h > 0 && map.x0 + map.w <= w && map.y0 + map.h <= h);
  const sx = w / crop.w;
  const at = (px, py) => {
    const i = Math.floor((px - crop.x) * sx) - map.x0;
    const j = Math.floor((py - crop.y) * sx) - map.y0;
    return map.ax[j * map.w + i];
  };
  const { top, bottom } = photo;
  const midY = (top.cy + top.b + bottom.cy + bottom.b) / 2;
  near(at(top.cx, midY), 0, 1.5, "centre column = centre of the artwork (mm)");
  assert.ok(Number.isNaN(map.ax[0]), "the corner of the box is off the wall");
  assert.ok(at(top.cx - 60, midY) < 0 && at(top.cx + 60, midY) > 0);
});

test("white artwork leaves the photo untouched; ink darkens, never brightens past the sheen", () => {
  const w = 108;
  const h = 135;
  const { map, base, mask } = scene(w, h, 2);
  const box = artworkBox(dims);
  const mk = (rgb) => {
    const data = new Uint8ClampedArray(64 * 32 * 4);
    for (let i = 0; i < 64 * 32; i++) data.set([...rgb, 255], i * 4);
    return { data, width: 64, height: 32, box };
  };
  const common = { base, width: w, height: h, mask, map, rotation: rotationOf(dims, 0), paperWhite: photo.paperWhite };

  const white = new Uint8ClampedArray(base.length);
  paintCup({ ...common, out: white, artwork: mk([255, 255, 255]) });
  assert.deepEqual(white, base);

  const black = new Uint8ClampedArray(base.length);
  paintCup({ ...common, out: black, artwork: mk([0, 0, 0]) });
  const centre = ((map.y0 + (map.h >> 1)) * w + map.x0 + (map.w >> 1)) * 4;
  assert.ok(black[centre] < 60 && black[centre] > 0, "black ink is dark but not a hole");
  assert.deepEqual([...black.slice(0, 4)], [200, 190, 180, 255], "outside the wall nothing changes");

  const masked = new Uint8ClampedArray(base.length);
  paintCup({ ...common, mask: new Uint8Array(w * h), out: masked, artwork: mk([0, 0, 0]) });
  assert.deepEqual(masked, base, "the mask keeps the print off whatever stands in front of the cup");
});
