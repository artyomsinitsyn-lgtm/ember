"use client";

import { useEffect, useRef } from "react";
import { pointerPercent, prefersReducedMotion } from "@/lib/pointerFx";

// How much of the gap to the cursor's target position the glow closes each frame — small
// on purpose so it drifts after the pointer instead of locking to it.
const DAMP = 0.055;
const DRIFT_PERIOD_MS = 18000;
const DRIFT_AMPLITUDE = 7;
const REST_POS = { x: 50, y: 38 };

/**
 * Ambient cursor-following glow, scoped to whatever section renders it — two large, soft,
 * blurred blobs (blue-dominant, a hint of violet/cyan) whose center is driven by --mx/--my
 * on the host element. Position tracking reuses the same pointerPercent()/prefersReducedMotion()
 * primitives PrismCard uses, then layers two things on top that PrismCard's instant 1:1
 * tracking doesn't need: an eased/damped follow (so the glow trails the cursor rather than
 * snapping to it) and a slow independent idle drift (so it's still alive when the cursor
 * stops moving), both folded into one requestAnimationFrame loop that only ever touches the
 * --mx/--my custom properties — never anything that triggers layout.
 */
export default function AmbientGlow({ className }: { className?: string }) {
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    if (prefersReducedMotion()) {
      host.style.setProperty("--mx", `${REST_POS.x}%`);
      host.style.setProperty("--my", `${REST_POS.y}%`);
      return;
    }

    const target = { ...REST_POS };
    const current = { ...REST_POS };
    const start = performance.now();
    let raf = 0;

    function onMove(e: PointerEvent) {
      const r = host!.getBoundingClientRect();
      const p = pointerPercent(e.clientX, e.clientY, r);
      target.x = p.x;
      target.y = p.y;
    }
    function onLeave() {
      target.x = REST_POS.x;
      target.y = REST_POS.y;
    }
    host.addEventListener("pointermove", onMove);
    host.addEventListener("pointerleave", onLeave);

    function tick(now: number) {
      const t = (now - start) / DRIFT_PERIOD_MS;
      const driftX = Math.sin(t * Math.PI * 2) * DRIFT_AMPLITUDE;
      const driftY = Math.cos(t * Math.PI * 2 * 0.82) * DRIFT_AMPLITUDE * 0.65;

      current.x += (target.x - current.x) * DAMP;
      current.y += (target.y - current.y) * DAMP;

      host!.style.setProperty("--mx", `${(current.x + driftX).toFixed(2)}%`);
      host!.style.setProperty("--my", `${(current.y + driftY).toFixed(2)}%`);
      raf = requestAnimationFrame(tick);
    }
    raf = requestAnimationFrame(tick);

    return () => {
      host.removeEventListener("pointermove", onMove);
      host.removeEventListener("pointerleave", onLeave);
      cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <div ref={hostRef} className={`alloy-ambient-glow ${className ?? ""}`}>
      <div className="alloy-ambient-blob alloy-ambient-blob-a" />
      <div className="alloy-ambient-blob alloy-ambient-blob-b" />
    </div>
  );
}
