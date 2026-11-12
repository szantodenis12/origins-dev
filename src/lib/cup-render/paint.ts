/**
 * Cup render, the pixels. Pure typed-array code, no DOM: the browser hands it
 * ImageData buffers, `node --test` hands it plain arrays.
 *
 * The print is not pasted over the photo, it is MULTIPLIED into it: ink only
 * ever darkens paper, so every shadow, the falloff toward the dark side, the
 * lid's shadow and the paper grain of the photo stay on top of the drawing.
 * Where the artwork is white the photo is untouched, which is also why the
 * edge of the print cannot show as a seam.
 */
import type { Box, WarpMap } from "./geometry.ts";

export type Look = {
  /** 1 = pure black ink swallows all light. Real ink on cup board does not. */
  inkDensity: number;
  /** Colour kept by the print, 1 = as scanned. Cup board dulls CMYK a little. */
  saturation: number;
  /** How much of the photo's highlight comes back on top of dark ink (screen). */
  sheen: number;
  /** The sheen starts at this fraction of paper white and is full at white. */
  sheenFrom: number;
};

export const DEFAULT_LOOK: Look = { inkDensity: 0.965, saturation: 0.93, sheen: 0.05, sheenFrom: 0.55 };

export type Artwork = {
  /** RGBA, row-major, `width` x `height`. */
  data: Uint8ClampedArray | Uint8Array;
  width: number;
  height: number;
  /** The millimetre box the bitmap covers (see `artworkBox`). */
  box: Box;
};

export type PaintInput = {
  /** RGBA of the cropped blank photo at output size. Not modified. */
  base: Uint8ClampedArray | Uint8Array;
  /** RGBA output buffer, same size as `base`. May be the same array. */
  out: Uint8ClampedArray | Uint8Array;
  width: number;
  height: number;
  /** Wall mask at output size, one byte per pixel (255 = paper). */
  mask: Uint8Array | Uint8ClampedArray;
  map: WarpMap;
  artwork: Artwork;
  /** cos/sin from `rotationOf`. */
  rotation: { cos: number; sin: number };
  paperWhite: [number, number, number];
  look?: Look;
};

/** Multiply the warped artwork into the photo. Touches only the wall's box. */
export function paintCup(input: PaintInput): void {
  const { base, out, width, mask, map, artwork, rotation, paperWhite } = input;
  const look = input.look ?? DEFAULT_LOOK;
  if (out !== base) out.set(base);
  const { ss, ax, ay } = map;
  const mw = map.w * ss;
  const n = ss * ss;
  const tex = artwork.data;
  const tw = artwork.width;
  const th = artwork.height;
  const kx = tw / artwork.box.w;
  const ky = th / artwork.box.h;
  const bx = artwork.box.x;
  const by = artwork.box.y;
  const { cos, sin } = rotation;
  const whiteLum = 0.299 * paperWhite[0] + 0.587 * paperWhite[1] + 0.114 * paperWhite[2];
  const sheenSpan = Math.max(1e-6, 1 - look.sheenFrom);

  for (let y = 0; y < map.h; y++) {
    for (let x = 0; x < map.w; x++) {
      const o = (y + map.y0) * width + (x + map.x0);
      const m = mask[o];
      if (m === 0) continue;
      // average the ink over the sub-samples; a sample off the wall prints nothing
      let r = 0;
      let g = 0;
      let b = 0;
      for (let sj = 0; sj < ss; sj++) {
        let k = (y * ss + sj) * mw + x * ss;
        for (let si = 0; si < ss; si++, k++) {
          const mx = ax[k];
          if (mx !== mx) {
            r += 255;
            g += 255;
            b += 255;
            continue;
          }
          const my = ay[k];
          // turn the cup = rotate the flat artwork about the apex
          const u = (mx * cos - my * sin - bx) * kx - 0.5;
          const v = (mx * sin + my * cos - by) * ky - 0.5;
          if (u < 0 || v < 0 || u > tw - 1 || v > th - 1) {
            r += 255;
            g += 255;
            b += 255;
            continue;
          }
          const u0 = u | 0;
          const v0 = v | 0;
          const fu = u - u0;
          const fv = v - v0;
          const u1 = u0 + 1 < tw ? u0 + 1 : u0;
          const v1 = v0 + 1 < th ? v0 + 1 : v0;
          const p00 = (v0 * tw + u0) << 2;
          const p10 = (v0 * tw + u1) << 2;
          const p01 = (v1 * tw + u0) << 2;
          const p11 = (v1 * tw + u1) << 2;
          const w00 = (1 - fu) * (1 - fv);
          const w10 = fu * (1 - fv);
          const w01 = (1 - fu) * fv;
          const w11 = fu * fv;
          r += tex[p00] * w00 + tex[p10] * w10 + tex[p01] * w01 + tex[p11] * w11;
          g += tex[p00 + 1] * w00 + tex[p10 + 1] * w10 + tex[p01 + 1] * w01 + tex[p11 + 1] * w11;
          b += tex[p00 + 2] * w00 + tex[p10 + 2] * w10 + tex[p01 + 2] * w01 + tex[p11 + 2] * w11;
        }
      }
      const cover = (m / 255) * look.inkDensity;
      r /= 255 * n;
      g /= 255 * n;
      b /= 255 * n;
      const grey = (0.299 * r + 0.587 * g + 0.114 * b) * (1 - look.saturation);
      // ink as a 0..1 filter, 1 = bare paper
      const ir = 1 - cover * (1 - (grey + r * look.saturation));
      const ig = 1 - cover * (1 - (grey + g * look.saturation));
      const ib = 1 - cover * (1 - (grey + b * look.saturation));
      const p = o << 2;
      const pr = base[p];
      const pg = base[p + 1];
      const pb = base[p + 2];
      // highlight of the photo, screened back over the ink in proportion to how dark the ink is
      const lum = (0.299 * pr + 0.587 * pg + 0.114 * pb) / whiteLum;
      let hl = (lum - look.sheenFrom) / sheenSpan;
      hl = hl <= 0 ? 0 : hl >= 1 ? 1 : hl * hl * (3 - 2 * hl);
      const s = look.sheen * hl * 255;
      out[p] = pr * ir + s * (1 - ir);
      out[p + 1] = pg * ig + s * (1 - ig);
      out[p + 2] = pb * ib + s * (1 - ib);
    }
  }
}
