"use client";

import { useEffect, useRef } from "react";
import { pointerPercent, prefersReducedMotion } from "@/lib/pointerFx";

const MAX_TILT_DEG = 6;

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

  useEffect(() => {
    reducedMotion.current = prefersReducedMotion();
  }, []);

  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (reducedMotion.current) return;
    const card = cardRef.current;
    if (!card) return;
    const r = card.getBoundingClientRect();
    const { x: px, y: py } = pointerPercent(e.clientX, e.clientY, r);
    const ry = (px / 100 - 0.5) * 2 * MAX_TILT_DEG * intensity;
    const rx = -(py / 100 - 0.5) * 2 * MAX_TILT_DEG * intensity;
    card.style.setProperty("--px", `${px}%`);
    card.style.setProperty("--py", `${py}%`);
    card.style.setProperty("--rx", `${rx}deg`);
    card.style.setProperty("--ry", `${ry}deg`);
    if (sheenRef.current) sheenRef.current.style.opacity = String(0.55 * intensity + 0.1);
  }

  function onPointerLeave() {
    const card = cardRef.current;
    if (!card) return;
    card.style.setProperty("--rx", "0deg");
    card.style.setProperty("--ry", "0deg");
    if (sheenRef.current) sheenRef.current.style.opacity = "0";
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
