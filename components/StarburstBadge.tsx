/**
 * A stamped-seal "starburst" sticker — clean circular medal, radial-gradient fill, a
 * single diagonal shine sweep on a timed loop (sweep, then a pause, never a constant
 * shimmer). Used for the fee-split stat accent on the About page. No longer the GRADUATED
 * indicator (see GraduatedChip.tsx) — this seal's hover-move and small text were hard to
 * read at a glance, per feedback, so that badge became a plain pill instead. The shine
 * sweep itself is reused both by GraduatedChip's background shine and by the halo effect
 * behind the Alloy mark on the About page (see HeroArt.tsx). All motion is pure CSS
 * (background-position/transform + one prefers-reduced-motion override), so this needs no
 * client-side JS at all.
 */
export default function StarburstBadge({
  children,
  className,
  size = 56,
}: {
  children: React.ReactNode;
  className?: string;
  size?: number;
}) {
  return (
    <span className={`alloy-starburst ${className ?? ""}`} style={{ width: size, height: size }}>
      <span className="alloy-starburst-shine" />
      <span className="alloy-starburst-text" style={{ fontSize: size * 0.17, letterSpacing: size * 0.003 }}>
        {children}
      </span>
    </span>
  );
}
