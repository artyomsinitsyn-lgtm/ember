"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { useWallet, useConnection } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import TokenIcon from "@/components/TokenIcon";
import RoadmapEditor from "@/components/RoadmapEditor";
import { STAKE_TICKER, TRADE_FEE_BPS, POST_GRADUATION_TRADE_FEE_BPS, FEE_SPLIT, BPS_DENOM } from "@/lib/constants";
import { getProgram } from "@/lib/onchain/program";
import { buildInitializeCurveTx } from "@/lib/onchain/actions";
import type { Milestone } from "@/lib/projects";

const EMOJI_CHOICES = ["🔥", "🦊", "⚡", "🌟", "🏺", "🐉", "🌊", "🪨", "🍀", "💀", "🎯", "🧊"];

type Tier = "basic" | "project";

export default function CreatePage() {
  const router = useRouter();
  const wallet = useWallet();
  const { connection } = useConnection();
  const { setVisible } = useWalletModal();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [tier, setTier] = useState<Tier>("basic");
  const [ticker, setTicker] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [image, setImage] = useState("🔥");
  const [twitter, setTwitter] = useState("");
  const [telegram, setTelegram] = useState("");
  const [website, setWebsite] = useState("");
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Idea/Project tier only — never touches the Basic Token submit path below.
  const [tagline, setTagline] = useState("");
  const [details, setDetails] = useState("");
  const [discord, setDiscord] = useState("");
  const [github, setGithub] = useState("");
  const [roadmap, setRoadmap] = useState<Milestone[]>([]);

  async function handleFile(file: File | undefined | null) {
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
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
      setImage(data.url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!wallet.connected || !wallet.publicKey || !wallet.signTransaction) {
      setVisible(true);
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const program = getProgram(connection, {
        publicKey: wallet.publicKey,
        signTransaction: wallet.signTransaction,
        signAllTransactions: wallet.signAllTransactions ?? (async (txs) => Promise.all(txs.map((t) => wallet.signTransaction!(t)))),
      });
      const { tx, extraSigners, mint } = await buildInitializeCurveTx(program, wallet.publicKey);
      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
      tx.recentBlockhash = blockhash;
      tx.feePayer = wallet.publicKey;

      const signature = await wallet.sendTransaction(tx, connection, { signers: extraSigners });
      await connection.confirmTransaction({ signature, blockhash, lastValidBlockHeight }, "confirmed");

      const res = await fetch("/api/tokens", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ticker,
          name,
          description,
          image,
          twitter,
          telegram,
          website,
          mintAddress: mint.toBase58(),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to launch");

      // Idea/Project tier: the token is already live from the call above — this second
      // call just attaches the optional rich metadata to it. If it fails, the token still
      // exists and isn't lost; the creator can finish setup later from the token page's
      // "Turn this into a Project" panel, so we still redirect rather than blocking here.
      if (tier === "project") {
        try {
          await fetch(`/api/tokens/${data.token.id}/project`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ tagline, details, discord, github, roadmap }),
          });
        } catch {
          // recoverable via the token page's edit panel — not worth blocking the redirect
        }
      }

      router.push(`/token/${data.token.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to launch");
      setSubmitting(false);
    }
  }

  const isImageUrl = image.startsWith("/") || image.startsWith("http") || image.startsWith("data:");

  return (
    <div className="alloy-dash">
      <div className="alloy-kicker">NO CODE · FREE TO LAUNCH</div>
      <h1 className="alloy-h1-page">Create a token</h1>
      <p className="alloy-p">
        One form, one signature. Trading opens on the next block and the chart starts at the first buy.
      </p>

      <div className="alloy-underline-tabs" style={{ marginBottom: 22 }}>
        <button
          type="button"
          onClick={() => setTier("basic")}
          className={`alloy-underline-tab ${tier === "basic" ? "alloy-underline-tab-active" : ""}`}
        >
          Basic Token
        </button>
        <button
          type="button"
          onClick={() => setTier("project")}
          className={`alloy-underline-tab ${tier === "project" ? "alloy-underline-tab-active" : ""}`}
        >
          Idea / Project
        </button>
      </div>

      <form
        onSubmit={onSubmit}
        style={{ display: "grid", gridTemplateColumns: "minmax(0,1.35fr) minmax(0,.65fr)", gap: 26, alignItems: "start" }}
      >
        <div className="alloy-panel" style={{ display: "flex", flexDirection: "column", gap: 22 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 200px", gap: 18 }}>
            <label>
              <span className="alloy-label">TOKEN NAME</span>
              <input
                required
                maxLength={40}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Galvanized Goose"
                className="alloy-input"
              />
            </label>
            <label>
              <span className="alloy-label">TICKER</span>
              <input
                required
                maxLength={10}
                value={ticker}
                onChange={(e) => setTicker(e.target.value.toUpperCase())}
                placeholder="GALV"
                className="alloy-input mono"
                style={{ textTransform: "uppercase" }}
              />
            </label>
          </div>

          <label>
            <span className="alloy-label">DESCRIPTION</span>
            <textarea
              maxLength={280}
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What is this token about?"
              className="alloy-textarea"
            />
          </label>

          <div style={{ display: "grid", gridTemplateColumns: "132px 1fr", gap: 18, alignItems: "center" }}>
            <div
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(e) => {
                e.preventDefault();
                if (!dragging) setDragging(true);
              }}
              onDragLeave={(e) => {
                e.preventDefault();
                setDragging(false);
              }}
              onDrop={(e) => {
                e.preventDefault();
                setDragging(false);
                handleFile(e.dataTransfer.files?.[0]);
              }}
              style={{
                position: "relative",
                overflow: "hidden",
                aspectRatio: "1/1",
                borderRadius: 14,
                cursor: "pointer",
                border: `1px dashed ${dragging ? "rgba(226,236,245,.7)" : "rgba(255,255,255,.28)"}`,
                background: dragging
                  ? "rgba(226,236,245,.14)"
                  : "repeating-linear-gradient(45deg,rgba(255,255,255,.05) 0 7px,rgba(255,255,255,.02) 7px 14px)",
                boxShadow: dragging ? "0 0 0 3px rgba(200,220,240,.14)" : "none",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                transition: "border-color .2s,background .2s,box-shadow .2s",
              }}
            >
              {uploading ? (
                <Loader2 size={20} className="animate-spin" style={{ color: "color-mix(in srgb, var(--text) 75%, transparent)" }} />
              ) : (
                <TokenIcon image={image} size={132} textSize="text-5xl" />
              )}
            </div>
            <div>
              <div style={{ fontSize: 13.5, lineHeight: 1.55, color: "color-mix(in srgb, var(--text) 55%, transparent)" }}>
                PNG, JPG, WEBP or GIF. Pick an emoji instead if you don&apos;t have art yet.
              </div>
              <div style={{ display: "flex", gap: 9, marginTop: 13 }}>
                <button
                  type="button"
                  data-fx="magnet"
                  onClick={() => fileInputRef.current?.click()}
                  className="alloy-chip"
                >
                  {isImageUrl ? "Replace image" : "Upload image"}
                </button>
                {isImageUrl && (
                  <button type="button" data-fx="magnet" onClick={() => setImage("🔥")} className="alloy-chip">
                    Remove
                  </button>
                )}
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif,image/avif,image/bmp"
                style={{ display: "none" }}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  e.target.value = "";
                  handleFile(file);
                }}
              />
            </div>
          </div>

          <div style={{ height: 1, background: "rgba(255,255,255,.09)" }} />

          <div>
            <span className="alloy-label" style={{ marginBottom: 10, display: "block" }}>
              LINKS (OPTIONAL)
            </span>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
              <input
                value={twitter}
                onChange={(e) => setTwitter(e.target.value)}
                maxLength={200}
                placeholder="X / Twitter URL"
                className="alloy-input"
              />
              <input
                value={telegram}
                onChange={(e) => setTelegram(e.target.value)}
                maxLength={200}
                placeholder="Telegram URL"
                className="alloy-input"
              />
              <input
                value={website}
                onChange={(e) => setWebsite(e.target.value)}
                maxLength={200}
                placeholder="Website URL"
                className="alloy-input"
              />
            </div>
          </div>

          <div style={{ height: 1, background: "rgba(255,255,255,.09)" }} />

          <div>
            <span className="alloy-label" style={{ marginBottom: 10 }}>OR PICK AN ICON</span>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {EMOJI_CHOICES.map((e) => (
                <button
                  type="button"
                  key={e}
                  data-fx="magnet"
                  onClick={() => setImage(e)}
                  className={`alloy-chip ${image === e ? "active" : ""}`}
                  style={{ fontSize: 16, padding: "8px 12px" }}
                >
                  {e}
                </button>
              ))}
            </div>
          </div>

          {tier === "project" && (
            <>
              <div style={{ height: 1, background: "rgba(255,255,255,.09)" }} />
              <div>
                <span className="alloy-label" style={{ marginBottom: 10, display: "block" }}>
                  PROJECT DETAILS
                </span>
                <label style={{ display: "block", marginBottom: 18 }}>
                  <span className="alloy-label">TAGLINE</span>
                  <input
                    value={tagline}
                    onChange={(e) => setTagline(e.target.value.slice(0, 140))}
                    placeholder="A one-line pitch shown on cards"
                    className="alloy-input"
                  />
                </label>
                <label>
                  <span className="alloy-label">FULL DESCRIPTION</span>
                  <textarea
                    rows={4}
                    value={details}
                    onChange={(e) => setDetails(e.target.value.slice(0, 4000))}
                    placeholder="What are you building, and why?"
                    className="alloy-textarea"
                  />
                </label>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18, marginTop: 18 }}>
                  <label>
                    <span className="alloy-label">DISCORD</span>
                    <input
                      value={discord}
                      onChange={(e) => setDiscord(e.target.value.slice(0, 200))}
                      placeholder="https://discord.gg/..."
                      className="alloy-input"
                    />
                  </label>
                  <label>
                    <span className="alloy-label">GITHUB</span>
                    <input
                      value={github}
                      onChange={(e) => setGithub(e.target.value.slice(0, 200))}
                      placeholder="https://github.com/..."
                      className="alloy-input"
                    />
                  </label>
                </div>
                <div style={{ marginTop: 18 }}>
                  <span className="alloy-label" style={{ marginBottom: 10, display: "block" }}>
                    ROADMAP
                  </span>
                  <RoadmapEditor milestones={roadmap} onChange={setRoadmap} />
                </div>
              </div>
            </>
          )}
        </div>

        <div className="alloy-panel-dark" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ fontFamily: "var(--alloy-display)", fontSize: 19, letterSpacing: ".02em", textTransform: "uppercase", color: "var(--text)" }}>
            Preview
          </div>
          <div
            style={{
              display: "flex",
              gap: 12,
              alignItems: "center",
              padding: 14,
              borderRadius: 12,
              background: "rgba(0,0,0,.35)",
              border: "1px solid var(--border)",
            }}
          >
            <div className="alloy-icon-tile" style={{ width: 42, height: 42, flex: "none" }}>
              <TokenIcon image={image} size={42} textSize="text-2xl" />
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontFamily: "var(--alloy-display)", fontSize: 15, color: "var(--text)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {name || "Untitled token"}
              </div>
              <div style={{ fontFamily: "var(--alloy-mono)", fontSize: 11, color: "color-mix(in srgb, var(--text) 50%, transparent)", marginTop: 3 }}>
                {ticker ? `$${ticker}` : "$TICKER"}
              </div>
            </div>
          </div>

          <div>
            <div className="alloy-row">
              <span className="alloy-row-k">Deploy cost</span>
              <span className="alloy-row-v">Free</span>
            </div>
            <div className="alloy-row">
              <span className="alloy-row-k">Trade fee</span>
              <span className="alloy-row-v">{TRADE_FEE_BPS / 100}%</span>
            </div>
            <div className="alloy-row">
              <span className="alloy-row-k">→ after graduation</span>
              <span className="alloy-row-v">{POST_GRADUATION_TRADE_FEE_BPS / 100}%</span>
            </div>
            <div className="alloy-row">
              <span className="alloy-row-k">→ to you as creator</span>
              <span className="alloy-row-v">{(FEE_SPLIT.creator / BPS_DENOM) * 100}%</span>
            </div>
            <div className="alloy-row">
              <span className="alloy-row-k">→ to {STAKE_TICKER} stakers</span>
              <span className="alloy-row-v">{(FEE_SPLIT.staker / BPS_DENOM) * 100}%</span>
            </div>
            <div className="alloy-row">
              <span className="alloy-row-k">→ to treasury</span>
              <span className="alloy-row-v">{(FEE_SPLIT.treasury / BPS_DENOM) * 100}%</span>
            </div>
          </div>

          {error && <div style={{ color: "#c98a8a", fontSize: 13 }}>{error}</div>}

          <button
            type="submit"
            disabled={submitting || uploading}
            data-fx="magnet"
            data-shake="1"
            className="alloy-btn-primary"
            style={{ width: "100%", marginTop: 8 }}
          >
            {submitting ? "Confirming on-chain…" : wallet.connected ? "Create token" : "Connect wallet to launch"}
          </button>
          <div style={{ fontFamily: "var(--alloy-mono)", fontSize: 10, letterSpacing: ".1em", color: "color-mix(in srgb, var(--text) 35%, transparent)", textAlign: "center" }}>
            REAL ON-CHAIN MINT · ONE SIGNATURE · NO PRE-ALLOCATION
          </div>
        </div>
      </form>
    </div>
  );
}
