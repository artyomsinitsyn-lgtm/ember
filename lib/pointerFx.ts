/**
 * Shared low-level primitives behind every pointer-tracked visual effect on the site
 * (PrismCard's tilt/sheen, the about-page ambient glow) — one place that turns a raw
 * pointer event into a 0-100% position within an element, and one place that checks
 * prefers-reduced-motion, so each effect isn't reimplementing (and risking drifting
 * out of sync on) the same handful of lines. prefersReducedMotion() also returns true
 * under Performance Mode (lib/settings.ts, html.perf-mode) — same JS effects, same reason
 * to skip them, so it shares the one check rather than growing a second one.
 */

export function pointerPercent(clientX: number, clientY: number, rect: DOMRect): { x: number; y: number } {
  return {
    x: ((clientX - rect.left) / rect.width) * 100,
    y: ((clientY - rect.top) / rect.height) * 100,
  };
}

export function prefersReducedMotion(): boolean {
  if (typeof window === "undefined") return false;
  if (document.documentElement.classList.contains("perf-mode")) return true;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}
