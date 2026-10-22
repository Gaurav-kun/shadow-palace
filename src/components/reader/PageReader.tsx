"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { useReaderPrefs } from "@/lib/prefs";
import { useReaderChrome } from "@/components/reader/ReaderChrome";
import { ChevronLeftIcon, ChevronRightIcon } from "@/components/icons";
import { cn } from "@/lib/utils";

export interface PageReaderProps {
  /** Ordered image URLs. */
  pages: string[];
  /** Resume position (0-based). */
  initialPage?: number;
  /** Fires on every page change. */
  onProgress?: (page: number) => void;
  /** Fires when the reader tries to advance past the last page. */
  onReachEnd?: () => void;
  /** Next chapter route, if any — shown on the end card. */
  nextHref?: string | null;
  nextLabel?: string;
  titleHref: string;
}

/**
 * Paged reader — animated slide transitions, edge tap zones, swipe
 * (drag) gestures, keyboard navigation, neighbor preloading and an
 * end-of-chapter card.
 */
export function PageReader({
  pages,
  initialPage = 0,
  onProgress,
  onReachEnd,
  nextHref,
  nextLabel,
  titleHref,
}: PageReaderProps) {
  const direction = useReaderPrefs((s) => s.direction);
  const fitMode = useReaderPrefs((s) => s.fitMode);
  const chrome = useReaderChrome();

  const rtl = direction === "rtl";
  const lastIndex = Math.max(pages.length - 1, 0);
  const [index, setIndex] = useState(() =>
    Math.min(Math.max(initialPage, 0), Math.max(pages.length - 1, 0)),
  );
  const [dir, setDir] = useState(1);
  const [endCard, setEndCard] = useState(false);
  const draggedRef = useRef(false);

  const go = useCallback(
    (delta: number) => {
      setEndCard(false);
      setIndex((i) => {
        const next = i + delta;
        if (next < 0) return 0;
        if (next > lastIndex) {
          if (delta > 0) setEndCard(true);
          return lastIndex;
        }
        setDir(rtl ? -delta : delta);
        return next;
      });
    },
    [lastIndex, rtl],
  );

  // Report progress upward (library save).
  useEffect(() => {
    onProgress?.(index);
  }, [index, onProgress]);

  // Preload neighbors for snappy turns.
  useEffect(() => {
    for (const i of [index - 1, index + 1, index + 2]) {
      const url = pages[i];
      if (url) {
        const img = new Image();
        img.src = url;
      }
    }
  }, [index, pages]);

  // Keyboard: arrows / space navigate, respecting direction.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") go(rtl ? 1 : -1);
      else if (e.key === "ArrowRight") go(rtl ? -1 : 1);
      else if (e.key === " " || e.key === "PageDown") {
        e.preventDefault();
        go(1);
      } else if (e.key === "PageUp") go(-1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go, rtl]);

  // Tap zones (left/center/right thirds), ignoring taps after a drag.
  const onContainerClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (draggedRef.current) {
      draggedRef.current = false;
      return;
    }
    const rect = e.currentTarget.getBoundingClientRect();
    const rel = (e.clientX - rect.left) / rect.width;
    if (rel < 0.3) go(rtl ? 1 : -1);
    else if (rel > 0.7) go(rtl ? -1 : 1);
    else chrome.toggle();
  };

  const onDragEnd = (
    _e: unknown,
    info: { offset: { x: number }; velocity: { x: number } },
  ) => {
    const advanceScore = rtl ? info.offset.x : -info.offset.x;
    if (advanceScore > 70 || info.velocity.x * (rtl ? 1 : -1) > 500) go(1);
    else if (advanceScore < -70) go(-1);
  };

  return (
    <div
      className={cn(
        "relative h-dvh select-none",
        fitMode === "width" ? "overflow-y-auto" : "overflow-hidden",
      )}
      onClick={onContainerClick}
    >
      <AnimatePresence initial={false} custom={dir}>
        <motion.div
          key={index}
          custom={dir}
          initial={{ x: dir > 0 ? "100%" : "-100%" }}
          animate={{ x: 0 }}
          exit={{ x: dir > 0 ? "-35%" : "35%", opacity: 0.3 }}
          transition={{ type: "spring", stiffness: 300, damping: 34, mass: 0.8 }}
          drag="x"
          dragConstraints={{ left: 0, right: 0 }}
          dragElastic={0.12}
          onDragStart={() => (draggedRef.current = true)}
          onDragEnd={onDragEnd}
          className="absolute inset-0 flex items-center justify-center"
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- reader pages from arbitrary CDNs */}
          <img
            src={pages[index]}
            alt={`Page ${index + 1}`}
            draggable={false}
            className={cn(
              "no-cursor-drag",
              fitMode === "width"
                ? "h-auto w-full"
                : "mx-auto max-h-dvh w-auto max-w-full object-contain",
            )}
          />
        </motion.div>
      </AnimatePresence>

      {/* Page indicator */}
      {chrome.visible && (
        <div className="pointer-events-none fixed bottom-6 left-1/2 z-30 -translate-x-1/2">
          <div className="rounded-full bg-void/80 px-3.5 py-1.5 text-xs font-medium tabular-nums text-moon/90 backdrop-blur-md">
            {index + 1} / {pages.length}
          </div>
        </div>
      )}

      {/* Edge arrows (desktop affordance) */}
      {chrome.visible && (
        <>
          <button
            onClick={(e) => {
              e.stopPropagation();
              go(rtl ? 1 : -1);
            }}
            className="fixed top-1/2 left-3 z-30 hidden -translate-y-1/2 rounded-full bg-void/60 p-2.5 text-moon/70 backdrop-blur-md transition-colors hover:text-flame lg:block"
            aria-label="Previous page"
          >
            <ChevronLeftIcon className="h-5 w-5" width={20} height={20} />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              go(rtl ? -1 : 1);
            }}
            className="fixed top-1/2 right-3 z-30 hidden -translate-y-1/2 rounded-full bg-void/60 p-2.5 text-moon/70 backdrop-blur-md transition-colors hover:text-flame lg:block"
            aria-label="Next page"
          >
            <ChevronRightIcon className="h-5 w-5" width={20} height={20} />
          </button>
        </>
      )}

      {/* End-of-chapter card */}
      <AnimatePresence>
        {endCard && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-40 grid place-items-center bg-void/85 backdrop-blur-sm"
          >
            <motion.div
              initial={{ scale: 0.92, y: 12 }}
              animate={{ scale: 1, y: 0 }}
              transition={{ type: "spring", stiffness: 320, damping: 26 }}
              className="mx-6 w-full max-w-sm rounded-2xl border border-veil/60 bg-palace p-6 text-center"
            >
              <p className="text-[11px] font-semibold tracking-[0.25em] text-mist uppercase">
                Chapter complete
              </p>
              <div className="my-4 h-px bg-linear-to-r from-transparent via-flame/50 to-transparent" />
              {nextHref ? (
                <>
                  <Link
                    href={nextHref}
                    className="block w-full rounded-xl bg-linear-to-r from-flame-deep to-flame px-5 py-3 font-semibold text-white transition-all hover:brightness-110 active:scale-[0.98]"
                  >
                    {nextLabel ?? "Next chapter"} →
                  </Link>
                  <Link
                    href={titleHref}
                    className="mt-3 block text-sm text-mist transition-colors hover:text-moon"
                  >
                    Back to title
                  </Link>
                </>
              ) : (
                <>
                  <p className="text-sm text-moon/90">
                    You’re all caught up. ✨
                  </p>
                  <Link
                    href={titleHref}
                    className="mt-4 block rounded-xl border border-veil/70 px-5 py-2.5 text-sm text-moon/90 transition-colors hover:border-flame/50 hover:text-flame"
                  >
                    Back to title
                  </Link>
                </>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
