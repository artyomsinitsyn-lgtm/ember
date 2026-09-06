export function formatCore(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(2)}k`;
  if (n >= 1) return n.toFixed(3);
  return n.toFixed(6);
}

/** Compact amount with a trailing "SOL" — every one of these figures is real SOL moved
 * 1:1 on-chain (see submitOnchain in BuySellPanel.tsx), so the label has to say so
 * honestly instead of implying USD with a "$" prefix, which is exactly the kind of
 * mislabeling that risks someone spending far more real money than they intend once
 * this runs with live funds (SOL trades well above $1). A live SOL->USD price feed can
 * add a secondary "≈ $X" figure later, but only alongside this, never in place of it. */
export function formatSol(n: number, opts?: { showPlus?: boolean }): string {
  const sign = n < 0 ? "-" : opts?.showPlus && n > 0 ? "+" : "";
  return `${sign}${formatCompact(Math.abs(n))} SOL`;
}

export function formatCompact(n: number): string {
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(2)}B`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(2)}K`;
  return n.toFixed(2);
}

export function formatPrice(n: number): string {
  if (n === 0) return "0";
  const abs = Math.abs(n);
  if (abs >= 0.01) return n.toFixed(4);
  // Sub-cent prices: always plain decimal (never exponential notation), with enough
  // digits to show ~4 significant figures past the leading zeros.
  const leadingZeros = Math.max(0, -Math.floor(Math.log10(abs)) - 1);
  const decimals = Math.min(20, leadingZeros + 4);
  return n.toFixed(decimals);
}

export function formatPct(n: number): string {
  return `${(n * 100).toFixed(1)}%`;
}

export function timeAgo(ts: number): string {
  const seconds = Math.floor((Date.now() - ts) / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

/** Same as timeAgo but without the " ago" suffix, for tight marketing-card layouts. */
export function timeAgoShort(ts: number): string {
  const seconds = Math.floor((Date.now() - ts) / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}

/** Formats a duration in seconds as a compact "3h 12m" / "45m" / "6m 12s" string. */
export function formatDuration(totalSeconds: number): string {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${secs}s`;
  return `${secs}s`;
}
