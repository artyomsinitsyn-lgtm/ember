"use client";

import { useEffect, useRef } from "react";
import { pointerPercent, prefersReducedMotion } from "@/lib/pointerFx";

const MAX_TILT_DEG = 6;
// Eases toward the pointer's target angle every animation frame instead of snapping the
// transform straight to it on each pointermove — pointermove fires at a jittery, uneven rate
// (mouse polling, not vsync), so driving the transform directly off it always reads as a
// slightly glitchy stutter no matter how short a CSS transition tries to smooth it. A RAF loop
// — decoupled entirely from event timing — is what actually reads as smooth, same fix already
// proven out in AmbientGlow's cursor-follow.
const DAMP = 0.18;

/**
 * Wraps children in the shared pointer-tracked holographic card treatment.
 * Pointer tracking is scoped to this card's own listeners (not window-level),
 * writes straight to element styles instead of React state so hovering never
 * triggers a re-render, and is skipped entirely under prefers-reduced-motion.
 *
 * `intensity` (0-1) scales the sheen/tilt strength — used by the leaderboard
 * to make higher ranks visibly richer, not just numerically higher.
 */
export default function PrismCard({
  children,
  className,
  style,
  intensity = 1,
  onClick,
}: {
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
  intensity?: number;
  onClick?: () => void;
}) {
  const cardRef = useRef<HTMLDivElement>(null);
  const sheenRef = useRef<HTMLDivElement>(null);
  const reducedMotion = useRef(false);
  const target = useRef({ px: 50, py: 50, rx: 0, ry: 0, active: false });
  const current = useRef({ px: 50, py: 50, rx: 0, ry: 0, opacity: 0 });

  useEffect(() => {
    reducedMotion.current = prefersReducedMotion();
    if (reducedMotion.current) return;

    let raf = 0;
    function tick() {
      const c = current.current;
      const t = target.current;
      c.px += (t.px - c.px) * DAMP;
      c.py += (t.py - c.py) * DAMP;
      c.rx += (t.rx - c.rx) * DAMP;
      c.ry += (t.ry - c.ry) * DAMP;
      c.opacity += ((t.active ? 0.55 * intensity + 0.1 : 0) - c.opacity) * DAMP;

      const card = cardRef.current;
      if (card) {
        card.style.setProperty("--px", `${c.px.toFixed(2)}%`);
        card.style.setProperty("--py", `${c.py.toFixed(2)}%`);
        card.style.setProperty("--rx", `${c.rx.toFixed(3)}deg`);
        card.style.setProperty("--ry", `${c.ry.toFixed(3)}deg`);
      }
      if (sheenRef.current) sheenRef.current.style.opacity = c.opacity.toFixed(3);

      raf = requestAnimationFrame(tick);
    }
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [intensity]);

  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (reducedMotion.current) return;
    const card = cardRef.current;
    if (!card) return;
    const r = card.getBoundingClientRect();
    const { x: px, y: py } = pointerPercent(e.clientX, e.clientY, r);
    target.current = {
      px,
      py,
      ry: (px / 100 - 0.5) * 2 * MAX_TILT_DEG * intensity,
      rx: -(py / 100 - 0.5) * 2 * MAX_TILT_DEG * intensity,
      active: true,
    };
  }

  function onPointerLeave() {
    target.current.rx = 0;
    target.current.ry = 0;
    target.current.active = false;
  }

  return (
    <div
      ref={cardRef}
      onPointerMove={onPointerMove}
      onPointerLeave={onPointerLeave}
      onClick={onClick}
      className={`prism-card ${className ?? ""}`}
      style={style}
    >
      {children}
      <div ref={sheenRef} className="prism-card-sheen" />
    </div>
  );
}
