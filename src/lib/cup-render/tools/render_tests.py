#!/usr/bin/env python3
"""Render drawings onto the cup through the real browser code (the dev page).

  npm run dev -- -p 3457        # in another terminal
  python3 src/lib/cup-render/tools/render_tests.py <out_dir> <drawing.png> [more.png ...] [--url http://127.0.0.1:3457]

Writes <out_dir>/<drawing name>_pahar<tag>.png (1080 x 1350) for each drawing, plus
one turned 30 degrees and one 1200 x 630 for the first drawing, and prints the timings.
--tag _v2 names the files of a new layout round without touching the old ones.
"""
import argparse, base64, pathlib
from playwright.sync_api import sync_playwright

JS = """async ({b64, opts}) => {
  const blob = await (await fetch('data:image/png;base64,' + b64)).blob();
  const t0 = performance.now();
  const url = await window.__cupRender(blob, opts);
  return {url, ms: Math.round(performance.now() - t0)};
}"""

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("out"); ap.add_argument("drawings", nargs="+")
    ap.add_argument("--url", default="http://127.0.0.1:3457"); ap.add_argument("--tag", default="")
    a = ap.parse_args()
    out = pathlib.Path(a.out); out.mkdir(parents=True, exist_ok=True)
    with sync_playwright() as p:
        b = p.chromium.launch(); pg = b.new_page(viewport={"width": 600, "height": 900})
        pg.on("console", lambda m: print("console:", m.text) if m.type == "error" else None)
        pg.goto(a.url + "/dev/cup", wait_until="networkidle")
        pg.wait_for_function("() => !!window.__cupRender")
        pg.wait_for_selector("canvas[data-state=ready]")
        def run(path, suffix, opts):
            b64 = base64.b64encode(path.read_bytes()).decode()
            r = pg.evaluate(JS, {"b64": b64, "opts": opts})
            name = path.stem.replace("TEST_INPUT_", "TEST_")
            target = out / f"{name}_{suffix}{a.tag}.png"
            target.write_bytes(base64.b64decode(r["url"].split(",", 1)[1]))
            print(f"{target.name}: {r['ms']} ms")
        for i, d in enumerate(a.drawings):
            d = pathlib.Path(d)
            run(d, "pahar", {})
            if i == 0:
                run(d, "pahar", {})          # second run = warm caches, the honest timing
                # turned, with the optional line at the back coming into view
                run(d, "pahar_rotit40", {"attribution": "Desenat de [Prenume], [vârstă] ani", "rotation": 40})
                run(d, "pahar_og_1200x630", {"width": 1200, "height": 630})
        pg.screenshot(path=str(out / f"_dev_page{a.tag}.png"), full_page=True)
        b.close()

if __name__ == "__main__":
    main()
