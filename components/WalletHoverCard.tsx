"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { BadgeCheck } from "lucide-react";
import { formatCompact, formatUsd, timeAgo } from "@/lib/format";
import { STAKE_TICKER } from "@/lib/constants";
import type { WalletProfile } from "@/lib/profile";
import TokenIcon from "./TokenIcon";
import ReputationBadge from "./ReputationBadge";

const GAP = 5;
const MARGIN = 10;
const MIN_W = 220;
const MAX_W = 280;

export default function WalletHoverCard({
  walletId,
  children,
  className,
}: {
  walletId: string;
  children: React.ReactNode;
  className?: string;
}) {
  const [profile, setProfile] = useState<WalletProfile | null>(null);
  const [show, setShow] = useState(false);
  // Phase 1: which side has room, and how wide the bubble gets to be there.
  const [dims, setDims] = useState<{ side: "left" | "right"; width: number } | null>(null);
  // Phase 2: once rendered at that width, its real height tells us where to sit vertically.
  const [pos, setPos] = useState<{ top: number; left: number; tailTop: number } | null>(null);
  const [entered, setEntered] = useState(false);
  const triggerRef = useRef<HTMLSpanElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);
  const loadingRef = useRef(false);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  async function handleEnter() {
    if (hideTimer.current) clearTimeout(hideTimer.current);
    setShow(true);
    if (!profile && !loadingRef.current) {
      loadingRef.current = true;
      try {
        const res = await fetch(`/api/wallet/${walletId}/profile`);
        if (res.ok) {
          const data = await res.json();
          setProfile(data.profile);
        }
      } finally {
        loadingRef.current = false;
      }
    }
  }

  function handleLeave() {
    hideTimer.current = setTimeout(() => {
      setShow(false);
      setDims(null);
      setPos(null);
      setEntered(false);
    }, 120);
  }

  // Phase 1 — pure geometry from the trigger + viewport, no need to know the bubble's
  // own size yet: which side actually has room, and how wide it gets to be there.
  useLayoutEffect(() => {
    if (!show || !triggerRef.current) return;
    const trigger = triggerRef.current.getBoundingClientRect();
    const spaceRight = window.innerWidth - trigger.right - GAP - MARGIN;
    const spaceLeft = trigger.left - GAP - MARGIN;
    const side: "left" | "right" = spaceRight >= MIN_W || spaceRight >= spaceLeft ? "right" : "left";
    const available = side === "right" ? spaceRight : spaceLeft;
    const width = Math.max(MIN_W, Math.min(MAX_W, available));
    setDims({ side, width });
  }, [show]);

  // Phase 2 — now that it's rendered (off-screen, invisible) at that width, measure its
  // real height (profile loading vs. loaded content differ) and place it vertically,
  // clamped to the viewport, plus where along its edge the tail should point.
  useLayoutEffect(() => {
    if (!show || !dims || !triggerRef.current || !popupRef.current) return;
    const trigger = triggerRef.current.getBoundingClientRect();
    const popup = popupRef.current.getBoundingClientRect();

    let top = trigger.top + trigger.height / 2 - popup.height / 2;
    top = Math.max(MARGIN, Math.min(top, window.innerHeight - popup.height - MARGIN));
    const tailTop = trigger.top + trigger.height / 2 - top;
    const left = dims.side === "right" ? trigger.right + GAP : trigger.left - GAP - dims.width;

    setPos({ top, left, tailTop });
    const raf = requestAnimationFrame(() => setEntered(true));
    return () => cancelAnimationFrame(raf);
  }, [show, dims, profile]);

  const side = dims?.side ?? "right";
  const width = dims?.width ?? MIN_W;
  const tailTop = pos?.tailTop ?? 20;
  const originX = side === "right" ? 0 : width;

  return (
    <span
      ref={triggerRef}
      className={`inline-block ${className ?? ""}`}
      onMouseEnter={handleEnter}
      onMouseLeave={handleLeave}
    >
      <Link href={`/profile/${walletId}`} className="press-effect rounded-md px-1 py-0.5 hover:text-text transition-colors">
        {children}
      </Link>

      {show &&
        createPortal(
          <div
            ref={popupRef}
            onMouseEnter={() => {
              if (hideTimer.current) clearTimeout(hideTimer.current);
            }}
            onMouseLeave={handleLeave}
            style={{
              position: "fixed",
              top: pos?.top ?? -9999,
              left: pos?.left ?? -9999,
              width,
              zIndex: 200,
              visibility: pos ? "visible" : "hidden",
              transformOrigin: `${originX}px ${tailTop}px`,
              transform: entered ? "scale(1)" : "scale(0.15)",
              opacity: entered ? 1 : 0,
              transition: "transform .42s cubic-bezier(.16,1,.3,1), opacity .3s ease",
            }}
          >
            <div className="card p-4 shadow-2xl" style={{ position: "relative" }}>
              {/* Tail, bordered to match the card outline — two stacked triangles. */}
              <div
                style={{
                  position: "absolute",
                  top: tailTop - 8,
                  ...(side === "right" ? { left: -9 } : { right: -9 }),
                  width: 0,
                  height: 0,
                  borderTop: "8px solid transparent",
                  borderBottom: "8px solid transparent",
                  ...(side === "right"
                    ? { borderRight: "9px solid var(--border)" }
                    : { borderLeft: "9px solid var(--border)" }),
                }}
              />
              <div
                style={{
                  position: "absolute",
                  top: tailTop - 7,
                  ...(side === "right" ? { left: -8 } : { right: -8 }),
                  width: 0,
                  height: 0,
                  borderTop: "7px solid transparent",
                  borderBottom: "7px solid transparent",
                  ...(side === "right"
                    ? { borderRight: "8px solid var(--bg-card)" }
                    : { borderLeft: "8px solid var(--bg-card)" }),
                }}
              />

              {!profile ? (
                <div className="text-xs text-text-dim">Loading…</div>
              ) : (
                <>
                  <div className="flex items-center gap-2 mb-3">
                    <span className="w-9 h-9 rounded-full overflow-hidden inline-flex items-center justify-center shrink-0 bg-bg-elevated">
                      <TokenIcon image={profile.avatar} size={36} textSize="text-2xl" />
                    </span>
                    <div className="min-w-0">
                      <div className="font-medium truncate flex items-center gap-1">
                        {profile.name}
                        {profile.verified && <BadgeCheck size={13} className="text-up shrink-0" aria-label="Verified" />}
                      </div>
                      <div className="text-[10px] text-text-dim">Member since {timeAgo(profile.createdAt)}</div>
                      <ReputationBadge tier={profile.reputationTier} />
                    </div>
                  </div>
                  <div className="flex items-center gap-3 text-[11px] mb-3 pb-3 border-b border-border">
                    <span>
                      <b className="mono">{profile.followers}</b>{" "}
                      <span className="text-text-dim">followers</span>
                    </span>
                    <span>
                      <b className="mono">{profile.following}</b>{" "}
                      <span className="text-text-dim">following</span>
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-y-1.5 text-xs">
                    <span className="text-text-dim">Net Worth</span>
                    <span className="mono text-right">{formatUsd(profile.netWorth)}</span>

                    <span className="text-text-dim">Net Trade P&L</span>
                    <span className={`mono text-right ${profile.realizedPnl >= 0 ? "text-up" : "text-down"}`}>
                      {formatUsd(profile.realizedPnl, { showPlus: true })}
                    </span>

                    <span className="text-text-dim">Buy Volume</span>
                    <span className="mono text-right">{formatUsd(profile.buyVolume)}</span>

                    <span className="text-text-dim">Sell Volume</span>
                    <span className="mono text-right">{formatUsd(profile.sellVolume)}</span>

                    <span className="text-text-dim">Tokens Created</span>
                    <span className="mono text-right">
                      {profile.tokensCreated}
                      {profile.tokensCreated > 0 ? ` (${profile.tokensGraduated}✓)` : ""}
                    </span>

                    <span className="text-text-dim">{STAKE_TICKER} Staked</span>
                    <span className="mono text-right">{formatCompact(profile.staked)}</span>
                  </div>
                </>
              )}
            </div>
          </div>,
          document.body
        )}
    </span>
  );
}
