"use client";

import { usePathname } from "next/navigation";

/**
 * No animation on the swap itself — the new route's content is there immediately. The
 * `key={pathname}` is what matters: it forces React to remount this wrapper (and every
 * child under it) on navigation, which restarts the CSS stagger animation in globals.css
 * (.page-enter-stagger) on fresh DOM nodes instead of relying on a re-render of existing
 * ones, which wouldn't replay a CSS animation at all.
 */
export default function PageTransition({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  return (
    <div key={pathname} className="page-enter-stagger">
      {children}
    </div>
  );
}
