"use client";

import { useEffect } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { useReaderPrefs } from "@/lib/prefs";
import { useReaderChrome } from "@/components/reader/ReaderChrome";
import { useScrollProgress } from "@/components/reader/useScrollProgress";
import {
  ChevronDownIcon,
  ChevronUpIcon,
} from "@/components/icons";

export interface NovelReaderProps {
  paragraphs: string[];
  chapterLabel: string;
  initialPct?: number;
  onProgress?: (pct: number) => void;
  onReachEnd?: () => void;
  prevHref?: string | null;
  nextHref?: string | null;
  prevLabel?: string;
  nextLabel?: string;
}

/**
 * Light-novel reader: serif typography with drop cap, native scroll,
 * font controls via the chrome settings, chapter navigation.
 */
export function NovelReader({
  paragraphs,
  chapterLabel,
  initialPct = 0,
  onProgress,
  onReachEnd,
  prevHref,
  nextHref,
  prevLabel,
  nextLabel,
}: NovelReaderProps) {
  const chrome = useReaderChrome();
  const fontSize = useReaderPrefs((s) => s.novelFontSize);
  const lineHeight = useReaderPrefs((s) => s.novelLineHeight);
  const { scrollToTop, scrollToBottom, restoreTo } = useScrollProgress({
    initialPct,
    onProgress,
    onReachEnd,
  });

  // Restore position once mounted.
  useEffect(() => {
    if (initialPct > 0.02) {
      const t = setTimeout(
        () => requestAnimationFrame(() => restoreTo(initialPct)),
        120,
      );
      return () => clearTimeout(t);
    }
  }, [initialPct, restoreTo]);

  const onBodyClick = (e: React.MouseEvent<HTMLElement>) => {
    const t = e.target as HTMLElement;
    if (t.tagName === "P" || t.tagName === "ARTICLE") chrome.toggle();
  };

  return (
    <div className="overscroll-none min-h-dvh" onClick={onBodyClick}>
      <article
        className="font-novel mx-auto max-w-[44rem] px-6 pt-16 pb-40 text-moon/95"
        style={{ fontSize, lineHeight }}
      >
        <header className="mb-10 text-center">
          <p className="font-body text-[11px] font-semibold tracking-[0.3em] text-mist uppercase">
            {chapterLabel}
          </p>
          <div className="mx-auto mt-4 h-px w-24 bg-linear-to-r from-transparent via-flame/60 to-transparent" />
        </header>

        {paragraphs.map((p, i) => (
          <p
            key={i}
            className={
              i === 0
                ? "first-letter:mr-2 first-letter:float-left first-letter:text-[3.2em] first-letter:leading-[0.85] first-letter:font-semibold first-letter:text-flame/85"
                : "mb-5"
            }
          >
            {p}
          </p>
        ))}

        {/* Chapter end marker */}
        <div className="mt-14 text-center">
          <div className="mx-auto h-px w-32 bg-linear-to-r from-transparent via-flame/40 to-transparent" />
          <p className="mt-4 text-sm text-mist">End of {chapterLabel}</p>
          {nextHref && (
            <Link
              href={nextHref}
              className="mt-5 inline-block rounded-xl bg-linear-to-r from-flame-deep to-flame px-6 py-3 font-body text-sm font-semibold text-white transition-all hover:brightness-110 active:scale-[0.98]"
            >
              {nextLabel ?? "Next chapter"} →
            </Link>
          )}
        </div>
      </article>

      {/* Floating nav */}
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
              ↑
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                scrollToBottom();
              }}
              className="flex h-12 w-12 items-center justify-center rounded-full bg-abyss/85 text-moon/85 ring-1 ring-veil/70 backdrop-blur-md transition-colors hover:text-flame"
              aria-label="Jump to bottom"
            >
              ↓
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
