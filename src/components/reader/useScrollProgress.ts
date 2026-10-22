"use client";

import { useCallback, useEffect, useRef, useState } from "react";

interface UseScrollProgressOptions {
  /** Resume position (0..1). */
  initialPct?: number;
  /** Called at most ~once per second while scrolling. */
  onProgress?: (pct: number) => void;
  /** Called once when the reader scrolls past ~98%. */
  onReachEnd?: () => void;
}

/**
 * Window-scroll progress tracking with throttled saves, one-shot
 * end detection and position restore support (used by the scroll
 * and novel readers).
 */
export function useScrollProgress({
  initialPct = 0,
  onProgress,
  onReachEnd,
}: UseScrollProgressOptions) {
  const [pct, setPct] = useState(0);
  const lastSaved = useRef(0);
  const endFired = useRef(false);
  const raf = useRef(0);

  const onProgressRef = useRef(onProgress);
  const onReachEndRef = useRef(onReachEnd);
  onProgressRef.current = onProgress;
  onReachEndRef.current = onReachEnd;

  useEffect(() => {
    const onScroll = () => {
      if (raf.current) return;
      raf.current = requestAnimationFrame(() => {
        raf.current = 0;
        const max = document.documentElement.scrollHeight - window.innerHeight;
        const p = max > 0 ? Math.min(window.scrollY / max, 1) : 0;
        setPct(p);

        if (p - lastSaved.current > 0.01 || p === 1) {
          lastSaved.current = p;
          onProgressRef.current?.(p);
        }
        if (p > 0.98 && !endFired.current) {
          endFired.current = true;
          onReachEndRef.current?.();
        }
      });
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (raf.current) cancelAnimationFrame(raf.current);
    };
  }, []);

  const scrollToTop = useCallback(
    () => window.scrollTo({ top: 0, behavior: "smooth" }),
    [],
  );
  const scrollToBottom = useCallback(
    () =>
      window.scrollTo({
        top: document.documentElement.scrollHeight,
        behavior: "smooth",
      }),
    [],
  );
  const scrollByPages = useCallback(
    (dir: 1 | -1) =>
      window.scrollBy({ top: dir * window.innerHeight * 0.85, behavior: "smooth" }),
    [],
  );

  /** Jump instantly to a stored position (before paint). */
  const restoreTo = useCallback((target: number) => {
    const max = document.documentElement.scrollHeight - window.innerHeight;
    if (max > 0) window.scrollTo(0, max * target);
  }, []);

  return { pct, scrollToTop, scrollToBottom, scrollByPages, restoreTo };
}
