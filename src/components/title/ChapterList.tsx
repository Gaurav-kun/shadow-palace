"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useLibrary, type LibraryEntry } from "@/lib/library";
import { cn, timeAgo } from "@/lib/utils";
import { ChevronDownIcon, ChevronUpIcon } from "@/components/icons";

/** A single row after cross-source merging — knows where to read from. */
export interface DisplayChapter {
  /** Unique React/read key. */
  key: string;
  number?: string;
  title?: string;
  publishedAt?: string;
  /** Source to open when tapped. */
  readSource: string;
  readMangaId: string;
  readChapterId: string;
  /** Human source name when this chapter comes from a fallback source. */
  badge?: string;
  /** How many distinct sources serve this chapter. */
  altCount: number;
}

export interface ChapterCoverage {
  /** Distinct sources carrying this title. */
  sources: number;
  /** Chapters present only on a fallback source (not the primary). */
  filled: number;
  loading: boolean;
}

interface ChapterListProps {
  chapters: DisplayChapter[];
  coverage?: ChapterCoverage;
  currentChapterId?: string;
}

/**
 * Chapter list with live search filter, sort toggle, read markers,
 * incremental rendering, and per-row source badges for chapters that
 * were filled in from a fallback source (cross-source aggregation).
 */
export function ChapterList({
  chapters,
  coverage,
  currentChapterId,
}: ChapterListProps) {
  const [filter, setFilter] = useState("");
  const [asc, setAsc] = useState(false);
  const [visible, setVisible] = useState(80);

  // Track read state across every source this title spans.
  const readSets = useReadStates(chapters);

  const filtered = useMemo(() => {
    const f = filter.trim().toLowerCase();
    let list = chapters;
    if (f) {
      list = list.filter(
        (c) =>
          c.number?.toLowerCase().includes(f) ||
          c.title?.toLowerCase().includes(f),
      );
    }
    const sorted = [...list].sort((a, b) => {
      const na = parseFloat(a.number ?? "");
      const nb = parseFloat(b.number ?? "");
      if (!Number.isNaN(na) && !Number.isNaN(nb) && na !== nb) return na - nb;
      return (a.title ?? "").localeCompare(b.title ?? "");
    });
    return asc ? sorted : sorted.reverse();
  }, [chapters, filter, asc]);

  if (chapters.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-mist">
        No chapters found for this title.
      </p>
    );
  }

  return (
    <div>
      {/* Cross-source coverage banner */}
      {coverage && (coverage.loading || coverage.sources > 1) && (
        <div className="mb-3 flex items-center gap-2 rounded-lg border border-veil/40 bg-palace/50 px-3 py-2 text-[11.5px] text-mist">
          {coverage.loading ? (
            <>
              <span className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-flame" />
              Checking other sources for missing chapters…
            </>
          ) : (
            <>
              <span className="h-2 w-2 shrink-0 rounded-full bg-emerald-400" />
              <span>
                {coverage.sources} sources
                {coverage.filled > 0 &&
                  ` · ${coverage.filled} chapter${coverage.filled === 1 ? "" : "s"} filled from elsewhere`}
              </span>
            </>
          )}
        </div>
      )}

      {/* Toolbar */}
      <div className="mb-3 flex items-center gap-2">
        <div className="relative flex-1">
          <input
            value={filter}
            onChange={(e) => {
              setFilter(e.target.value);
              setVisible(80);
            }}
            placeholder="Filter chapters…"
            className="w-full rounded-lg border border-veil/60 bg-palace/60 px-3 py-2 text-sm text-moon placeholder:text-mist/60 outline-none focus:border-flame/50"
          />
        </div>
        <button
          onClick={() => setAsc(!asc)}
          className="flex items-center gap-1 rounded-lg border border-veil/60 bg-palace/60 px-3 py-2 text-xs font-medium text-mist transition-colors hover:text-moon"
          aria-label="Toggle sort order"
        >
          {asc ? (
            <>
              <ChevronUpIcon className="h-3.5 w-3.5" width={14} height={14} />
              Oldest
            </>
          ) : (
            <>
              <ChevronDownIcon className="h-3.5 w-3.5" width={14} height={14} />
              Newest
            </>
          )}
        </button>
      </div>

      {/* Rows */}
      <ul className="divide-y divide-veil/30 overflow-hidden rounded-xl border border-veil/40">
        {filtered.slice(0, visible).map((c) => {
          const read = readSets.has(c.readChapterId);
          const current = c.readChapterId === currentChapterId;
          return (
            <li key={c.key}>
              <Link
                href={`/read/${encodeURIComponent(c.readSource)}/${encodeURIComponent(c.readMangaId)}/${encodeURIComponent(c.readChapterId)}`}
                className={cn(
                  "flex items-center gap-3 px-4 py-3 transition-colors",
                  current ? "bg-flame/10" : "hover:bg-hall/50",
                )}
              >
                <span
                  className={cn(
                    "w-16 shrink-0 text-xs font-semibold tabular-nums",
                    read ? "text-mist/60" : "text-flame",
                  )}
                >
                  {c.number ? `Ch. ${c.number}` : "Ch. ?"}
                </span>
                <span
                  className={cn(
                    "line-clamp-1 flex-1 text-[13.5px]",
                    read ? "text-mist/60" : "text-moon/90",
                  )}
                >
                  {c.title?.trim() || "—"}
                </span>
                {c.badge && (
                  <span className="shrink-0 rounded-full border border-ember/40 bg-ember/10 px-2 py-0.5 text-[10px] font-medium text-ember">
                    {c.badge}
                  </span>
                )}
                {c.publishedAt && (
                  <span className="hidden shrink-0 text-[11px] text-mist/60 sm:block">
                    {timeAgo(c.publishedAt)}
                  </span>
                )}
                {read && (
                  <span
                    className="shrink-0 text-[10px] font-semibold text-mist/50 tracking-wide"
                    aria-label="Read"
                  >
                    ✓
                  </span>
                )}
              </Link>
            </li>
          );
        })}
      </ul>

      {filtered.length > visible && (
        <button
          onClick={() => setVisible((v) => v + 120)}
          className="mt-3 w-full rounded-xl border border-veil/50 py-2.5 text-sm text-mist transition-colors hover:border-flame/40 hover:text-flame"
        >
          Show more ({filtered.length - visible} remaining)
        </button>
      )}
    </div>
  );
}

/**
 * Union of read chapter ids across every source this title spans, so a
 * chapter marked done via a fallback source still shows as read.
 */
function useReadStates(chapters: DisplayChapter[]): Set<string> {
  const sources = useMemo(() => {
    const set = new Set<string>();
    for (const c of chapters) set.add(`${c.readSource}:${c.readMangaId}`);
    return [...set];
  }, [chapters]);

  const entries = useLibrary((s) => s.entries);
  const hydrate = useLibrary((s) => s.hydrate);

  // Hydrate from IndexedDB on the client only (never during SSR).
  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  return useMemo(() => {
    const done = new Set<string>();
    for (const s of sources) {
      const entry: LibraryEntry | undefined = entries[s];
      if (!entry) continue;
      for (const [id, p] of Object.entries(entry.chapters)) {
        if (p.done) done.add(id);
      }
    }
    return done;
  }, [sources, entries]);
}
