"use client";

import { useEffect, useRef } from "react";

/**
 * Snow on the public contest pages: two fixed canvases, one behind the
 * words and one in front of them.
 *
 * One canvas could not do both jobs. Snow that falls only behind the page
 * reads as a few dots in the margins, not as weather; snow that falls over
 * the page costs it its readability, which on a page parents read standing
 * in a queue is the more expensive of the two.
 *
 *   - the back canvas (z-10) carries the weather: most of the flakes, over
 *     the section backgrounds but under every column of content, which is
 *     `relative z-20` (see WRAP in DrawingGallery.tsx). A flake there never
 *     crosses a word or a child's drawing.
 *   - the front canvas (z-30) carries six or seven big flakes, blurred and
 *     nearly transparent. Out of focus they read as depth, the way a flake
 *     close to the lens does, rather than as dots, so they can pass in
 *     front of text without competing with it.
 *
 * Both draw a pre-rendered soft-edged sprite rather than `arc()`: a hard
 * disc is what makes canvas snow look like punctuation, and one
 * `drawImage` is cheaper than a path per flake per frame.
 *
 * White flakes over the dark bands (elements with `data-snow="dark"`), a
 * soft grey-blue over white, so they read without shouting. Those
 * rectangles are measured on scroll and resize, not every frame:
 * `getBoundingClientRect()` forces layout, and at 60 fps that was sixty
 * forced layouts a second spent on decoration.
 *
 * Quiet by design:
 *   - neither canvas ever takes a click (pointer-events: none);
 *   - both stop while the tab is hidden;
 *   - neither starts under `prefers-reduced-motion`, nor on a modest device
 *     (4 CPU cores or fewer, or 4 GB of memory or less): a decoration must
 *     never cost a parent's phone its battery;
 *   - on phones: fewer flakes, drawn at 30 frames a second.
 */

interface Flake {
  x: number;
  y: number;
  /** 0 far, 1 near. Drives size, speed, sway and opacity together. */
  depth: number;
  r: number;
  speed: number;
  drift: number;
  phase: number;
  swayRate: number;
  /** Seconds until the next sparkle; Infinity for flakes that never do. */
  nextSparkle: number;
  /** 1 -> 0 while a sparkle fades. */
  sparkle: number;
}

const ON_WHITE = "154, 170, 190";
const ON_DARK = "255, 255, 255";
const SPRITE = 64;

/** A soft disc, rendered once and stretched to each flake's size. */
function makeSprite(colour: string): HTMLCanvasElement {
  const sprite = document.createElement("canvas");
  sprite.width = SPRITE;
  sprite.height = SPRITE;
  const ctx = sprite.getContext("2d")!;
  const half = SPRITE / 2;
  const gradient = ctx.createRadialGradient(half, half, 0, half, half, half);
  gradient.addColorStop(0, `rgba(${colour}, 1)`);
  gradient.addColorStop(0.4, `rgba(${colour}, 0.78)`);
  gradient.addColorStop(0.75, `rgba(${colour}, 0.2)`);
  gradient.addColorStop(1, `rgba(${colour}, 0)`);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, SPRITE, SPRITE);
  return sprite;
}

export default function Snowfall() {
  const backRef = useRef<HTMLCanvasElement>(null);
  const frontRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const back = backRef.current;
    const front = frontRef.current;
    const backCtx = back?.getContext("2d");
    const frontCtx = front?.getContext("2d");
    if (!back || !front || !backCtx || !frontCtx) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const device = navigator as Navigator & { deviceMemory?: number };
    if (device.hardwareConcurrency !== undefined && device.hardwareConcurrency <= 4) return;
    if (device.deviceMemory !== undefined && device.deviceMemory <= 4) return;

    const white = makeSprite(ON_DARK);
    const grey = makeSprite(ON_WHITE);

    // Phones draw every other frame at most (30 fps); desktops follow the display.
    let minFrameMs = 0;
    let lastDraw = 0;

    let width = 0;
    let height = 0;
    let backFlakes: Flake[] = [];
    let frontFlakes: Flake[] = [];
    let frame = 0;
    let last = performance.now();
    let dark: DOMRect[] = [];

    const measure = () => {
      dark = [...document.querySelectorAll<HTMLElement>('[data-snow="dark"]')]
        .map((element) => element.getBoundingClientRect())
        .filter((rect) => rect.bottom > 0 && rect.top < height);
    };

    const makeFlake = (near: boolean, anywhere: boolean): Flake => {
      // Near flakes sit at the top of the depth range: bigger, faster and
      // swinging wider, which is what sells one layer as closer than another.
      const depth = near ? 0.82 + Math.random() * 0.18 : Math.random();
      return {
        x: Math.random() * width,
        y: anywhere ? Math.random() * height : -40,
        depth,
        r: near ? 5 + Math.random() * 5 : 0.9 + depth * 2.3,
        speed: near ? 44 + depth * 38 : 11 + depth * 34,
        drift: 5 + depth * 17,
        phase: Math.random() * Math.PI * 2,
        swayRate: 0.5 + Math.random() * 0.8,
        nextSparkle: !near && Math.random() < 0.15 ? 1 + Math.random() * 6 : Infinity,
        sparkle: 0,
      };
    };

    const resize = () => {
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      width = window.innerWidth;
      height = window.innerHeight;
      for (const [canvas, ctx] of [
        [back, backCtx],
        [front, frontCtx],
      ] as const) {
        canvas.width = Math.round(width * ratio);
        canvas.height = Math.round(height * ratio);
        ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      }
      const phone = width < 768;
      minFrameMs = phone ? 1000 / 30 : 0;
      const behind = phone ? 30 : width < 1100 ? 54 : 74;
      const ahead = phone ? 4 : 7;
      backFlakes = Array.from({ length: behind }, () => makeFlake(false, true));
      frontFlakes = Array.from({ length: ahead }, () => makeFlake(true, true));
      measure();
    };

    /** One layer, one frame. `wind` is shared, so both layers lean together. */
    const drawLayer = (
      ctx: CanvasRenderingContext2D,
      flakes: Flake[],
      dt: number,
      wind: number,
      near: boolean,
    ) => {
      ctx.clearRect(0, 0, width, height);
      for (const flake of flakes) {
        flake.phase += dt * flake.swayRate;
        flake.y += flake.speed * dt;
        flake.x += (Math.sin(flake.phase) * flake.drift + wind * 22 * flake.depth) * dt;
        if (flake.y > height + 40) Object.assign(flake, makeFlake(near, false));
        // The wind leans one way for a minute at a time; wrap the flakes
        // rather than let one edge of the screen empty out.
        if (flake.x < -60) flake.x = width + 60;
        else if (flake.x > width + 60) flake.x = -60;

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
            flake.y >= rect.top &&
            flake.y <= rect.bottom &&
            flake.x >= rect.left &&
            flake.x <= rect.right,
        );
        // The front layer stays faint whatever it crosses: it is allowed
        // over the words only because it never competes with them.
        const alpha = near
          ? 0.16
          : (onDark ? 0.3 : 0.24) + flake.depth * 0.3 + flake.sparkle * 0.35;
        const size = flake.r * 4;
        ctx.globalAlpha = Math.min(1, alpha);
        ctx.drawImage(onDark ? white : grey, flake.x - size / 2, flake.y - size / 2, size, size);

        if (!near && flake.sparkle > 0) {
          // The glint: a thin four-point star that fades in under a second.
          const arm = flake.r * (2.2 + flake.sparkle * 3.2);
          ctx.globalAlpha = 1;
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
      ctx.globalAlpha = 1;
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
      // Two slow sines: a long lean with a shorter gust inside it, so the
      // fall never settles into the straight line that gives canvas away.
      const wind = Math.sin(now * 0.00012) * 0.7 + Math.sin(now * 0.00041) * 0.3;
      drawLayer(backCtx, backFlakes, dt, wind, false);
      drawLayer(frontCtx, frontFlakes, dt, wind, true);
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
    window.addEventListener("scroll", measure, { passive: true });
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", resize);
      window.removeEventListener("scroll", measure);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  return (
    <>
      <canvas
        ref={backRef}
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 z-10 h-full w-full"
      />
      <canvas
        ref={frontRef}
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 z-30 h-full w-full blur-[3px]"
      />
    </>
  );
}
