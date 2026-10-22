"use client";

import Link from "next/link";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowLeftIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  MaximizeIcon,
  MinimizeIcon,
  SettingsIcon,
} from "@/components/icons";
import { useReaderPrefs } from "@/lib/prefs";
import { cn } from "@/lib/utils";

/**
 * Shared reader chrome: auto-hiding top bar, settings sheet, reading
 * dimmer and fullscreen control. Reader bodies tell the chrome to
 * show/hide via the context (e.g. on center-tap).
 */

interface ReaderCtx {
  visible: boolean;
  show: () => void;
  toggle: () => void;
}

const ChromeContext = createContext<ReaderCtx>({
  visible: true,
  show: () => {},
  toggle: () => {},
});

export function useReaderChrome() {
  return useContext(ChromeContext);
}

interface ReaderChromeProps {
  title: string;
  chapterLabel: string;
  /** Back-link target (title page). */
  href: string;
  /** 0..1 chapter progress for the thin top bar. */
  progress?: number;
  /** Adjacent-chapter navigation shown in the top bar. */
  prev?: { href: string; label?: string } | null;
  next?: { href: string; label?: string } | null;
  /** Content of the settings sheet. */
  settings: React.ReactNode;
  children: React.ReactNode;
}

export function ReaderChrome({
  title,
  chapterLabel,
  href,
  progress,
  prev,
  next,
  settings,
  children,
}: ReaderChromeProps) {
  const [visible, setVisible] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dimmer = useReaderPrefs((s) => s.dimmer);

  const show = useCallback(() => {
    setVisible(true);
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => setVisible(false), 3800);
  }, []);

  const toggle = useCallback(() => {
    if (hideTimer.current) clearTimeout(hideTimer.current);
    setVisible((v) => {
      if (!v) {
        hideTimer.current = setTimeout(() => setVisible(false), 3800);
        return true;
      }
      return false;
    });
  }, []);

  // Show on mount, clean up timer.
  useEffect(() => {
    show();
    return () => {
      if (hideTimer.current) clearTimeout(hideTimer.current);
    };
  }, [show]);

  // Fullscreen tracking.
  useEffect(() => {
    const onChange = () => setFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  const toggleFullscreen = () => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void document.documentElement.requestFullscreen().catch(() => {});
    show();
  };

  return (
    <ChromeContext.Provider value={{ visible, show, toggle }}>
      <div className="fixed inset-0 overflow-hidden bg-void">
        {children}

        {/* Reading dimmer */}
        {dimmer > 0 && (
          <div
            className="pointer-events-none fixed inset-0 z-20 bg-black"
            style={{ opacity: dimmer }}
          />
        )}

        {/* Top bar */}
        <AnimatePresence>
          {visible && (
            <motion.header
              initial={{ y: "-100%", opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: "-100%", opacity: 0 }}
              transition={{ type: "spring", stiffness: 380, damping: 34 }}
              className="safe-pt fixed inset-x-0 top-0 z-30 bg-linear-to-b from-void/95 to-void/70 backdrop-blur-md"
            >
              <div className="flex items-center gap-3 px-3 py-2.5">
                <Link
                  href={href}
                  className="rounded-lg p-1.5 text-moon/90 transition-colors hover:text-flame"
                  aria-label="Back to title"
                  onClick={(e) => e.stopPropagation()}
                >
                  <ArrowLeftIcon className="h-5 w-5" width={20} height={20} />
                </Link>

                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] leading-tight font-semibold text-moon">
                    {title}
                  </p>
                  <p className="truncate text-[11px] leading-tight text-mist">
                    {chapterLabel}
                  </p>
                </div>

                {/* Chapter navigation */}
                <div className="flex items-center gap-0.5">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      if (prev) window.location.href = prev.href;
                    }}
                    disabled={!prev}
                    aria-label="Previous chapter"
                    title={prev?.label ?? "Previous chapter"}
                    className="rounded-lg p-1.5 text-moon/80 transition-colors hover:text-flame disabled:opacity-25 disabled:hover:text-moon/80"
                  >
                    <ChevronLeftIcon className="h-5 w-5" width={20} height={20} />
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      if (next) window.location.href = next.href;
                    }}
                    disabled={!next}
                    aria-label="Next chapter"
                    title={next?.label ?? "Next chapter"}
                    className="rounded-lg p-1.5 text-moon/80 transition-colors hover:text-flame disabled:opacity-25 disabled:hover:text-moon/80"
                  >
                    <ChevronRightIcon className="h-5 w-5" width={20} height={20} />
                  </button>
                </div>

                <button
                  onClick={() => {
                    setSettingsOpen(true);
                    show();
                  }}
                  className="rounded-lg p-1.5 text-moon/80 transition-colors hover:text-flame"
                  aria-label="Reader settings"
                >
                  <SettingsIcon className="h-5 w-5" width={20} height={20} />
                </button>
                <button
                  onClick={toggleFullscreen}
                  className="rounded-lg p-1.5 text-moon/80 transition-colors hover:text-flame"
                  aria-label="Toggle fullscreen"
                >
                  {fullscreen ? (
                    <MinimizeIcon className="h-5 w-5" width={20} height={20} />
                  ) : (
                    <MaximizeIcon className="h-5 w-5" width={20} height={20} />
                  )}
                </button>
              </div>

              {/* Progress line */}
              {progress !== undefined && (
                <div className="h-0.5 w-full bg-veil/40">
                  <div
                    className="h-full bg-linear-to-r from-flame to-ember transition-[width] duration-300"
                    style={{ width: `${Math.min(progress, 1) * 100}%` }}
                  />
                </div>
              )}
            </motion.header>
          )}
        </AnimatePresence>

        {/* Settings sheet */}
        <AnimatePresence>
          {settingsOpen && (
            <>
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setSettingsOpen(false)}
                className="fixed inset-0 z-40 bg-void/60 backdrop-blur-sm"
              />
              <motion.div
                initial={{ y: "100%" }}
                animate={{ y: 0 }}
                exit={{ y: "100%" }}
                transition={{ type: "spring", stiffness: 380, damping: 36 }}
                className="safe-pb fixed inset-x-0 bottom-0 z-50 mx-auto w-full max-w-lg rounded-t-2xl border-t border-veil/60 bg-palace p-5"
              >
                <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-veil" />
                {settings}
              </motion.div>
            </>
          )}
        </AnimatePresence>
      </div>
    </ChromeContext.Provider>
  );
}

/* ── Shared small controls used by the settings panel ─────────────── */

export function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="mb-4">
      <p className="mb-1.5 text-[11px] font-semibold tracking-wider text-mist uppercase">
        {label}
      </p>
      <div className="flex rounded-xl border border-veil/60 bg-abyss/60 p-1">
        {options.map((o) => (
          <button
            key={o.value}
            onClick={() => onChange(o.value)}
            className={cn(
              "flex-1 rounded-lg px-3 py-2 text-[13px] font-medium transition-all",
              value === o.value
                ? "bg-flame/15 text-flame shadow-sm ring-1 ring-flame/30"
                : "text-mist hover:text-moon",
            )}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}
