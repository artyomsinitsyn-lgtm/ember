import Link from "next/link";

/**
 * Plain link to a wallet's profile — the non-hover-card counterpart to WalletHoverCard.
 * Kept as a separate component (not a WalletHoverCard prop) so the "recommended" section
 * can be the one place that still pops the mini profile, without every other caller having
 * to opt out individually.
 */
export default function WalletLink({
  walletId,
  children,
  className,
}: {
  walletId: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Link
      href={`/profile/${walletId}`}
      className={`press-effect rounded-md px-1 py-0.5 hover:text-text transition-colors ${className ?? ""}`}
    >
      {children}
    </Link>
  );
}
