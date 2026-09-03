import { GraduationCap } from "lucide-react";

/**
 * Inline "Graduated" indicator — same shape/legibility recipe as the risk pills next to it
 * (bg-{color}/15 + text-{color}, small icon, rounded-full), not a separate ornate seal, so it
 * reads clearly at a glance instead of competing for attention. `up` (green) matches every
 * other graduated signal on the site (ProgressBar's graduated fill, the "Trading on Alloy
 * Pool" label). The only motion is a slow shine sweep confined to the chip's own background
 * (.alloy-grad-chip-shine) — no hover transform, so it never shifts under the pointer.
 */
export default function GraduatedChip({ className }: { className?: string }) {
  return (
    <span
      className={`relative overflow-hidden inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full bg-up/15 text-up shrink-0 ${className ?? ""}`}
    >
      <span className="alloy-grad-chip-shine" />
      <GraduationCap size={11} className="relative z-10 shrink-0" />
      <span className="relative z-10">Graduated</span>
    </span>
  );
}
