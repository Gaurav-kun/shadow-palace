"use client";

import { useEffect } from "react";
import { useLibrary } from "@/lib/library";
import { CoverImage } from "@/components/media/CoverImage";
import { Skeleton } from "@/components/ui/Skeleton";
import Link from "next/link";

/**
 * "Continue reading" shelf — driven purely by local library state.
 * Hidden until the library hydrates; hidden when empty.
 */
export function ContinueReading() {
  const { entries, hydrated, hydrate } = useLibrary();

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  if (!hydrated) {
    return (
      <div className="no-scrollbar flex gap-3 overflow-x-auto pb-1">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-44 w-[118px] shrink-0" />
        ))}
      </div>
    );
  }

  const recent = Object.values(entries)
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, 12);

  if (recent.length === 0) return null;

  return (
    <div className="no-scrollbar flex gap-3 overflow-x-auto pb-1">
      {recent.map((e) => {
        const pct = Math.round((e.progressPct ?? 0) * 100);
        return (
          <Link
            key={e.key}
            href={
              e.lastChapterId
                ? `/read/${encodeURIComponent(e.source)}/${encodeURIComponent(e.mangaId)}/${encodeURIComponent(e.lastChapterId)}`
                : `/title/${encodeURIComponent(e.source)}/${encodeURIComponent(e.mangaId)}`
            }
            className="group w-[118px] shrink-0"
          >
            <div className="relative aspect-2/3 overflow-hidden rounded-lg ring-1 ring-veil/50 transition-all duration-300 group-hover:ring-flame/50">
              <CoverImage
                src={e.coverImage}
                alt={e.title}
                className="h-full w-full transition-transform duration-500 group-hover:scale-[1.06]"
              />
              {e.lastChapterNumber && (
                <span className="absolute top-1.5 left-1.5 rounded bg-void/80 px-1 py-px text-[9.5px] font-semibold text-flame backdrop-blur-sm">
                  Ch. {e.lastChapterNumber}
                </span>
              )}
            </div>
            <p className="mt-1.5 line-clamp-1 text-[12px] font-medium text-moon/90 group-hover:text-flame">
              {e.title}
            </p>
            <div className="mt-1 h-1 overflow-hidden rounded-full bg-veil/60">
              <div
                className="h-full rounded-full bg-linear-to-r from-flame to-ember"
                style={{ width: `${Math.max(pct, 4)}%` }}
              />
            </div>
          </Link>
        );
      })}
    </div>
  );
}
