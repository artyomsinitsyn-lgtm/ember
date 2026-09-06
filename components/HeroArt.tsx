"use client";

import { useEffect, useRef } from "react";
import PrismCard from "@/components/PrismCard";
import AmbientGlow from "@/components/AmbientGlow";
import { pointerPercent, prefersReducedMotion } from "@/lib/pointerFx";

const MAX_STAGE_TILT_DEG = 16;
// Slower to settle than PrismCard's own micro-tilt (0.18) — the whole scene is a much
// bigger, heavier "object" than a single card, so it should feel like it has real weight and
// glide into place rather than snap, while the mark's own PrismCard tilt on top of this still
// reads as crisp. Two damping speeds layered together is what actually sells "3D", not just
// one flat tilt value applied everywhere at once.
const STAGE_DAMP = 0.1;

/**
 * The about-page mascot slot: an ambient blue/violet/cyan glow drifts after the cursor
 * within this section (AmbientGlow), and a big three-layer holo disc (.alloy-mark-halo — a
 * slow-spinning iridescent conic sweep, a drifting coin-motif pattern, and a shine pass) sits
 * behind the mark, genuinely alive rather than a static glow. The mark itself picks up a
 * matching cursor-tracked sheen and a few degrees of tilt via the same PrismCard treatment
 * used on cards elsewhere — its default white radial sheen is recolored to the same
 * blue/violet/cyan hues in CSS (.alloy-logo-card .prism-card-sheen) so the logo reads as lit
 * by the glow behind it, not a separate rainbow foil effect.
 *
 * On top of that, the whole stage (halo + mark together, not just the small mark puck) tilts
 * in 3D as one object via --stage-rx/--stage-ry below, eased over a slower RAF loop than
 * PrismCard's own — same damped-follow approach as AmbientGlow's cursor trail, just applied
 * to a rotation instead of a position. The halo and mark sit at different translateZ depths
 * (see .alloy-mark-halo / .alloy-logo-card in landing.css) so the same rotation reads as real
 * parallax, not a flat sticker tilting. The halo's iridescent spin layer also hue-shifts with
 * the tilt angle (--stage-ry drives a hue-rotate filter), so the "holo" colors genuinely
 * respond to mouse position instead of just looping on a fixed timer.
 */
export default function HeroArt() {
  const stageRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage || prefersReducedMotion()) return;

    const target = { rx: 0, ry: 0 };
    const current = { rx: 0, ry: 0 };
    let raf = 0;

    function onMove(e: PointerEvent) {
      const r = stage!.getBoundingClientRect();
      const { x, y } = pointerPercent(e.clientX, e.clientY, r);
      target.ry = (x / 100 - 0.5) * 2 * MAX_STAGE_TILT_DEG;
      target.rx = -(y / 100 - 0.5) * 2 * MAX_STAGE_TILT_DEG;
    }
    function onLeave() {
      target.rx = 0;
      target.ry = 0;
    }
    stage.addEventListener("pointermove", onMove);
    stage.addEventListener("pointerleave", onLeave);

    function tick() {
      current.rx += (target.rx - current.rx) * STAGE_DAMP;
      current.ry += (target.ry - current.ry) * STAGE_DAMP;
      stage!.style.setProperty("--stage-rx", `${current.rx.toFixed(3)}deg`);
      stage!.style.setProperty("--stage-ry", `${current.ry.toFixed(3)}deg`);
      raf = requestAnimationFrame(tick);
    }
    raf = requestAnimationFrame(tick);

    return () => {
      stage.removeEventListener("pointermove", onMove);
      stage.removeEventListener("pointerleave", onLeave);
      cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <div className="alloy-hero-art-mascot">
      <div ref={stageRef} className="alloy-ambient-stage alloy-ambient-stage-3d">
        <AmbientGlow />
        <div className="alloy-mark-halo">
          <span className="alloy-mark-halo-spin" />
          <span className="alloy-mark-halo-pattern" />
          <span className="alloy-mark-halo-shine" />
        </div>
        <PrismCard intensity={0.4} className="alloy-logo-card">
          <div className="alloy-logo-mark alloy-logo-mark-xl" />
        </PrismCard>
      </div>
      <div className="alloy-hero-art-mascot-label">THE ALLOY MARK</div>
    </div>
  );
}
