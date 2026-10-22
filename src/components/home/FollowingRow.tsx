"use client";

import Link from "next/link";
import { useLibrary } from "@/lib/library";
import { useFollowUpdates } from "@/lib/updates";
import { CoverImage } from "@/components/media/CoverImage";
import { Skeleton } from "@/components/ui/Skeleton";
import { timeAgo, cn } from "@/lib/utils";

/**
 * Following shelf — followed titles with new-chapter badges and the
 * estimated next drop, driven by the follow update checker.
 */
export function FollowingRow() {
  useFollowUpdates();
  const { entries, hydrated, hydrate } = useLibrary();

  if (!hydrated) {
    return (
      <div className="no-scrollbar flex gap-3 overflow-x-auto pb-1">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-44 w-[118px] shrink-0" />
        ))}
      </div>
    );
  }

  const followed = Object.values(entries)
    .filter((e) => e.followed)
    .sort((a, b) => (b.followedAt ?? 0) - (a.followedAt ?? 0));

  if (followed.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-veil/60 bg-palace/40 px-5 py-8 text-center">
        <p className="text-sm text-moon/80">Nothing followed yet</p>
        <p className="mt-1 text-xs text-mist">
          Open any title and tap the bell to follow it — new chapters and
          release estimates show up here.
        </p>
      </div>
    );
  }

  return (
    <div className="no-scrollbar flex gap-3.5 overflow-x-auto pb-1">
      {followed.map((e) => {
        const resumeHref = e.lastChapterId
          ? `/read/${encodeURIComponent(e.source)}/${encodeURIComponent(e.mangaId)}/${encodeURIComponent(e.lastChapterId)}`
          : `/title/${encodeURIComponent(e.source)}/${encodeURIComponent(e.mangaId)}`;
        const unread = e.newChapterCount ?? 0;

        return (
          <Link
            key={e.key}
            href={resumeHref}
            className="group w-[128px] shrink-0"
          >
            <div className="relative aspect-2/3 overflow-hidden rounded-xl ring-1 ring-veil/50 transition-all duration-300 group-hover:ring-flame/50">
              <CoverImage
                src={e.coverImage}
                alt={e.title}
                className="h-full w-full transition-transform duration-500 group-hover:scale-[1.05]"
              />
              {unread > 0 && (
                <span className="absolute top-2 left-2 rounded-md bg-flame px-1.5 py-0.5 text-[10px] font-bold text-white shadow-md shadow-flame/40">
                  +{unread} new
                </span>
              )}
            </div>
            <p className="mt-2 line-clamp-2 text-[12.5px] leading-snug font-medium text-moon/90 group-hover:text-flame">
              {e.title}
            </p>
            <p className="mt-0.5 text-[10.5px] text-mist">
              {unread > 0
                ? `Ch. ${e.latestChapterNumber ?? "?"} out`
                : e.nextEstimateAt
                  ? `next ~ ${timeAgo(e.nextEstimateAt)}`
                  : e.lastChapterNumber
                    ? `at Ch. ${e.lastChapterNumber}`
                    : "following"}
            </p>
          </Link>
        );
      })}
    </div>
  );
}
