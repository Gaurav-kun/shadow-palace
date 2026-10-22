"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { useReaderChrome } from "@/components/reader/ReaderChrome";
import { useScrollProgress } from "@/components/reader/useScrollProgress";
import {
  ArrowDownIcon,
  ArrowUpIcon,
  ChevronDownIcon,
  ChevronUpIcon,
} from "@/components/icons";

export interface ScrollReaderProps {
  /** Ordered image URLs (webtoon-style, stacked vertically). */
  pages: string[];
  /** Resume position (0..1). */
  initialPct?: number;
  onProgress?: (pct: number) => void;
  onReachEnd?: () => void;
  /** Fires when a page image fails to load (for source fallback). */
  onImageError?: (index: number) => void;
  prevHref?: string | null;
  nextHref?: string | null;
  prevLabel?: string;
  nextLabel?: string;
}

/**
 * Webtoon-style vertical reader: native touch scrolling, throttled
 * progress saves, position restore, and floating navigation buttons
 * (prev/next chapter, jump top/bottom).
 */
export function ScrollReader({
  pages,
  initialPct = 0,
  onProgress,
  onReachEnd,
  onImageError,
  prevHref,
  nextHref,
  prevLabel,
  nextLabel,
}: ScrollReaderProps) {
  const chrome = useReaderChrome();
  const scrollRef = useRef<HTMLDivElement>(null);
  const { scrollToTop, scrollToBottom, restoreTo, scrollByPages } = useScrollProgress({
    initialPct,
    onProgress,
    onReachEnd,
    containerRef: scrollRef,
  });

  const [loaded, setLoaded] = useState(0);
  const restored = useRef(false);
  const userMoved = useRef(false);

  // Restore scroll position once images have laid out (until the
  // user takes over).
  useEffect(() => {
    const cancel = () => (userMoved.current = true);
    window.addEventListener("wheel", cancel, { passive: true });
    window.addEventListener("touchmove", cancel, { passive: true });
    window.addEventListener("keydown", cancel);
    return () => {
      window.removeEventListener("wheel", cancel);
      window.removeEventListener("touchmove", cancel);
      window.removeEventListener("keydown", cancel);
    };
  }, []);

  useEffect(() => {
    if (restored.current || userMoved.current || initialPct < 0.02) return;
    if (loaded >= Math.min(pages.length, 3)) {
      restored.current = true;
      // Double rAF so layout has settled.
      requestAnimationFrame(() => requestAnimationFrame(() => restoreTo(initialPct)));
    }
  }, [loaded, initialPct, restoreTo, pages.length]);

  // Keyboard scrolling for desktop.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowDown" || e.key === "PageDown" || e.key === " ") {
        e.preventDefault();
        scrollByPages(1);
      } else if (e.key === "ArrowUp" || e.key === "PageUp") {
        e.preventDefault();
        scrollByPages(-1);
      } else if (e.key === "Home") scrollToTop();
      else if (e.key === "End") scrollToBottom();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [scrollByPages, scrollToTop, scrollToBottom]);

  // Tap image/background area toggles chrome; taps on buttons pass through.
  const onBodyClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const t = e.target as HTMLElement;
    if (t.tagName === "IMG" || t === e.currentTarget) chrome.toggle();
  };

  return (
    <div
      ref={scrollRef}
      className="h-full overflow-y-auto overscroll-contain"
      onClick={onBodyClick}
    >
      {pages.map((url, i) => (
        // eslint-disable-next-line @next/next/no-img-element -- reader pages from arbitrary CDNs
        <img
          key={i}
          src={url}
          alt={`Page ${i + 1}`}
          loading={i < 2 ? "eager" : "lazy"}
          decoding="async"
          draggable={false}
          onLoad={() => setLoaded((n) => n + 1)}
          onError={() => onImageError?.(i)}
          className="block w-full select-none"
          style={{ contentVisibility: i > 2 ? "auto" : "visible" }}
        />
      ))}

      {/* Floating nav — large touch targets */}
      <AnimatePresence>
        {chrome.visible && (
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 20 }}
            transition={{ duration: 0.18 }}
            className="fixed right-4 bottom-24 z-30 flex flex-col items-center gap-2.5 lg:bottom-8"
          >
            {prevHref && (
              <Link
                href={prevHref}
                onClick={(e) => e.stopPropagation()}
                className="flex h-12 w-12 items-center justify-center rounded-full bg-abyss/85 text-moon/85 ring-1 ring-veil/70 backdrop-blur-md transition-colors hover:text-flame"
                aria-label={prevLabel ?? "Previous chapter"}
              >
                <ChevronUpIcon className="h-5 w-5" width={20} height={20} />
              </Link>
            )}
            <button
              onClick={(e) => {
                e.stopPropagation();
                scrollToTop();
              }}
              className="flex h-12 w-12 items-center justify-center rounded-full bg-abyss/85 text-moon/85 ring-1 ring-veil/70 backdrop-blur-md transition-colors hover:text-flame"
              aria-label="Jump to top"
            >
              <ArrowUpIcon className="h-5 w-5" width={20} height={20} />
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                scrollToBottom();
              }}
              className="flex h-12 w-12 items-center justify-center rounded-full bg-abyss/85 text-moon/85 ring-1 ring-veil/70 backdrop-blur-md transition-colors hover:text-flame"
              aria-label="Jump to bottom"
            >
              <ArrowDownIcon className="h-5 w-5" width={20} height={20} />
            </button>
            {nextHref && (
              <Link
                href={nextHref}
                onClick={(e) => e.stopPropagation()}
                className="flex h-12 w-12 items-center justify-center rounded-full bg-linear-to-b from-flame-deep to-flame text-white shadow-lg shadow-flame-deep/30 transition-all hover:brightness-110"
                aria-label={nextLabel ?? "Next chapter"}
              >
                <ChevronDownIcon className="h-5 w-5" width={20} height={20} />
              </Link>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
