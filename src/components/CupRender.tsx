"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { clampRotation } from "@/lib/cup-render/geometry";
import type { Artwork } from "@/lib/cup-render/paint";
import {
  composeArtwork,
  loadCupScene,
  paintScene,
  type CupScene,
  type DrawingSource,
} from "@/lib/cup-render/render";

/**
 * A child's drawing, shown printed on the Origins Christmas cup.
 *
 * The photo of the blank cup is the base; the drawing is warped around the
 * wall and multiplied into it (lib/cup-render). Dragging sideways turns the
 * cup up to 40° each way, with the arrow keys doing the same; nothing springs
 * back and nothing animates on its own.
 *
 * For the stored share image use `renderCupBlob` from lib/cup-render/render
 * instead: this component is the live view.
 */
export default function CupRender({
  src,
  attribution,
  width = 1080,
  height = 1350,
  interactive = true,
  alt = "Desenul, tipărit pe paharul Origins de Crăciun",
  className,
}: {
  /** The drawing: URL, File/Blob, or an image/canvas element. */
  src: DrawingSource;
  /** e.g. "Desenat de Ana, 7 ani": a small line at the back, by the seam. Omit for none. */
  attribution?: string;
  /** Pixel size of the canvas; CSS scales it to the container's width. */
  width?: number;
  height?: number;
  /** Drag / arrow keys turn the cup. */
  interactive?: boolean;
  alt?: string;
  className?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const live = useRef<{ scene: CupScene; artwork: Artwork } | null>(null);
  const rotation = useRef(0);
  const frame = useRef(0);
  const drag = useRef<{ x: number; from: number } | null>(null);
  // the result is tagged with the drawing it belongs to, so a new `src`
  // reads as "loading" without resetting state inside the effect
  const [result, setResult] = useState<{ src: DrawingSource; ok: boolean } | null>(null);
  const state = result?.src === src ? (result.ok ? "ready" : "error") : "loading";

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const scene = await loadCupScene({ width, height });
      const artwork = await composeArtwork(scene, src, { attribution });
      if (cancelled || !canvasRef.current) return;
      live.current = { scene, artwork };
      paintScene(scene, artwork, canvasRef.current, rotation.current);
      setResult({ src, ok: true });
    })().catch(() => {
      if (!cancelled) setResult({ src, ok: false });
    });
    return () => {
      cancelled = true;
      cancelAnimationFrame(frame.current);
    };
  }, [src, attribution, width, height]);

  const turnTo = useCallback((degrees: number) => {
    rotation.current = clampRotation(degrees);
    cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(() => {
      const canvas = canvasRef.current;
      if (canvas && live.current) paintScene(live.current.scene, live.current.artwork, canvas, rotation.current);
    });
  }, []);

  return (
    <canvas
      ref={canvasRef}
      width={width}
      height={height}
      role="img"
      aria-label={alt}
      aria-busy={state === "loading"}
      data-state={state}
      tabIndex={interactive ? 0 : undefined}
      className={className}
      style={{
        display: "block",
        width: "100%",
        height: "auto",
        aspectRatio: `${width} / ${height}`,
        touchAction: interactive ? "pan-y" : undefined,
        cursor: interactive ? "grab" : undefined,
        background: "#0d1512",
      }}
      onPointerDown={
        interactive
          ? (e) => {
              drag.current = { x: e.clientX, from: rotation.current };
              e.currentTarget.setPointerCapture(e.pointerId);
            }
          : undefined
      }
      onPointerMove={
        interactive
          ? (e) => {
              if (!drag.current) return;
              // the cup follows the finger: its visible half is about half the canvas wide
              const perPx = 180 / (e.currentTarget.clientWidth * 0.5);
              turnTo(drag.current.from - (e.clientX - drag.current.x) * perPx * 0.6);
            }
          : undefined
      }
      onPointerUp={interactive ? () => (drag.current = null) : undefined}
      onPointerCancel={interactive ? () => (drag.current = null) : undefined}
      onKeyDown={
        interactive
          ? (e) => {
              if (e.key === "ArrowLeft") turnTo(rotation.current + 5);
              else if (e.key === "ArrowRight") turnTo(rotation.current - 5);
              else return;
              e.preventDefault();
            }
          : undefined
      }
    />
  );
}
