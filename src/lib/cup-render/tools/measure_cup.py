#!/usr/bin/env python3
"""Measure a blank-cup photo for the cup render (src/lib/cup-render).

Usage:
  python3 src/lib/cup-render/tools/measure_cup.py <photo> [--name cup-blank] [--lid-top Y] [--debug out.png]

Writes into public/cup/:
  <name>.jpg        the photo, re-encoded (the render multiplies the print onto it)
  <name>-mask.png   wall mask (white = printable wall, feathered; keeps the lid,
                    the background and anything standing in front of the cup clean)
  <name>-cutout.png lid + cup silhouette (white = the object), for cutting the cup
                    out of its set; the lid is read on its cleaner left half and mirrored
  <name>.json       the measurements the warp needs: top and bottom ellipse of the
                    visible wall, paper white, the subject box used for cropping

What it assumes about the photo: one white/blank paper cup, upright, roughly
centred, lit so the wall is brighter than what is behind it, with a dark lid (or a
dark gap) above the wall. A photo that breaks these needs the numbers typed by hand
into the JSON; check the --debug overlay either way.
"""
import argparse, json, pathlib
import numpy as np
from PIL import Image, ImageFilter, ImageDraw
from scipy import ndimage

ROOT = pathlib.Path(__file__).resolve().parents[4]
OUT = ROOT / "public" / "cup"


def robust_line(ys, xs, iters=4):
    """x = m*y + c, refit a few times dropping the worst residuals."""
    ys, xs = np.asarray(ys, float), np.asarray(xs, float)
    keep = np.ones(len(ys), bool)
    for _ in range(iters):
        m, c = np.polyfit(ys[keep], xs[keep], 1)
        r = np.abs(xs - (m * ys + c))
        keep = r <= max(1.5, np.percentile(r[keep], 80))
    return float(m), float(c)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("photo")
    ap.add_argument("--name", default="cup-blank")
    ap.add_argument("--lid-top", type=int, default=None, help="y of the top of the lid (for the crop box)")
    ap.add_argument("--debug", default=None)
    a = ap.parse_args()

    img = Image.open(a.photo).convert("RGB")
    W, H = img.size
    im = np.asarray(img).astype(np.float64)
    R, G, B = im[..., 0], im[..., 1], im[..., 2]
    lum = 0.299 * R + 0.587 * G + 0.114 * B
    # wall = neutral paper, lit or in shadow; the set is green or near black
    wallish = (lum > 14) & ((G - R) < 7) & ((im.max(2) - im.min(2)) < 48)

    # seed: the biggest bright neutral blob
    bright = (lum > 150) & wallish
    ys, xs = np.where(bright)
    cx0, cy0 = int(np.median(xs)), int(np.median(ys))
    col = np.where(bright[:, cx0])[0]
    y_top0, y_bot0 = int(col.min()), int(col.max())
    hh = y_bot0 - y_top0

    # silhouette: per row, the run of wall pixels that contains the seed column
    rows, xl, xr = [], [], []
    for y in range(y_top0 + int(0.12 * hh), y_bot0 - int(0.10 * hh)):
        row = wallish[y]
        if not row[cx0]:
            continue
        gap = 0; x = cx0
        while x > 0 and gap < 4:
            x -= 1; gap = 0 if row[x] else gap + 1
        left = x + gap
        gap = 0; x = cx0
        while x < W - 1 and gap < 4:
            x += 1; gap = 0 if row[x] else gap + 1
        right = x - gap
        rows.append(y); xl.append(left); xr.append(right)
    mL, cL = robust_line(rows, xl)
    mR, cR = robust_line(rows, xr)
    # pixel-centre convention: edges sit half a pixel outside the last wall pixel
    cL -= 0.5; cR += 0.5
    half = lambda y: ((mR * y + cR) - (mL * y + cL)) / 2
    mid = lambda y: ((mR * y + cR) + (mL * y + cL)) / 2

    # top and bottom boundary of the wall, per column
    def boundary(direction):
        pts = []
        y_ref0 = y_top0 + int(0.2 * hh) if direction < 0 else y_bot0 - int(0.2 * hh)
        xa = int(mid(y_ref0) - 0.93 * half(y_ref0)); xb = int(mid(y_ref0) + 0.93 * half(y_ref0))
        for x in range(xa, xb):
            ref = np.median(lum[y_ref0 - 15:y_ref0 + 15, x])
            y = y_ref0
            while 0 < y < H - 1:
                ok = lum[y, x] > 0.55 * ref and wallish[y, x]
                if not ok and not (lum[y + direction, x] > 0.55 * ref and wallish[y + direction, x]):
                    break
                y += direction
            pts.append((x, y - direction))
        return np.array(pts, float)

    def fit_arc(pts, cy_guess):
        cy = cy_guess; b = 0.0
        for _ in range(8):
            t = np.clip((pts[:, 0] - mid(cy)) / half(cy), -0.999, 0.999)
            s = np.sqrt(1 - t * t)
            keep = np.ones(len(s), bool)
            for _ in range(4):
                A = np.stack([np.ones(keep.sum()), s[keep]], 1)
                (cy_n, b), *_ = np.linalg.lstsq(A, pts[keep, 1], rcond=None)
                r = np.abs(pts[:, 1] - (cy_n + b * s))
                keep = r <= max(1.2, np.percentile(r, 85))
            cy = float(cy_n)
        resid = float(np.sqrt(np.mean((pts[keep, 1] - (cy + b * s[keep])) ** 2)))
        return cy, float(b), resid

    top_pts = boundary(-1); bot_pts = boundary(+1)
    cyT, bT, rT = fit_arc(top_pts, top_pts[:, 1].min())
    cyB, bB, rB = fit_arc(bot_pts, bot_pts[:, 1].min())
    cyT -= 0.5; cyB += 0.5
    top = dict(cx=round(mid(cyT), 2), cy=round(cyT, 2), a=round(half(cyT), 2), b=round(bT, 2))
    bottom = dict(cx=round(mid(cyB), 2), cy=round(cyB, 2), a=round(half(cyB), 2), b=round(bB, 2))

    # mask: inside the measured wall, minus anything that is clearly not paper
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float64)
    def arc_y(e_cx, e_cy, e_a, e_b):
        t = np.clip((xx - e_cx) / e_a, -1, 1)
        return e_cy + e_b * np.sqrt(1 - t * t)
    inside = (yy >= arc_y(**{"e_" + k: v for k, v in top.items()})) & (yy <= arc_y(**{"e_" + k: v for k, v in bottom.items()}))
    inside &= (xx >= mL * yy + cL) & (xx <= mR * yy + cR)
    not_paper = ((G - R) > 12) & (lum > 20)          # greenery in front of the cup
    m = Image.fromarray(((inside & ~not_paper) * 255).astype(np.uint8))
    m = m.filter(ImageFilter.MedianFilter(5)).filter(ImageFilter.GaussianBlur(0.8))
    geom = Image.fromarray((inside * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(0.8))
    m = Image.fromarray(np.minimum(np.asarray(m), np.asarray(geom)))

    wall_px = im[inside & (np.asarray(m) > 250)]
    white = [int(round(v)) for v in np.percentile(wall_px, 97, axis=0)]
    lid_top = a.lid_top if a.lid_top is not None else int(cyT - 0.36 * 2 * top["a"])
    lid_half = top["a"] * 1.14
    subject = dict(x0=int(top["cx"] - lid_half), y0=lid_top, x1=int(top["cx"] + lid_half), y1=int(round(cyB + bB)))

    # cut-out: wall + lid. The lid is dark and neutral on a dark green set, so it is
    # read where the set is cleanest (left half) and mirrored about the cup's axis.
    cxi = int(round(top["cx"]))
    y_a, y_b = max(0, lid_top - 40), int(cyT + bT) + 2
    reach = int(top["a"] * 1.35)
    band = ((G - R) < 5.5)[y_a:y_b, cxi - reach:cxi]
    band = ndimage.binary_opening(band, iterations=2)
    band = ndimage.binary_closing(band, iterations=6)
    lab, n = ndimage.label(band)
    if n:
        # the component that touches the axis, lowest part first
        ids = [i for i in np.unique(lab[:, -8:]) if i]
        best = max(ids, key=lambda i: (lab == i).sum()) if ids else 0
        band = ndimage.binary_fill_holes(lab == best)
    # each row: solid from its leftmost lid pixel to the axis
    lid = np.zeros((H, W), bool)
    halves = np.array([band.shape[1] - np.where(r)[0].min() if r.sum() >= 3 else 0 for r in band], float)
    halves = ndimage.median_filter(halves, size=9)          # a lid has a smooth profile; the threshold does not
    for j, half_w in enumerate(halves.astype(int)):
        if half_w > 0:
            lid[y_a + j, cxi - half_w:cxi + half_w] = True
    solid = lid | inside
    # no slivers of set between the lid and the wall: each column is solid top to bottom
    first = np.argmax(solid, axis=0); last = H - 1 - np.argmax(solid[::-1], axis=0)
    has = solid.any(0)
    solid = (yy >= first[None, :]) & (yy <= last[None, :]) & has[None, :]
    cut = Image.fromarray((solid * 255).astype(np.uint8)).filter(ImageFilter.MedianFilter(9)).filter(ImageFilter.GaussianBlur(1.2))
    lid_rows = np.where(lid.any(1))[0]
    if a.lid_top is None and len(lid_rows):
        lid_top = int(lid_rows.min())
    lid_cols = np.where(lid.any(0))[0]
    if len(lid_cols):
        subject = dict(x0=int(lid_cols.min()), y0=lid_top, x1=int(lid_cols.max()), y1=int(round(cyB + bB)))

    OUT.mkdir(parents=True, exist_ok=True)
    cut.save(OUT / f"{a.name}-cutout.png", optimize=True)
    img.save(OUT / f"{a.name}.jpg", quality=93, subsampling=0)
    m.save(OUT / f"{a.name}-mask.png", optimize=True)
    data = dict(
        photo=f"/cup/{a.name}.jpg", mask=f"/cup/{a.name}-mask.png", cutout=f"/cup/{a.name}-cutout.png", width=W, height=H,
        top=top, bottom=bottom, paperWhite=white, subject=subject,
        note="Generated by src/lib/cup-render/tools/measure_cup.py. top/bottom = ellipses of the visible wall edge (cx, cy centre; a, b half-axes; the visible arc is the lower half).",
        fit=dict(topResidualPx=round(rT, 2), bottomResidualPx=round(rB, 2)),
    )
    (OUT / f"{a.name}.json").write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(data, indent=2))

    if a.debug:
        dbg = img.copy(); d = ImageDraw.Draw(dbg)
        for e, c in ((top, (255, 0, 80)), (bottom, (0, 200, 255))):
            pts = [(e["cx"] + e["a"] * np.sin(th), e["cy"] + e["b"] * np.cos(th)) for th in np.linspace(-np.pi / 2, np.pi / 2, 200)]
            d.line(pts, fill=c, width=2)
        d.line([(top["cx"] - top["a"], top["cy"]), (bottom["cx"] - bottom["a"], bottom["cy"])], fill=(255, 220, 0), width=2)
        d.line([(top["cx"] + top["a"], top["cy"]), (bottom["cx"] + bottom["a"], bottom["cy"])], fill=(255, 220, 0), width=2)
        d.rectangle([subject["x0"], subject["y0"], subject["x1"], subject["y1"]], outline=(255, 255, 255))
        pad = 60
        box = (subject["x0"] - pad, subject["y0"] - pad, subject["x1"] + pad, subject["y1"] + pad)
        dbg.crop(box).save(a.debug)
        m.crop(box).save(a.debug.replace(".png", "_mask.png"))
        on_grey = Image.new("RGB", img.size, (150, 60, 160)); on_grey.paste(img, (0, 0), cut)
        on_grey.crop(box).save(a.debug.replace(".png", "_cutout.png"))


if __name__ == "__main__":
    main()
