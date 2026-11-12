"use client";

import { useEffect } from "react";

/**
 * Sections rise into place as they come into view, once each.
 *
 * Mounted once per contest page, next to the snow. It watches everything
 * marked `data-reveal` and adds `is-in`; the motion itself is in
 * globals.css, because CSS transitions run off the main thread and a page
 * that is mostly scrolling should not be animating from JavaScript.
 *
 * `data-reveal="section"` moves the element. `data-reveal="stagger"` leaves
 * the container still and moves its children, 60ms apart, which is enough
 * to read as a sequence without making the last card wait.
 *
 * Two things it must never do. It must not leave content invisible: the
 * elements start hidden in CSS, so if `IntersectionObserver` is missing
 * everything is revealed at once instead, and ContestFrame carries a
 * <noscript> that unhides the page for a reader without JavaScript. And it
 * must not fight `prefers-reduced-motion`: there the CSS never hides
 * anything, so the observer has nothing to do and does not run.
 */
export default function Reveal() {
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const items = [...document.querySelectorAll<HTMLElement>("[data-reveal]")];
    if (items.length === 0) return;

    const show = (element: HTMLElement) => {
      if (element.dataset.reveal === "stagger") {
        // Capped: past half a second the last card reads as late, not as
        // part of the same movement.
        [...element.children].forEach((child, index) => {
          (child as HTMLElement).style.transitionDelay = `${Math.min(index, 8) * 60}ms`;
        });
      }
      element.classList.add("is-in");
    };

    if (typeof IntersectionObserver === "undefined") {
      for (const item of items) show(item);
      return;
    }

    // What is already on screen when the page loads is revealed at once: it
    // still fades, but it is never a blank stretch at the bottom of the
    // first screen waiting for a scroll that may not come. The observer
    // below only has to catch what the reader scrolls down to.
    const onScreen = (element: HTMLElement) => {
      const rect = element.getBoundingClientRect();
      return rect.top < window.innerHeight && rect.bottom > 0;
    };
    const waiting = items.filter((item) => {
      if (!onScreen(item)) return true;
      show(item);
      return false;
    });
    if (waiting.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          show(entry.target as HTMLElement);
          observer.unobserve(entry.target);
        }
      },
      // A little short of the bottom edge, so a section starts moving as it
      // arrives rather than after it has already been read.
      { rootMargin: "0px 0px -10% 0px", threshold: 0.04 },
    );
    for (const item of waiting) observer.observe(item);
    return () => observer.disconnect();
  }, []);

  return null;
}
