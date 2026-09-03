"use client";

import { useEffect } from "react";

const LINK_CLASS = "alloy-wallet-manual-link";

/**
 * Adds an "or connect manually" link inside the stock @solana/wallet-adapter-react-ui
 * modal, under the wallet list — for wallets that never registered with the Wallet
 * Standard (so they never show up in that list at all): hardware wallets driven from the
 * CLI, mobile-only wallets without WalletConnect configured, anything exotic. The modal
 * itself is portaled straight into <body> by the library with no slot for extra content,
 * so this watches for it with a MutationObserver and appends a real DOM node — the same
 * "reach past a vendor component via direct DOM ops" approach CursorFx already uses for
 * its cursor overlay, rather than forking the package to add a prop that doesn't exist.
 */
export default function WalletManualLink() {
  useEffect(() => {
    const observer = new MutationObserver(() => {
      const wrapper = document.querySelector(".wallet-adapter-modal-wrapper");
      if (!wrapper || wrapper.querySelector(`.${LINK_CLASS}`)) return;
      const link = document.createElement("a");
      link.href = "/wallet/manual";
      link.className = LINK_CLASS;
      link.textContent = "or connect manually";
      wrapper.appendChild(link);
    });
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  return null;
}
