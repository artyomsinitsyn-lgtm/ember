"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { prefersReducedMotion } from "@/lib/pointerFx";

/**
 * Site-wide custom cursor + click-burst + magnetic-hover system. Mounted once in the
 * root layout so every page shares the exact same cursor and button feel as the
 * homepage, not a lookalike per-page recreation. The native OS cursor is hidden
 * unconditionally in CSS (see globals.css) — this component owns the replacement, and
 * always renders and tracks the pointer even under prefers-reduced-motion, so there's
 * never a state where neither cursor is visible. Reduced motion only skips the *extra*
 * motion on top of that base tracking: click-burst particles, the magnetic hover pull,
 * and the page-shake effect.
 *
 * No trailing glow blob — it used to lerp toward the pointer over a rAF loop, which
 * looked like a stuck/glitchy trail whenever a frame got dropped. The dot below tracks
 * the pointer 1:1 off the pointermove event itself, so there's nothing to desync.
 *
 * The dot morphs into a thin text-beam over inputs/textareas/editable content, smoothly
 * (CSS transition on the shape properties, no added glow).
 *
 * Windowed-mode native-cursor flash (switching browser tabs, or clicking a link like the
 * ticker's, which — via PageTransition's `key={pathname}` — remounts the entire page subtree
 * under the pointer): both replace whatever DOM element the pointer is resting over without
 * any real pointermove event firing. Browsers only re-run cursor hit-testing (which element's
 * `cursor` style applies at this point) in response to actual pointer events — they don't
 * proactively redo it just because the element underneath changed — so for one frame the OS
 * can fall back to its default arrow before the next real mouse move forces a fresh hit-test
 * against `* { cursor: none !important }`. resync() below covers both cases: it replays the
 * last known pointer position as a synthetic pointermove (dispatched at the actual DOM node
 * now under that point, so hit-testing has something fresh to resolve against) on tab
 * refocus/visibility-regain and after every route change.
 */
const TYPABLE_SELECTOR = 'input:not([type="range"]),textarea,[contenteditable="true"]';

export default function CursorFx() {
  const pathname = usePathname();
  const hostRef = useRef<HTMLDivElement>(null);
  const curRef = useRef<HTMLDivElement | null>(null);
  const pipRef = useRef<HTMLDivElement | null>(null);
  const capsRef = useRef<HTMLDivElement[]>([]);
  const magnetRef = useRef<HTMLElement | null>(null);
  const modeRef = useRef<"default" | "text">("default");
  const lastPos = useRef({ x: 0, y: 0 });
  const resyncRef = useRef<() => void>(() => {});

  useEffect(() => {
    resyncRef.current();
  }, [pathname]);

  useEffect(() => {
    const reducedMotion = prefersReducedMotion();

    const host = hostRef.current;
    if (!host) return;

    const cur = document.createElement("div");
    cur.style.cssText =
      "position:absolute;left:0;top:0;width:20px;height:20px;margin:-10px 0 0 -10px;border-radius:50%;background:conic-gradient(from 210deg,#ffffff,#8e9aa7 25%,#f4f8fb 42%,#59636e 62%,#dfe7ee 82%,#ffffff);box-shadow:0 1px 0 rgba(255,255,255,.9) inset,0 0 0 1px rgba(10,14,18,.55),0 4px 12px rgba(0,0,0,.6);transition:width .18s cubic-bezier(.4,0,.2,1),height .18s cubic-bezier(.4,0,.2,1),margin .18s cubic-bezier(.4,0,.2,1),border-radius .18s cubic-bezier(.4,0,.2,1),background .18s ease,box-shadow .18s ease";
    const pip = document.createElement("div");
    pip.style.cssText =
      "position:absolute;inset:6px;border-radius:50%;background:#0a0e12;opacity:.85;transition:inset .18s cubic-bezier(.4,0,.2,1),opacity .12s ease";
    cur.appendChild(pip);
    pipRef.current = pip;

    const caps: HTMLDivElement[] = [true, false].map((top) => {
      const d = document.createElement("div");
      d.style.cssText = `position:absolute;left:-3.5px;${top ? "top:-1px" : "bottom:-1px"};width:10px;height:2px;background:#e4ebf1;border-radius:1px;opacity:0;transition:opacity .15s ease`;
      cur.appendChild(d);
      return d;
    });
    capsRef.current = caps;

    host.appendChild(cur);
    curRef.current = cur;

    function setMode(mode: "default" | "text") {
      if (modeRef.current === mode) return;
      modeRef.current = mode;
      const text = mode === "text";
      const c = cur.style;
      c.width = text ? "3px" : "20px";
      c.height = text ? "26px" : "20px";
      c.margin = text ? "-13px 0 0 -1.5px" : "-10px 0 0 -10px";
      c.borderRadius = text ? "1.5px" : "50%";
      c.background = text
        ? "linear-gradient(180deg,#f2f6fa,#aab5c0 50%,#f2f6fa)"
        : "conic-gradient(from 210deg,#ffffff,#8e9aa7 25%,#f4f8fb 42%,#59636e 62%,#dfe7ee 82%,#ffffff)";
      c.boxShadow = text
        ? "0 0 0 1px rgba(10,14,18,.5)"
        : "0 1px 0 rgba(255,255,255,.9) inset,0 0 0 1px rgba(10,14,18,.55),0 4px 12px rgba(0,0,0,.6)";
      if (pipRef.current) {
        pipRef.current.style.opacity = text ? "0" : ".85";
        pipRef.current.style.inset = text ? "1px" : "6px";
      }
      capsRef.current.forEach((k) => {
        k.style.opacity = text ? "1" : "0";
      });
    }

    function burst(x: number, y: number, target: EventTarget | null) {
      if (reducedMotion) return;

      const h = hostRef.current;
      if (!h) return;

      const c = curRef.current;
      if (c && modeRef.current !== "text") {
        c.style.width = "15px";
        c.style.height = "15px";
        c.style.margin = "-7.5px 0 0 -7.5px";
        setTimeout(() => {
          if (curRef.current && modeRef.current !== "text") {
            curRef.current.style.width = "20px";
            curRef.current.style.height = "20px";
            curRef.current.style.margin = "-10px 0 0 -10px";
          }
        }, 130);
      }

      const ring = document.createElement("div");
      ring.style.cssText = `position:absolute;left:${x}px;top:${y}px;width:34px;height:34px;border-radius:50%;border:1px solid rgba(255,255,255,.6);box-shadow:0 0 9px rgba(190,215,240,.3);animation:al-ring .5s cubic-bezier(.2,.7,.3,1) forwards`;
      h.appendChild(ring);
      setTimeout(() => ring.remove(), 560);

      const blob = document.createElement("div");
      blob.style.cssText = `position:absolute;left:${x}px;top:${y}px;width:46px;height:46px;margin:-23px 0 0 -23px;border-radius:50%;mix-blend-mode:screen;background:radial-gradient(circle,rgba(255,255,255,.42),rgba(150,175,200,.13) 45%,rgba(0,0,0,0) 72%);animation:al-ring .42s ease-out forwards`;
      h.appendChild(blob);
      setTimeout(() => blob.remove(), 480);

      const n = 5;
      for (let i = 0; i < n; i++) {
        const a = (Math.PI * 2 * i) / n + Math.random() * 0.7;
        const d = 16 + Math.random() * 24;
        const s = document.createElement("div");
        const fs = 20 + Math.random() * 10;
        s.textContent = "¢";
        s.style.cssText = `position:absolute;left:${x}px;top:${y}px;font:700 ${fs.toFixed(1)}px/1 var(--font-heading),sans-serif;background:linear-gradient(180deg,#ffffff,#e3eaf1 30%,#8b97a3 58%,#f2f6fa);-webkit-background-clip:text;background-clip:text;color:transparent;filter:drop-shadow(0 0 3px rgba(210,230,250,.55));--dx:${(
          Math.cos(a) * d
        ).toFixed(1)}px;--dy:${(Math.sin(a) * d).toFixed(1)}px;--rot:${(Math.random() * 200 - 100).toFixed(
          0
        )}deg;animation:al-shard ${(0.42 + Math.random() * 0.3).toFixed(2)}s cubic-bezier(.15,.7,.3,1) forwards`;
        h.appendChild(s);
        setTimeout(() => s.remove(), 800);
      }

      const shaker = target instanceof Element ? target.closest('[data-shake="1"]') : null;
      if (shaker) {
        // Shakes the page-content wrapper, never <body> — a transform on body would make
        // body the containing block for every position:fixed descendant (this cursor's own
        // host div, and the wallet-adapter modal, which portals straight into <body>), so
        // both would visibly jump/reflow with the shake for its duration. .alloy-page holds
        // none of those, so they're untouched.
        const shakeTarget = document.querySelector(".alloy-page") as HTMLElement | null;
        if (shakeTarget) {
          shakeTarget.style.animation = "al-shake .38s ease-in-out";
          setTimeout(() => {
            shakeTarget.style.animation = "";
          }, 420);
        }
      }
    }

    const onDown = (e: PointerEvent) => burst(e.clientX, e.clientY, e.target);
    window.addEventListener("pointerdown", onDown, true);

    const onMove = (e: PointerEvent) => {
      lastPos.current = { x: e.clientX, y: e.clientY };
      if (curRef.current) {
        curRef.current.style.transform = `translate(${e.clientX}px,${e.clientY}px)`;
      }
    };
    window.addEventListener("pointermove", onMove);

    // See the resync() note in the file-level comment above: forces the browser to redo
    // cursor hit-testing against whatever's actually under the pointer right now, without
    // waiting for the user to physically move the mouse first.
    function resync() {
      const { x, y } = lastPos.current;
      if (x === 0 && y === 0) return;
      const target = document.elementFromPoint(x, y) ?? window;
      target.dispatchEvent(
        new PointerEvent("pointermove", { clientX: x, clientY: y, bubbles: true, cancelable: true })
      );
    }
    resyncRef.current = resync;

    const onVisibility = () => {
      if (document.visibilityState === "visible") resync();
    };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("focus", resync);

    const onOver = (e: PointerEvent) => {
      const typable = e.target instanceof Element ? e.target.closest(TYPABLE_SELECTOR) : null;
      setMode(typable ? "text" : "default");

      const t = e.target instanceof Element ? (e.target.closest('[data-fx="magnet"]') as HTMLElement | null) : null;
      if (magnetRef.current && magnetRef.current !== t) {
        magnetRef.current.style.transform = "";
        magnetRef.current = null;
      }
      if (!t || typable || reducedMotion) return;
      magnetRef.current = t;
      const r = t.getBoundingClientRect();
      const dx = ((e.clientX - (r.left + r.width / 2)) / r.width) * 3;
      const dy = ((e.clientY - (r.top + r.height / 2)) / r.height) * 3;
      t.style.transform = `translate(${dx.toFixed(2)}px,${dy.toFixed(2)}px)`;
    };
    window.addEventListener("pointermove", onOver, true);

    return () => {
      window.removeEventListener("pointerdown", onDown, true);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointermove", onOver, true);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("focus", resync);
      resyncRef.current = () => {};
      cur.remove();
    };
  }, []);

  return <div ref={hostRef} style={{ position: "fixed", inset: 0, pointerEvents: "none", zIndex: 9999 }} />;
}
