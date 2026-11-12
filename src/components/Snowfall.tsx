"use client";

import { useEffect, useRef } from "react";

/**
 * Snow on the public contest pages: one fixed canvas, a few dozen flakes,
 * about one in seven catching the light for a moment as it falls.
 *
 * Quiet by design:
 *   - the canvas never takes a click (pointer-events: none) and sits under
 *     everything marked `relative z-20` (drawings, the cup, cards, buttons),
 *     so a flake never crosses a child's drawing;
 *   - white flakes over the dark bands (elements with `data-snow="dark"`),
 *     a soft grey-blue over white, so they read without shouting;
 *   - it stops while the tab is hidden;
 *   - it does not start at all under `prefers-reduced-motion`, nor on a
 *     modest device (4 CPU cores or fewer, or 4 GB of memory or less): a
 *     decoration must never cost a parent's phone its battery;
 *   - on phones: at most 25 flakes, drawn at 30 frames a second.
 */

interface Flake {
  x: number;
  y: number;
  r: number;
  speed: number;
  drift: number;
  phase: number;
  /** Seconds until the next sparkle; Infinity for flakes that never do. */
  nextSparkle: number;
  /** 1 -> 0 while a sparkle fades. */
  sparkle: number;
}

const ON_WHITE = "154, 170, 190";
const ON_DARK = "255, 255, 255";

export default function Snowfall() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const device = navigator as Navigator & { deviceMemory?: number };
    if (device.hardwareConcurrency !== undefined && device.hardwareConcurrency <= 4) return;
    if (device.deviceMemory !== undefined && device.deviceMemory <= 4) return;

    // Phones draw every other frame at most (30 fps); desktops follow the display.
    let minFrameMs = 0;
    let lastDraw = 0;

    let width = 0;
    let height = 0;
    let flakes: Flake[] = [];
    let frame = 0;
    let last = performance.now();

    const makeFlake = (anywhere: boolean): Flake => ({
      x: Math.random() * width,
      y: anywhere ? Math.random() * height : -8,
      r: 1 + Math.random() * 2.4,
      speed: 14 + Math.random() * 30,
      drift: 6 + Math.random() * 14,
      phase: Math.random() * Math.PI * 2,
      nextSparkle: Math.random() < 0.15 ? 1 + Math.random() * 6 : Infinity,
      sparkle: 0,
    });

    const resize = () => {
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = Math.round(width * ratio);
      canvas.height = Math.round(height * ratio);
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      const phone = width < 768;
      minFrameMs = phone ? 1000 / 30 : 0;
      const wanted = phone ? 24 : width < 1100 ? 44 : 60;
      flakes = Array.from({ length: wanted }, () => makeFlake(true));
    };

    const tick = (now: number) => {
      if (minFrameMs > 0 && now - lastDraw < minFrameMs - 1) {
        frame = requestAnimationFrame(tick);
        return;
      }
      lastDraw = now;
      // A long gap (tab came back) must not throw the flakes down the page.
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      ctx.clearRect(0, 0, width, height);

      const dark = [...document.querySelectorAll<HTMLElement>("[data-snow='dark']")]
        .map((element) => element.getBoundingClientRect())
        .filter((rect) => rect.bottom > 0 && rect.top < height);

      for (const flake of flakes) {
        flake.phase += dt * 0.9;
        flake.y += flake.speed * dt;
        flake.x += Math.sin(flake.phase) * flake.drift * dt;
        if (flake.y > height + 8) Object.assign(flake, makeFlake(false));

        if (flake.nextSparkle !== Infinity) {
          flake.nextSparkle -= dt;
          if (flake.nextSparkle <= 0) {
            flake.sparkle = 1;
            flake.nextSparkle = 3 + Math.random() * 7;
          }
        }
        if (flake.sparkle > 0) flake.sparkle = Math.max(0, flake.sparkle - dt * 1.6);

        const onDark = dark.some(
          (rect) =>
            flake.y >= rect.top && flake.y <= rect.bottom && flake.x >= rect.left && flake.x <= rect.right,
        );
        const colour = onDark ? ON_DARK : ON_WHITE;
        const base = onDark ? 0.5 : 0.55;

        ctx.fillStyle = `rgba(${colour}, ${Math.min(1, base + flake.sparkle * 0.5)})`;
        ctx.beginPath();
        ctx.arc(flake.x, flake.y, flake.r, 0, Math.PI * 2);
        ctx.fill();

        if (flake.sparkle > 0) {
          // The glint: a thin four-point star that fades in under a second.
          const arm = flake.r * (2.2 + flake.sparkle * 3.2);
          ctx.strokeStyle = `rgba(${onDark ? ON_DARK : "120, 142, 170"}, ${flake.sparkle * 0.9})`;
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(flake.x - arm, flake.y);
          ctx.lineTo(flake.x + arm, flake.y);
          ctx.moveTo(flake.x, flake.y - arm);
          ctx.lineTo(flake.x, flake.y + arm);
          ctx.stroke();
        }
      }
      frame = requestAnimationFrame(tick);
    };

    const start = () => {
      cancelAnimationFrame(frame);
      last = performance.now();
      frame = requestAnimationFrame(tick);
    };
    const onVisibility = () => {
      if (document.hidden) cancelAnimationFrame(frame);
      else start();
    };

    resize();
    start();
    window.addEventListener("resize", resize);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", resize);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  return (
    <canvas
      ref={ref}
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-10 h-full w-full"
    />
  );
}
