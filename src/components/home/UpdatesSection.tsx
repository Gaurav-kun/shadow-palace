"use client";

import { useEffect, useMemo } from "react";
import Link from "next/link";
import { useLibrary, type LibraryEntry } from "@/lib/library";
import { CoverImage } from "@/components/media/CoverImage";
import { timeAgo } from "@/lib/utils";

function hrefFor(e: LibraryEntry): string {
  const read = (id: string) =>
    `/read/${encodeURIComponent(e.source)}/${encodeURIComponent(e.mangaId)}/${encodeURIComponent(id)}`;
  // Unread updates jump straight to the newest chapter; otherwise resume.
  if ((e.newChapterCount ?? 0) > 0 && e.latestChapterId) return read(e.latestChapterId);
  if (e.lastChapterId) return read(e.lastChapterId);
  return `/title/${encodeURIComponent(e.source)}/${encodeURIComponent(e.mangaId)}`;
}

function RowSkeleton() {
  return (
    <li className="flex items-center gap-3 px-3.5 py-3">
      <div className="h-14 w-10 shrink-0 animate-shimmer rounded-md bg-veil/40" />
      <div className="flex-1 space-y-2">
        <div className="h-3.5 w-2/5 animate-shimmer rounded bg-veil/50" />
        <div className="h-3 w-1/4 animate-shimmer rounded bg-veil/30" />
      </div>
    </li>
  );
}

/**
 * Updates feed — the newest chapter of every followed / reading series,
 * freshest first, driven by the follow update checker. Tap an unread
 * row to open that chapter; tap a caught-up row to resume.
 */
export function UpdatesSection() {
  const { entries, hydrated, hydrate } = useLibrary();

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  const rows = useMemo(() => {
    const active = Object.values(entries).filter(
      (e) => e.followed || e.lastChapterId,
    );
    return active.sort(
      (a, b) => (b.latestChapterAt ?? 0) - (a.latestChapterAt ?? 0),
    );
  }, [entries]);

  if (!hydrated) {
    return (
      <ul className="divide-y divide-veil/30 overflow-hidden rounded-xl border border-veil/40">
        <RowSkeleton />
        <RowSkeleton />
        <RowSkeleton />
      </ul>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-veil/60 bg-palace/40 px-5 py-8 text-center">
        <p className="text-sm text-moon/80">Nothing in flight yet</p>
        <p className="mt-1 text-xs text-mist">
          Follow a title or start reading — new chapters will surface here.
        </p>
      </div>
    );
  }

  return (
    <ul className="divide-y divide-veil/30 overflow-hidden rounded-xl border border-veil/40">
      {rows.map((e) => {
        const unread = e.newChapterCount ?? 0;
        return (
          <li key={e.key}>
            <Link
              href={hrefFor(e)}
              className="flex items-center gap-3 px-3.5 py-3 transition-colors hover:bg-hall/50"
            >
              <div className="h-14 w-10 shrink-0 overflow-hidden rounded-md bg-palace ring-1 ring-veil/50">
                <CoverImage
                  src={e.coverImage}
                  alt={e.title}
                  className="h-full w-full"
                />
              </div>

              <div className="min-w-0 flex-1">
                <p className="truncate text-[13.5px] font-medium text-moon/90">
                  {e.title}
                </p>
                <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-[11.5px] text-mist">
                  {e.latestChapterNumber ? (
                    <>
                      <span className="font-medium text-flame/90">
                        Ch. {e.latestChapterNumber}
                      </span>
                      {e.latestChapterAt ? (
                        <>
                          <span className="text-mist/40">·</span>
                          <span>{timeAgo(e.latestChapterAt)}</span>
                        </>
                      ) : null}
                    </>
                  ) : e.lastCheckedAt ? (
                    <span>up to date</span>
                  ) : (
                    <span className="animate-pulse">checking updates…</span>
                  )}
                </p>
              </div>

              {unread > 0 && (
                <span className="shrink-0 rounded-md bg-flame px-1.5 py-0.5 text-[10px] font-bold text-white shadow-md shadow-flame/40">
                  +{unread} new
                </span>
              )}
              <span
                className="shrink-0 text-mist/50 transition-colors group-hover:text-flame"
                aria-hidden
              >
                ›
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
