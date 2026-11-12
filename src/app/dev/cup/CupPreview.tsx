"use client";

import { useEffect, useState } from "react";
import { Download, ImageUp } from "lucide-react";
import CupRender from "@/components/CupRender";
import { renderCupBlob, renderCupDataUrl } from "@/lib/cup-render/render";

declare global {
  interface Window {
    /** Hook for tools/render_tests.py: render a picked file outside React. */
    __cupRender?: typeof renderCupDataUrl;
  }
}

/** A stand-in drawing so the page shows something before a file is picked. */
function placeholderDrawing(): string {
  const c = document.createElement("canvas");
  c.width = 1092;
  c.height = 568;
  const g = c.getContext("2d");
  if (!g) return "";
  g.fillStyle = "#fff";
  g.fillRect(0, 0, c.width, c.height);
  g.lineWidth = 6;
  g.strokeStyle = "#c33";
  for (let x = 0; x <= c.width; x += 91) {
    g.beginPath();
    g.moveTo(x, 0);
    g.lineTo(x, c.height);
    g.stroke();
  }
  g.strokeStyle = "#2a6";
  for (let y = 0; y <= c.height; y += 71) {
    g.beginPath();
    g.moveTo(0, y);
    g.lineTo(c.width, y);
    g.stroke();
  }
  g.fillStyle = "#124";
  g.font = "700 44px sans-serif";
  g.fillText("TEST GRID · not a child's drawing", 30, 60);
  return c.toDataURL("image/png");
}

export default function CupPreview() {
  const [src, setSrc] = useState<string | File | null>(null);
  const [attribution, setAttribution] = useState("");
  const [ms, setMs] = useState<number | null>(null);

  useEffect(() => {
    window.__cupRender = renderCupDataUrl;
    const id = requestAnimationFrame(() => setSrc((current) => current ?? placeholderDrawing()));
    return () => {
      cancelAnimationFrame(id);
      delete window.__cupRender;
    };
  }, []);

  async function save() {
    if (!src) return;
    const t0 = performance.now();
    const blob = await renderCupBlob(src, { attribution });
    setMs(Math.round(performance.now() - t0));
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "pahar-test.png";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return (
    <main className="mx-auto flex w-full max-w-[560px] flex-col gap-4 p-4">
      <h1 className="text-lg font-semibold">Cup render · dev preview</h1>
      <p className="text-sm text-muted">
        Blank cup photo: placeholder. Cup dimensions: 12 oz, 90 / 60 / 110 mm, confirmed by the supplier. Drag the cup sideways to turn it.
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex cursor-pointer items-center gap-2 rounded-full border border-line px-4 py-2 text-sm">
          <ImageUp size={16} aria-hidden="true" />
          Pick a drawing
          <input
            type="file"
            accept="image/*"
            className="sr-only"
            data-testid="cup-file"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) setSrc(file);
            }}
          />
        </label>
        <button
          type="button"
          onClick={save}
          disabled={!src}
          className="flex items-center gap-2 rounded-full bg-ink px-4 py-2 text-sm text-paper disabled:opacity-40"
        >
          <Download size={16} aria-hidden="true" />
          Save PNG
        </button>
        {ms !== null && <span className="text-sm text-muted">{ms} ms</span>}
      </div>
      <label className="flex flex-col gap-1 text-sm">
        Attribution (back of the cup, by the seam; turn the cup to see it)
        <input
          value={attribution}
          onChange={(e) => setAttribution(e.target.value)}
          className="rounded-lg border border-line px-3 py-2"
        />
      </label>
      {src && <CupRender src={src} attribution={attribution} className="rounded-2xl" />}
    </main>
  );
}
