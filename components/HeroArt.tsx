import PrismCard from "@/components/PrismCard";
import AmbientGlow from "@/components/AmbientGlow";

/**
 * The about-page mascot slot: an ambient blue/violet/cyan glow drifts after the cursor
 * within this section (AmbientGlow), and a big three-layer holo disc (.alloy-mark-halo — a
 * slow-spinning iridescent conic sweep, a drifting coin-motif pattern, and a shine pass) sits
 * behind the mark, genuinely alive rather than a static glow. The mark itself picks up a
 * matching cursor-tracked sheen and a few degrees of tilt via the same PrismCard treatment
 * used on cards elsewhere — its default white radial sheen is recolored to the same
 * blue/violet/cyan hues in CSS (.alloy-logo-card .prism-card-sheen) so the logo reads as lit
 * by the glow behind it, not a separate rainbow foil effect.
 */
export default function HeroArt() {
  return (
    <div className="alloy-hero-art-mascot">
      <div className="alloy-ambient-stage">
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
