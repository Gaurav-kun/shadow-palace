"use client";

import { useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLibrary, type LibraryEntry } from "@/lib/library";
import type { SourceChapter } from "@/sources/types";

/**
 * Follow update checker.
 *
 * For every followed title we (re)fetch its chapter list (server-
 * cached ~6h, client-cached 10 min) and derive:
 *   - the newest chapter number/id
 *   - how many chapters are newer than what the user last read
 *   - an estimated next-drop time from the average interval between
 *     the most recent chapters' publish dates.
 *
 * Results are written back into the library entry so the home /
 * library screens can render badges and estimates without refetching.
 */

function chapterNum(n?: string): number {
  const v = parseFloat(n ?? "");
  return Number.isNaN(v) ? -1 : v;
}

/** Average gap (ms) between the most recent chapter publish dates. */
function estimateCadence(chapters: SourceChapter[]): {
  intervalMs: number | null;
  nextAt: number | null;
} {
  const dated = chapters
    .filter((c) => c.publishedAt && !Number.isNaN(Date.parse(c.publishedAt)))
    .map((c) => Date.parse(c.publishedAt!))
    .sort((a, b) => a - b);

  if (dated.length < 3) return { intervalMs: null, nextAt: null };

  const recent = dated.slice(-6);
  const gaps: number[] = [];
  for (let i = 1; i < recent.length; i++) gaps.push(recent[i] - recent[i - 1]);
  const intervalMs = gaps.reduce((a, b) => a + b, 0) / gaps.length;

  // Sanity: ignore absurd cadences (> 60 days or < 1 hour).
  const day = 86_400_000;
  if (intervalMs > 60 * day || intervalMs < 3_600_000) {
    return { intervalMs: null, nextAt: null };
  }

  const last = recent[recent.length - 1];
  return { intervalMs, nextAt: last + intervalMs };
}

export function useFollowUpdates() {
  const { entries, hydrate, setUpdateInfo } = useLibrary();
  const checked = useRef<Set<string>>(new Set());

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  const followed: LibraryEntry[] = Object.values(entries).filter(
    (e) => e.followed,
  );

  // Subscribe to each followed title's chapter feed (deduped by key).
  const feeds = useQuery({
    queryKey: ["follow-feeds", followed.map((e) => e.key).sort().join(",")],
    enabled: followed.length > 0,
    staleTime: 10 * 60 * 1000,
    queryFn: async () => {
      const results: Record<
        string,
        { chapters: SourceChapter[] } | { error: string }
      > = {};
      await Promise.allSettled(
        followed.map(async (e) => {
          try {
            const res = await fetch(
              `/api/title/${encodeURIComponent(e.source)}/${encodeURIComponent(e.mangaId)}`,
            );
            if (!res.ok) throw new Error("Failed");
            const data = (await res.json()) as { chapters: SourceChapter[] };
            results[e.key] = { chapters: data.chapters };
          } catch {
            results[e.key] = { error: "unreachable" };
          }
        }),
      );
      return results;
    },
  });

  // Derive + persist update info whenever feeds land.
  useEffect(() => {
    const data = feeds.data;
    if (!data) return;

    for (const entry of followed) {
      const feed = data[entry.key];
      if (!feed || "error" in feed) continue;

      const chapters = feed.chapters;
      if (!chapters.length) continue;

      // Newest by chapter number (fallback to list order).
      const sorted = [...chapters].sort(
        (a, b) => chapterNum(a.number) - chapterNum(b.number),
      );
      const latest = sorted[sorted.length - 1];

      const lastRead = chapterNum(entry.lastChapterNumber);
      const newCount =
        lastRead < 0
          ? 0
          : sorted.filter((c) => chapterNum(c.number) > lastRead).length;

      const { intervalMs, nextAt } = estimateCadence(sorted);

      // Only write when something changed (avoids render loops).
      if (
        entry.latestChapterNumber !== latest.number ||
        entry.newChapterCount !== newCount ||
        entry.nextEstimateAt !== nextAt
      ) {
        void setUpdateInfo(entry.key, {
          latestChapterNumber: latest.number,
          latestChapterId: latest.id,
          newChapterCount: newCount,
          nextEstimateAt: nextAt ?? undefined,
          updateIntervalDays: intervalMs ? intervalMs / 86_400_000 : undefined,
        });
      }
      checked.current.add(entry.key);
    }
  }, [feeds.data, followed, setUpdateInfo]);
}
