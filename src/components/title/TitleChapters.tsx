"use client";

import { useEffect, useMemo, useState } from "react";
import { ChapterList, type DisplayChapter, type ChapterCoverage } from "./ChapterList";
import type { SourceChapter } from "@/sources/types";

interface AggregateChapter {
  number?: string;
  title?: string;
  publishedAt?: string;
  refs: { source: string; sourceName: string; chapterId: string }[];
  primary: { source: string; sourceName: string; chapterId: string };
}

interface AggregateResponse {
  primary: { source: string; id: string; title: string };
  matches: { source: string; sourceName: string; mangaId: string }[];
  chapters: AggregateChapter[];
}

interface TitleChaptersProps {
  source: string;
  mangaId: string;
  /** Primary source's chapters — rendered instantly, before aggregation. */
  chapters: SourceChapter[];
  currentChapterId?: string;
}

/** Map primary SourceChapter → DisplayChapter (pre-aggregation). */
function toDisplay(
  source: string,
  mangaId: string,
  chapters: SourceChapter[],
): DisplayChapter[] {
  return chapters.map((c) => ({
    key: c.id,
    number: c.number,
    title: c.title,
    publishedAt: c.publishedAt,
    readSource: source,
    readMangaId: mangaId,
    readChapterId: c.id,
    altCount: 1,
  }));
}

/**
 * Chapter list that starts from the primary source's chapters (instant)
 * and progressively merges in chapters from every other source that
 * carries this title — filling gaps (e.g. missing middle chapters on
 * MangaDex) with a per-row source badge.
 */
export function TitleChapters({
  source,
  mangaId,
  chapters,
  currentChapterId,
}: TitleChaptersProps) {
  const [agg, setAgg] = useState<AggregateResponse | null>(null);
  const [loading, setLoading] = useState(true);

  // Primary chapters render immediately.
  const primaryDisplay = useMemo(
    () => toDisplay(source, mangaId, chapters),
    [source, mangaId, chapters],
  );

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();

    (async () => {
      try {
        const res = await fetch(
          `/api/aggregate?source=${encodeURIComponent(source)}&id=${encodeURIComponent(mangaId)}`,
          { signal: controller.signal },
        );
        if (!res.ok) return;
        const data = (await res.json()) as AggregateResponse;
        if (!cancelled) setAgg(data);
      } catch {
        /* aborted or failed — primary list already shown */
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [source, mangaId]);

  // Build merged display list once aggregate data arrives.
  const merged = useMemo<DisplayChapter[]>(() => {
    if (!agg) return primaryDisplay;

    const mangaIdBySource: Record<string, string> = {
      [agg.primary.source]: agg.primary.id,
    };
    for (const m of agg.matches) mangaIdBySource[m.source] = m.mangaId;

    return agg.chapters.map((ch) => {
      const p = ch.primary;
      const readMangaId = mangaIdBySource[p.source] ?? agg.primary.id;
      const fromPrimary = p.source === agg.primary.source;
      return {
        key: `${p.source}:${p.chapterId}`,
        number: ch.number,
        title: ch.title,
        publishedAt: ch.publishedAt,
        readSource: p.source,
        readMangaId,
        readChapterId: p.chapterId,
        badge: fromPrimary ? undefined : p.sourceName,
        altCount: ch.refs.length,
      };
    });
  }, [agg, primaryDisplay]);

  const coverage = useMemo<ChapterCoverage>(() => {
    if (!agg) return { sources: 1, filled: 0, loading };
    const filled = agg.chapters.filter(
      (ch) => ch.primary.source !== agg.primary.source,
    ).length;
    return { sources: agg.matches.length + 1, filled, loading: false };
  }, [agg, loading]);

  return (
    <ChapterList
      chapters={merged}
      coverage={coverage}
      currentChapterId={currentChapterId}
    />
  );
}
