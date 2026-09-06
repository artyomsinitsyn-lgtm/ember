"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Search, X } from "lucide-react";
import TokenIcon from "@/components/TokenIcon";
import { formatSol } from "@/lib/format";
import type { SerializedToken } from "@/lib/serialize";

interface WalletResult {
  id: string;
  name: string;
  avatar: string;
}

export default function SiteSearch() {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [tokens, setTokens] = useState<SerializedToken[]>([]);
  const [wallets, setWallets] = useState<WalletResult[]>([]);
  const [loading, setLoading] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    function onClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [open]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  useEffect(() => {
    if (q.trim().length < 2) {
      setTokens([]);
      setWallets([]);
      return;
    }
    setLoading(true);
    const id = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
        if (res.ok) {
          const data = await res.json();
          setTokens(data.tokens);
          setWallets(data.wallets);
        }
      } finally {
        setLoading(false);
      }
    }, 220);
    return () => clearTimeout(id);
  }, [q]);

  function close() {
    setOpen(false);
    setQ("");
  }

  const hasResults = tokens.length > 0 || wallets.length > 0;
  const showDropdown = open && q.trim().length >= 2;

  return (
    <div ref={containerRef} style={{ position: "relative" }}>
      {open ? (
        <div className="alloy-search-box">
          <Search size={14} style={{ color: "color-mix(in srgb, var(--text) 50%, transparent)", flex: "none" }} />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => e.key === "Escape" && close()}
            placeholder="Search tokens or traders…"
            className="alloy-search-input"
          />
          <button onClick={close} className="alloy-search-close" aria-label="Close search">
            <X size={14} />
          </button>
        </div>
      ) : (
        <button data-fx="magnet" onClick={() => setOpen(true)} className="alloy-search-btn" aria-label="Search">
          <Search size={15} />
        </button>
      )}

      {showDropdown && (
        <div className="alloy-search-dropdown">
          {loading ? (
            <div className="alloy-search-empty">Searching…</div>
          ) : !hasResults ? (
            <div className="alloy-search-empty">No results for &ldquo;{q}&rdquo;</div>
          ) : (
            <>
              {tokens.length > 0 && (
                <div style={{ marginBottom: 6 }}>
                  <div className="alloy-search-heading">TOKENS</div>
                  {tokens.map((t) => (
                    <Link key={t.id} href={`/token/${t.id}`} onClick={close} className="alloy-search-row press-effect">
                      <span className="alloy-icon-tile" style={{ width: 28, height: 28, flex: "none" }}>
                        <TokenIcon image={t.image} size={28} textSize="text-base" />
                      </span>
                      <span style={{ minWidth: 0, flex: 1 }}>
                        <div className="alloy-search-row-title">${t.ticker}</div>
                        <div className="alloy-search-row-sub">{t.name}</div>
                      </span>
                      <span className="alloy-search-row-meta">{formatSol(t.marketCap)}</span>
                    </Link>
                  ))}
                </div>
              )}
              {wallets.length > 0 && (
                <div>
                  <div className="alloy-search-heading">TRADERS</div>
                  {wallets.map((w) => (
                    <Link key={w.id} href={`/profile/${w.id}`} onClick={close} className="alloy-search-row press-effect">
                      <span className="alloy-icon-tile" style={{ width: 28, height: 28, borderRadius: "50%", flex: "none" }}>
                        <TokenIcon image={w.avatar} size={28} textSize="text-base" />
                      </span>
                      <span className="alloy-search-row-title">{w.name}</span>
                    </Link>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
