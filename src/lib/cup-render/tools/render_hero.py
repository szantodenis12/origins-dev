#!/usr/bin/env python3
"""Hero image: ONE cup, front-facing, cut out of its set by the renderer and placed on a plain
dark green backdrop with the white Origins logo above it.

  python3 src/lib/cup-render/tools/render_hero.py <drawing.png> <out_dir> [--url http://127.0.0.1:3000] [--name HERO] [--tag _v2]

The cup comes from the platform's own renderer (dev page, `cutout: true`); this script only
builds the backdrop, the shadow and the reflection around it. Writes 1080x1350 and 1080x1080.
"""
import argparse, base64, json, pathlib
from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parents[4]
LOGO = json.loads((ROOT / "public/cup/origins-logo-paths.json").read_text())

JS = """async ({b64, opts}) => {
  const blob = await (await fetch('data:image/png;base64,' + b64)).blob();
  return await window.__cupRender(blob, opts);
}"""

def page_html(cup_url, W, H, fill, base_y, logo_w, logo_y):
    cup_h = fill * H                      # lid + cup, centred vertically in the cut-out
    dy = base_y - (H / 2 + cup_h / 2)     # move the cup so its base sits on base_y
    paths = "".join(f'<path fill-rule="evenodd" fill="#fff" d="{d}"/>' for d in LOGO["paths"])
    return f"""<!doctype html><html><head><meta charset="utf-8"><style>
html,body{{margin:0}} body{{width:{W}px;height:{H}px;position:relative;overflow:hidden;background:#0d2219}}
.bg{{position:absolute;inset:0;background:
  radial-gradient(60% 42% at 50% {base_y / H * 100 - 30:.1f}%, rgba(74,122,92,.55), rgba(74,122,92,0) 100%),
  radial-gradient(120% 90% at 50% 40%, #1f4a36 0%, #153526 45%, #0b1d15 100%)}}
.floor{{position:absolute;left:0;right:0;top:{base_y - 40}px;bottom:0;background:linear-gradient(180deg, rgba(8,22,16,0) 0%, rgba(8,22,16,.55) 55%, rgba(6,16,12,.8) 100%)}}
.grain{{position:absolute;inset:0;opacity:.06;mix-blend-mode:overlay}}
.cup{{position:absolute;left:0;top:{dy:.1f}px;width:{W}px;height:{H}px}}
.refl{{position:absolute;left:0;top:{2 * base_y - H - dy - 6:.1f}px;width:{W}px;height:{H}px;transform:scaleY(-1);opacity:.2;filter:blur(3px);
  -webkit-mask-image:linear-gradient(0deg, #000 {100 - (H / 2 + cup_h / 2) / H * 100:.1f}%, rgba(0,0,0,0) {100 - (H / 2 + cup_h / 2) / H * 100 + 13:.1f}%)}}
.shadow{{position:absolute;left:{W / 2 - cup_h * .3:.0f}px;top:{base_y - cup_h * .05:.0f}px;width:{cup_h * .64:.0f}px;height:{cup_h * .085:.0f}px;border-radius:50%;
  background:radial-gradient(closest-side, rgba(0,0,0,.6), rgba(0,0,0,0));filter:blur(7px)}}
.logo{{position:absolute;left:{(W - logo_w) / 2:.0f}px;top:{logo_y}px;width:{logo_w}px}}
</style></head><body>
<div class="bg"></div><div class="floor"></div>
<svg class="grain" width="{W}" height="{H}"><filter id="n"><feTurbulence type="fractalNoise" baseFrequency=".9" numOctaves="2" stitchTiles="stitch"/></filter><rect width="100%" height="100%" filter="url(#n)"/></svg>
<svg class="logo" viewBox="{LOGO['viewBox']}">{paths}</svg>
<img class="refl" src="{cup_url}"><div class="shadow"></div><img class="cup" src="{cup_url}">
</body></html>"""

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("drawing"); ap.add_argument("out")
    ap.add_argument("--url", default="http://127.0.0.1:3000"); ap.add_argument("--name", default="HERO"); ap.add_argument("--tag", default="")
    a = ap.parse_args()
    out = pathlib.Path(a.out); out.mkdir(parents=True, exist_ok=True)
    b64 = base64.b64encode(pathlib.Path(a.drawing).read_bytes()).decode()
    #        W     H     fill  base_y logo_w logo_y
    sizes = [(1080, 1350, 0.60, 1215, 400, 96), (1080, 1080, 0.64, 1000, 290, 56)]
    with sync_playwright() as p:
        b = p.chromium.launch(); pg = b.new_page(viewport={"width": 600, "height": 900})
        pg.goto(a.url + "/dev/cup", wait_until="networkidle"); pg.wait_for_function("() => !!window.__cupRender")
        for W, H, fill, base_y, logo_w, logo_y in sizes:
            cup = pg.evaluate(JS, {"b64": b64, "opts": {"width": W, "height": H, "fill": fill, "cutout": True}})
            hp = b.new_page(viewport={"width": W, "height": H})
            hp.set_content(page_html(cup, W, H, fill, base_y, logo_w, logo_y), wait_until="load"); hp.wait_for_timeout(300)
            target = out / f"{a.name}_{W}x{H}{a.tag}.png"; hp.screenshot(path=str(target)); hp.close(); print(target.name)
        b.close()

if __name__ == "__main__":
    main()
