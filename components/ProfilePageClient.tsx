"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useWallet } from "@solana/wallet-adapter-react";
import { Pencil, ImagePlus, Loader2, ShieldCheck, BadgeCheck, Wallet2, Users, Copy, Check } from "lucide-react";
import { formatCompact, formatUsd, timeAgo } from "@/lib/format";
import { STAKE_TICKER, VERIFIED_PROFIT_THRESHOLD } from "@/lib/constants";
import { REPUTATION_TIER_LABEL } from "@/lib/reputation";
import type { WalletProfile } from "@/lib/profile";
import type { WalletPosition } from "@/lib/positions";
import { useConnectedWalletId } from "@/lib/useConnectedWallet";
import TokenIcon from "@/components/TokenIcon";
import ProfileTokensPanel from "@/components/ProfileTokensPanel";
import ProfileTopTradesPanel from "@/components/ProfileTopTradesPanel";
import PositionRow from "@/components/PositionRow";
import ReportButton from "@/components/ReportButton";

interface TradeHistoryRow {
  id: string;
  token_id: string;
  side: string;
  core_amount: number;
  token_amount: number;
  price: number;
  created_at: number;
  ticker: string;
  image: string;
}

const BANNER_PRESETS = ["1", "2", "3", "4"];

function BannerVisual({ banner, bannerPreset }: { banner: string | null; bannerPreset: string | null }) {
  if (bannerPreset) {
    return <div className={`w-full h-full alloy-banner-preset-${bannerPreset}`} />;
  }
  if (banner) {
    return <TokenIcon image={banner} size={9999} />;
  }
  return null;
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div className="card p-4">
      <div className="text-[10px] text-text-dim uppercase tracking-wide">{label}</div>
      <div className={`mono font-medium mt-1 ${accent ?? ""}`}>{value}</div>
    </div>
  );
}

function VerificationPanel({
  id,
  profile,
  onVerified,
}: {
  id: string;
  profile: WalletProfile;
  onVerified: () => void;
}) {
  const [contactType, setContactType] = useState<"phone" | "email">("email");
  const [contactValue, setContactValue] = useState("");
  const [simulatedCode, setSimulatedCode] = useState<string | null>(null);
  const [codeInput, setCodeInput] = useState("");
  const [requesting, setRequesting] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function sendCode() {
    if (!contactValue.trim()) {
      setError("Enter a phone number or email");
      return;
    }
    setRequesting(true);
    setError(null);
    try {
      const res = await fetch(`/api/wallet/${id}/verify/request`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contact: contactValue, contactType }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to send code");
      setSimulatedCode(data.simulatedCode);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send code");
    } finally {
      setRequesting(false);
    }
  }

  async function confirmCode() {
    if (!codeInput.trim()) {
      setError("Enter the code");
      return;
    }
    setConfirming(true);
    setError(null);
    try {
      const res = await fetch(`/api/wallet/${id}/verify/confirm`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: codeInput }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to verify");
      setSimulatedCode(null);
      setCodeInput("");
      onVerified();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to verify");
    } finally {
      setConfirming(false);
    }
  }

  const profitPct = Math.min(100, (Math.max(0, profile.realizedPnl) / VERIFIED_PROFIT_THRESHOLD) * 100);

  return (
    <div className="card p-4 flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <ShieldCheck size={16} className={profile.verified ? "text-up" : "text-text-dim"} />
        <h2 className="text-sm font-medium">Verification</h2>
      </div>

      {profile.verified ? (
        <p className="text-xs text-up">
          Verified — contact confirmed and net trade profit is above ${VERIFIED_PROFIT_THRESHOLD}.
        </p>
      ) : (
        <>
          <p className="text-xs text-text-dim">
            A verified badge needs both a confirmed contact and ${VERIFIED_PROFIT_THRESHOLD} of net trade profit —
            profit alone is easy to fake by trading against yourself.
          </p>

          <div className="flex items-center justify-between text-xs">
            <span className="text-text-dim">Profit threshold</span>
            <span className="mono">
              {formatUsd(Math.max(0, profile.realizedPnl))} / ${VERIFIED_PROFIT_THRESHOLD}
            </span>
          </div>
          <div className="h-1.5 rounded-full bg-bg-elevated overflow-hidden">
            <div
              className={`h-full ${profile.profitThresholdMet ? "bg-up" : "bg-accent"}`}
              style={{ width: `${profitPct}%` }}
            />
          </div>

          <div className="flex items-center justify-between text-xs">
            <span className="text-text-dim">Contact</span>
            {profile.contactVerified ? (
              <span className="text-up">Verified ({profile.contactType})</span>
            ) : (
              <span className="text-text-dim">Not verified</span>
            )}
          </div>

          {!profile.contactVerified && (
            <div className="flex flex-col gap-2 pt-1 border-t border-border">
              {simulatedCode ? (
                <>
                  <div className="text-xs text-text-dim">
                    Simulated code — no real SMS/email is sent in this demo, a real deployment would deliver this
                    out-of-band: <span className="mono text-text">{simulatedCode}</span>
                  </div>
                  <div className="flex gap-2">
                    <input
                      value={codeInput}
                      onChange={(e) => setCodeInput(e.target.value)}
                      placeholder="6-digit code"
                      maxLength={6}
                      className="flex-1 bg-bg-elevated border border-border rounded-lg px-3 py-2 text-sm outline-none focus:border-accent"
                    />
                    <button
                      onClick={confirmCode}
                      disabled={confirming}
                      className="btn-shine glow-hover press-effect bg-accent text-black font-medium px-4 py-2 rounded-full text-sm disabled:opacity-50"
                    >
                      {confirming ? "Confirming…" : "Confirm"}
                    </button>
                  </div>
                </>
              ) : (
                <div className="flex gap-2">
                  <select
                    value={contactType}
                    onChange={(e) => setContactType(e.target.value as "phone" | "email")}
                    className="bg-bg-elevated border border-border rounded-lg px-2 py-2 text-sm outline-none focus:border-accent"
                  >
                    <option value="email">Email</option>
                    <option value="phone">Phone</option>
                  </select>
                  <input
                    value={contactValue}
                    onChange={(e) => setContactValue(e.target.value)}
                    placeholder={contactType === "email" ? "you@example.com" : "+1 555 555 5555"}
                    className="flex-1 bg-bg-elevated border border-border rounded-lg px-3 py-2 text-sm outline-none focus:border-accent"
                  />
                  <button
                    onClick={sendCode}
                    disabled={requesting}
                    className="glow-hover press-effect bg-bg-elevated border border-border font-medium px-4 py-2 rounded-full text-sm disabled:opacity-50 shrink-0"
                  >
                    {requesting ? "Sending…" : "Send code"}
                  </button>
                </div>
              )}
              {error && <div className="text-xs text-down">{error}</div>}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function MessagingSettingsPanel({
  id,
  verifiedOnlyMessages,
  onSaved,
}: {
  id: string;
  verifiedOnlyMessages: boolean;
  onSaved: () => void;
}) {
  const [saving, setSaving] = useState(false);

  async function toggle() {
    setSaving(true);
    try {
      await fetch(`/api/wallet/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ verifiedOnlyMessages: !verifiedOnlyMessages }),
      });
      onSaved();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="card p-4 flex items-center justify-between gap-3">
      <div className="flex items-start gap-2">
        <Users size={16} className="text-text-dim mt-0.5 shrink-0" />
        <div>
          <div className="text-sm font-medium">Only verified users can add or message me</div>
          <div className="text-xs text-text-dim mt-0.5">
            Cuts down on spam once you&apos;re ranked publicly — anyone can still see your profile, only verified
            wallets can reach out.
          </div>
        </div>
      </div>
      <button
        onClick={toggle}
        disabled={saving}
        role="switch"
        aria-checked={verifiedOnlyMessages}
        aria-label="Only verified users can add or message me"
        className={`glow-hover press-effect shrink-0 w-11 h-6 rounded-full relative transition-colors ${
          verifiedOnlyMessages ? "bg-accent" : "bg-bg-elevated border border-border"
        }`}
      >
        <span
          className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform ${
            verifiedOnlyMessages ? "translate-x-5" : "translate-x-0"
          }`}
        />
      </button>
    </div>
  );
}

function ActivityTab({ walletId }: { walletId: string }) {
  const [trades, setTrades] = useState<TradeHistoryRow[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/wallet/${walletId}/trades`)
      .then((r) => r.json())
      .then((data) => {
        if (!cancelled) setTrades(data.trades);
      });
    return () => {
      cancelled = true;
    };
  }, [walletId]);

  if (trades === null) return <div className="text-xs text-text-dim py-6 text-center">Loading…</div>;
  if (trades.length === 0) return <div className="text-xs text-text-dim py-6 text-center">No trades yet.</div>;

  return (
    <div className="flex flex-col gap-2 max-h-96 overflow-y-auto scrollbar-thin">
      {trades.map((t) => (
        <Link
          key={t.id}
          href={`/token/${t.token_id}`}
          className="glow-hover press-effect flex items-center justify-between text-xs rounded-lg px-2 py-1.5 -mx-2 hover:bg-bg-elevated"
        >
          <div className="flex items-center gap-2 min-w-0">
            <span className="w-5 h-5 rounded-full overflow-hidden inline-flex items-center justify-center shrink-0 bg-bg-elevated">
              <TokenIcon image={t.image} size={20} textSize="text-sm" />
            </span>
            <span className={t.side === "buy" ? "text-up" : "text-down"}>{t.side}</span>
            <span className="text-text-dim truncate">${t.ticker}</span>
          </div>
          <div className="mono text-text-dim shrink-0 tabular-nums">
            {formatUsd(t.core_amount)} · {timeAgo(t.created_at)}
          </div>
        </Link>
      ))}
    </div>
  );
}

const POSITIONS_PAGE_SIZE = 10;

type PositionsTab = "open" | "closed" | "activity";

function PositionsPanel({ walletId }: { walletId: string }) {
  const [positions, setPositions] = useState<WalletPosition[] | null>(null);
  const [tab, setTab] = useState<PositionsTab>("open");
  const [visibleCount, setVisibleCount] = useState(POSITIONS_PAGE_SIZE);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/wallet/${walletId}/positions`)
      .then((r) => r.json())
      .then((data) => {
        if (!cancelled) setPositions(data.positions);
      });
    return () => {
      cancelled = true;
    };
  }, [walletId]);

  useEffect(() => {
    setVisibleCount(POSITIONS_PAGE_SIZE);
  }, [tab]);

  const open = useMemo(() => (positions ?? []).filter((p) => p.open), [positions]);
  const closed = useMemo(() => (positions ?? []).filter((p) => !p.open), [positions]);

  const TABS: { id: PositionsTab; label: string }[] = [
    { id: "open", label: `Open (${open.length})` },
    { id: "closed", label: `Closed (${closed.length})` },
    { id: "activity", label: "Activity" },
  ];

  return (
    <div className="card p-4">
      <div className="flex gap-1 border-b border-border mb-3 overflow-x-auto scrollbar-thin">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-2.5 py-2 text-xs font-medium whitespace-nowrap border-b-2 transition-colors ${
              tab === t.id ? "border-accent text-text" : "border-transparent text-text-dim hover:text-text"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "activity" ? (
        <ActivityTab walletId={walletId} />
      ) : positions === null ? (
        <div className="text-xs text-text-dim py-6 text-center">Loading…</div>
      ) : (
        (() => {
          const list = tab === "open" ? open : closed;
          if (list.length === 0) {
            return (
              <div className="text-xs text-text-dim py-6 text-center">
                {tab === "open" ? "No open positions." : "No closed positions."}
              </div>
            );
          }
          const shown = list.slice(0, visibleCount);
          return (
            <div className="flex flex-col gap-1">
              {shown.map((p) => (
                <PositionRow key={p.token.id} position={p} />
              ))}
              {list.length > shown.length && (
                <button
                  onClick={() => setVisibleCount((c) => c + POSITIONS_PAGE_SIZE)}
                  className="glow-hover press-effect text-xs text-text-dim hover:text-text py-2 text-center"
                >
                  Load {Math.min(POSITIONS_PAGE_SIZE, list.length - shown.length)} more
                </button>
              )}
            </div>
          );
        })()
      )}
    </div>
  );
}

export default function ProfilePageClient({ id }: { id: string }) {
  const currentWalletId = useConnectedWalletId();
  const isOwnProfile = id === currentWalletId;
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { connected, publicKey, wallet } = useWallet();

  const bannerInputRef = useRef<HTMLInputElement>(null);
  const bannerMenuRef = useRef<HTMLDivElement>(null);
  const [profile, setProfile] = useState<WalletProfile | null>(null);
  const [externalContact, setExternalContact] = useState("");
  const [notFound, setNotFound] = useState(false);
  const [editing, setEditing] = useState(false);
  const [nameDraft, setNameDraft] = useState("");
  const [bioDraft, setBioDraft] = useState("");
  const [contactDraft, setContactDraft] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadingBanner, setUploadingBanner] = useState(false);
  const [bannerMenuOpen, setBannerMenuOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!bannerMenuOpen) return;
    function onClick(e: MouseEvent) {
      if (bannerMenuRef.current && !bannerMenuRef.current.contains(e.target as Node)) {
        setBannerMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [bannerMenuOpen]);

  async function load() {
    const res = await fetch(`/api/wallet/${id}/profile`);
    if (!res.ok) {
      setNotFound(true);
      return;
    }
    const data = await res.json();
    setProfile(data.profile);
    if (id === currentWalletId) {
      const walletRes = await fetch(`/api/wallet/${id}`);
      if (walletRes.ok) {
        const walletData = await walletRes.json();
        setExternalContact(walletData.wallet.externalContact ?? "");
      }
    }
  }

  useEffect(() => {
    let cancelled = false;
    async function tick() {
      if (cancelled) return;
      await load();
    }
    tick();
    const interval = setInterval(tick, 10000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  function startEditing() {
    if (!profile) return;
    setNameDraft(profile.name);
    setBioDraft(profile.bio ?? "");
    setContactDraft(externalContact);
    setError(null);
    setEditing(true);
  }

  async function patchWallet(body: Record<string, unknown>) {
    const res = await fetch(`/api/wallet/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Failed to save");
  }

  async function uploadFile(file: File): Promise<string> {
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
    const res = await fetch("/api/upload", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dataUrl }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Upload failed");
    return data.url as string;
  }

  async function onFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const url = await uploadFile(file);
      await patchWallet({ avatar: url });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  async function onBannerFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setUploadingBanner(true);
    setError(null);
    try {
      const url = await uploadFile(file);
      await patchWallet({ banner: url });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploadingBanner(false);
      setBannerMenuOpen(false);
    }
  }

  async function applyBannerPreset(presetId: string) {
    setUploadingBanner(true);
    setError(null);
    try {
      await patchWallet({ bannerPreset: presetId });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setUploadingBanner(false);
      setBannerMenuOpen(false);
    }
  }

  async function save() {
    if (!nameDraft.trim()) {
      setError("Enter a display name");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await patchWallet({
        name: nameDraft,
        bio: bioDraft,
        externalContact: contactDraft,
      });
      setEditing(false);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  async function copyAddress() {
    await navigator.clipboard.writeText(id);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  if (notFound) {
    return <div className="text-text-dim text-sm py-12 text-center">Wallet not found.</div>;
  }
  if (!profile) {
    return <div className="text-text-dim text-sm py-12 text-center">Loading…</div>;
  }

  const bannerHidden = (
    <input
      ref={bannerInputRef}
      type="file"
      accept="image/png,image/jpeg,image/webp,image/gif,image/avif,image/bmp"
      className="hidden"
      onChange={onBannerFileSelected}
    />
  );
  const avatarHidden = (
    <input
      ref={fileInputRef}
      type="file"
      accept="image/png,image/jpeg,image/webp,image/gif,image/avif,image/bmp"
      className="hidden"
      onChange={onFileSelected}
    />
  );

  const bannerBlock = isOwnProfile ? (
    <div className="relative" ref={bannerMenuRef}>
      {profile.banner || profile.bannerPreset ? (
        <button
          type="button"
          onClick={() => setBannerMenuOpen((v) => !v)}
          className="alloy-profile-banner alloy-profile-banner-clickable w-full text-left"
          aria-label="Change banner"
        >
          <BannerVisual banner={profile.banner} bannerPreset={profile.bannerPreset} />
          <div className="alloy-profile-banner-edit-hint">
            {uploadingBanner ? <Loader2 size={14} className="animate-spin" /> : <ImagePlus size={14} />}
            Change banner
          </div>
        </button>
      ) : (
        <button
          type="button"
          onClick={() => setBannerMenuOpen((v) => !v)}
          className="alloy-profile-banner-empty w-full"
        >
          {uploadingBanner ? <Loader2 size={14} className="animate-spin" /> : <ImagePlus size={14} />}
          Add a banner
        </button>
      )}
      {bannerMenuOpen && (
        <div className="alloy-banner-menu">
          <button type="button" className="alloy-banner-menu-upload" onClick={() => bannerInputRef.current?.click()}>
            <ImagePlus size={14} />
            Upload image
          </button>
          <div>
            <div className="alloy-banner-menu-label mb-1.5">Or pick a preset</div>
            <div className="alloy-banner-preset-grid">
              {BANNER_PRESETS.map((p) => (
                <button
                  key={p}
                  type="button"
                  aria-label={`Preset ${p}`}
                  onClick={() => applyBannerPreset(p)}
                  className={`alloy-banner-preset-swatch alloy-banner-preset-${p} ${
                    profile.bannerPreset === p ? "alloy-banner-preset-swatch-active" : ""
                  }`}
                />
              ))}
            </div>
          </div>
        </div>
      )}
      {bannerHidden}
    </div>
  ) : profile.banner || profile.bannerPreset ? (
    <div className="alloy-profile-banner">
      <BannerVisual banner={profile.banner} bannerPreset={profile.bannerPreset} />
    </div>
  ) : null;

  const avatarBlock = isOwnProfile ? (
    <span className="relative inline-flex shrink-0">
      <button
        type="button"
        onClick={() => fileInputRef.current?.click()}
        aria-label="Change profile picture"
        className="alloy-avatar-clickable w-16 h-16 rounded-full overflow-hidden inline-flex items-center justify-center shrink-0 bg-bg-elevated"
      >
        <TokenIcon image={profile.avatar} size={64} textSize="text-3xl" />
        <span className="alloy-avatar-edit-hint">
          {uploading ? <Loader2 size={16} className="animate-spin" /> : <ImagePlus size={16} />}
        </span>
      </button>
      {avatarHidden}
    </span>
  ) : (
    <div className="w-16 h-16 rounded-full overflow-hidden inline-flex items-center justify-center shrink-0 bg-bg-elevated">
      <TokenIcon image={profile.avatar} size={64} textSize="text-3xl" />
    </div>
  );

  const centerContent = (
    <div className="flex flex-col gap-6">
      {editing ? (
        <div className="card p-5 flex flex-col gap-4">
          <div>
            <label className="text-xs text-text-dim uppercase tracking-wide">Display name</label>
            <input
              value={nameDraft}
              onChange={(e) => setNameDraft(e.target.value)}
              maxLength={30}
              className="mt-1 w-full bg-bg-elevated border border-border rounded-lg px-3 py-2 text-sm outline-none focus:border-accent"
            />
          </div>

          <div>
            <label className="text-xs text-text-dim uppercase tracking-wide">Description</label>
            <textarea
              value={bioDraft}
              onChange={(e) => setBioDraft(e.target.value)}
              maxLength={280}
              rows={3}
              placeholder="A short line about you or what you trade"
              className="mt-1 w-full bg-bg-elevated border border-border rounded-lg px-3 py-2 text-sm outline-none focus:border-accent resize-none"
            />
          </div>

          <div>
            <label className="text-xs text-text-dim uppercase tracking-wide">
              How to reach you off-platform (optional)
            </label>
            <input
              value={contactDraft}
              onChange={(e) => setContactDraft(e.target.value)}
              maxLength={200}
              placeholder="Discord: yourname · shown only to people you accept a connection with"
              className="mt-1 w-full bg-bg-elevated border border-border rounded-lg px-3 py-2 text-sm outline-none focus:border-accent"
            />
          </div>

          {error && <div className="text-xs text-down">{error}</div>}

          <div className="flex gap-2">
            <button
              onClick={save}
              disabled={saving || uploading || uploadingBanner}
              data-fx="magnet"
              className="btn-shine glow-hover press-effect bg-accent text-black font-medium px-4 py-2 rounded-full text-sm hover:opacity-90 transition-opacity disabled:opacity-50"
            >
              {saving ? "Saving…" : "Save"}
            </button>
            <button
              onClick={() => setEditing(false)}
              className="glow-hover press-effect bg-bg-elevated border border-border font-medium px-4 py-2 rounded-full text-sm"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {bannerBlock}
          <div className="flex items-center gap-3">
            {avatarBlock}
            <div className="min-w-0">
              <h1 className="text-xl font-semibold flex items-center gap-1.5">
                {profile.name}
                {profile.verified && <BadgeCheck size={16} className="text-up" aria-label="Verified" />}
              </h1>
              <div className="text-sm text-text-dim">Member since {timeAgo(profile.createdAt)}</div>
              <div className="flex items-center gap-3 text-xs mt-1">
                <span>
                  <b className="mono">{profile.followers}</b> <span className="text-text-dim">followers</span>
                </span>
                <span>
                  <b className="mono">{profile.following}</b> <span className="text-text-dim">following</span>
                </span>
              </div>
            </div>
            {isOwnProfile ? (
              <button
                onClick={startEditing}
                aria-label="Edit profile"
                className="glow-hover press-effect ml-auto p-2 rounded-full bg-bg-elevated border border-border hover:border-accent/50 transition-colors shrink-0"
              >
                <Pencil size={14} />
              </button>
            ) : (
              <div className="ml-auto shrink-0">
                <ReportButton targetType="wallet" targetId={id} />
              </div>
            )}
          </div>
          {profile.bio && <p className="text-sm text-text-dim leading-relaxed max-w-lg">{profile.bio}</p>}
          {error && <div className="text-xs text-down">{error}</div>}
        </div>
      )}

      <button
        onClick={copyAddress}
        className="glow-hover press-effect card p-3 flex items-center gap-2 text-xs w-fit max-w-full"
      >
        <Wallet2 size={14} className="text-text-dim shrink-0" />
        <span className="mono truncate">{id}</span>
        {copied ? <Check size={13} className="text-up shrink-0" /> : <Copy size={13} className="text-text-dim shrink-0" />}
      </button>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <Stat label="Net Worth" value={formatUsd(profile.netWorth)} />
        <Stat
          label="Net Trade P&L"
          value={formatUsd(profile.realizedPnl, { showPlus: true })}
          accent={profile.realizedPnl >= 0 ? "text-up" : "text-down"}
        />
        <Stat label="Buy Volume" value={formatUsd(profile.buyVolume)} />
        <Stat label="Sell Volume" value={formatUsd(profile.sellVolume)} />
        <Stat label="Portfolio Value" value={formatUsd(profile.portfolioValue)} />
        <Stat label="Trades Made" value={String(profile.tradeCount)} />
        <Stat
          label="Tokens Created"
          value={
            profile.tokensCreated > 0
              ? `${profile.tokensCreated} (${profile.tokensGraduated} graduated)`
              : "0"
          }
        />
        <Stat label={`${STAKE_TICKER} Staked`} value={formatCompact(profile.staked)} />
        <Stat label={`${STAKE_TICKER} Rewards Claimed`} value={formatUsd(profile.lifetimeClaimed)} />
        {profile.reputationTier !== "new" && (
          <Stat
            label="Creator Reputation"
            value={REPUTATION_TIER_LABEL[profile.reputationTier]}
            accent={
              profile.reputationTier === "flagged"
                ? "text-down"
                : profile.reputationTier === "established"
                ? "text-up"
                : undefined
            }
          />
        )}
      </div>

      <p className="text-[11px] text-text-dim leading-relaxed">
        Net Trade P&L is total sell proceeds minus total buy cost across every Token — a simple net
        cash-flow figure, not a cost-basis accounting of unrealized positions.
      </p>

      {isOwnProfile && (
        <div className="card p-4 flex items-center gap-2 text-xs">
          <Wallet2 size={14} className={connected ? "text-up" : "text-text-dim"} />
          {connected && publicKey ? (
            <span>
              Connected via {wallet?.adapter.name ?? "wallet"} ({publicKey.toBase58().slice(0, 4)}…
              {publicKey.toBase58().slice(-4)})
            </span>
          ) : (
            <span className="text-text-dim">
              Not connected to a real wallet — using the demo identity. Connect wallet from the sidebar to link a
              real Solana address (identity only, no transactions are ever signed).
            </span>
          )}
        </div>
      )}

      {isOwnProfile && <VerificationPanel id={id} profile={profile} onVerified={load} />}
      {isOwnProfile && profile.verified && (
        <MessagingSettingsPanel id={id} verifiedOnlyMessages={profile.verifiedOnlyMessages} onSaved={load} />
      )}

      <PositionsPanel walletId={id} />
    </div>
  );

  return (
    <div className="alloy-dash-wide flex flex-col gap-6">
      <Link href="/" className="text-sm text-text-dim hover:text-text w-fit">
        ← Home
      </Link>
      <div className="alloy-profile-grid">
        <div className="alloy-profile-left">
          <ProfileTokensPanel walletId={id} />
        </div>
        <div className="alloy-profile-center">{centerContent}</div>
        <div className="alloy-profile-right">
          <ProfileTopTradesPanel walletId={id} />
        </div>
      </div>
    </div>
  );
}
