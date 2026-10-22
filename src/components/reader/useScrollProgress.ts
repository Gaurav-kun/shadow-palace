"use client";

import { useCallback, useEffect, useRef, useState } from "react";

interface UseScrollProgressOptions {
  /** Resume position (0..1). */
  initialPct?: number;
  /** Called at most ~once per second while scrolling. */
  onProgress?: (pct: number) => void;
  /** Called once when the reader scrolls past ~98%. */
  onReachEnd?: () => void;
  /**
   * Scrollable container. When provided, progress + scrolling target
   * this element (required because the reader chrome clips the window
   * with `overflow-hidden`, so the window itself never scrolls). When
   * omitted, falls back to window/document scrolling (novel reader on
   * tall pages, etc.).
   */
  containerRef?: React.RefObject<HTMLElement | null>;
}

/**
 * Scroll progress tracking with throttled saves, one-shot end detection
 * and position restore support (used by the scroll and novel readers).
 *
 * Works against either a scrollable container element or the window —
 * the reader chrome renders content inside a `fixed inset-0
 * overflow-hidden` box, so window-based scrolling silently does nothing
 * there. Passing a containerRef fixes that.
 */
export function useScrollProgress({
  initialPct = 0,
  onProgress,
  onReachEnd,
  containerRef,
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
    const el = containerRef?.current ?? null;

    const metrics = () => {
      if (el) {
        const max = el.scrollHeight - el.clientHeight;
        return { max, cur: el.scrollTop };
      }
      const max = document.documentElement.scrollHeight - window.innerHeight;
      return { max, cur: window.scrollY };
    };

    const onScroll = () => {
      if (raf.current) return;
      raf.current = requestAnimationFrame(() => {
        raf.current = 0;
        const { max, cur } = metrics();
        const p = max > 0 ? Math.min(cur / max, 1) : 0;
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

    // Listen on the element when we have one, else the window.
    const target: HTMLElement | Window = el ?? window;
    target.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      target.removeEventListener("scroll", onScroll);
      if (raf.current) cancelAnimationFrame(raf.current);
    };
  }, [containerRef]);

  const scrollToTop = useCallback(() => {
    const el = containerRef?.current;
    if (el) el.scrollTo({ top: 0, behavior: "smooth" });
    else window.scrollTo({ top: 0, behavior: "smooth" });
  }, [containerRef]);

  const scrollToBottom = useCallback(() => {
    const el = containerRef?.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
    else window.scrollTo({ top: document.documentElement.scrollHeight, behavior: "smooth" });
  }, [containerRef]);

  const scrollByPages = useCallback(
    (dir: 1 | -1) => {
      const el = containerRef?.current;
      const step = (el?.clientHeight ?? window.innerHeight) * 0.85 * dir;
      if (el) el.scrollBy({ top: step, behavior: "smooth" });
      else window.scrollBy({ top: step, behavior: "smooth" });
    },
    [containerRef],
  );

  /** Jump instantly to a stored position (before paint). */
  const restoreTo = useCallback(
    (target: number) => {
      const el = containerRef?.current;
      if (el) {
        const max = el.scrollHeight - el.clientHeight;
        if (max > 0) el.scrollTo(0, max * target);
      } else {
        const max = document.documentElement.scrollHeight - window.innerHeight;
        if (max > 0) window.scrollTo(0, max * target);
      }
    },
    [containerRef],
  );

  return { pct, scrollToTop, scrollToBottom, scrollByPages, restoreTo };
}
