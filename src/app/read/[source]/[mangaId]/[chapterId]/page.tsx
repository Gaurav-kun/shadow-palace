"use client";

import { use, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { useLibrary, entryKey } from "@/lib/library";
import { useReaderPrefs } from "@/lib/prefs";
import { ReaderChrome } from "@/components/reader/ReaderChrome";
import { ReaderSettings, type ReaderMode } from "@/components/reader/ReaderSettings";
import { PageReader } from "@/components/reader/PageReader";
import { ScrollReader } from "@/components/reader/ScrollReader";
import { NovelReader } from "@/components/reader/NovelReader";
import { PalaceMark } from "@/components/icons";
import { decodeParam } from "@/lib/utils";
import type { SourceChapter, SourceManga } from "@/sources/types";

interface TitleData {
  manga: SourceManga;
  chapters: SourceChapter[];
}

/**
 * Reader route — picks the right reader for the content kind, wires
 * progress persistence and chapter navigation.
 */
export default function ReadPage({
  params,
}: {
  params: Promise<{ source: string; mangaId: string; chapterId: string }>;
}) {
  const { source, mangaId: rawMangaId, chapterId: rawChapterId } = use(params);
  // Params arrive with encoded slashes still %2F (next.js#48058) —
  // decode once so ids match the source lists (chapter lookup, keys).
  const mangaId = decodeParam(rawMangaId);
  const chapterId = decodeParam(rawChapterId);

  /* Lite metadata: ONE fast getManga call. Gates the reader so a
     novel chapter opens in seconds instead of waiting out the full
     chapter walk (3,222 chapters ≈ 82s cold), which loads in the
     background via titleQ for prev/next navigation. */
  const liteQ = useQuery({
    queryKey: ["title-lite", source, mangaId],
    queryFn: async (): Promise<{ manga: SourceManga }> => {
      const res = await fetch(
        `/api/title/${encodeURIComponent(source)}/${encodeURIComponent(mangaId)}?lite=1`,
      );
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed to load");
      return res.json();
    },
    staleTime: 30 * 60 * 1000,
  });

  const titleQ = useQuery({
    queryKey: ["title", source, mangaId],
    queryFn: async (): Promise<TitleData> => {
      const res = await fetch(
        `/api/title/${encodeURIComponent(source)}/${encodeURIComponent(mangaId)}`,
      );
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed to load");
      return res.json();
    },
    staleTime: 10 * 60 * 1000,
  });

  const manga = liteQ.data?.manga ?? titleQ.data?.manga;
  const chapters = useMemo(
    () => titleQ.data?.chapters ?? [],
    [titleQ.data],
  );
  const chapter = chapters.find((c) => c.id === chapterId);

  const isNovel = manga?.kind === "novel";

  /* ── Cross-source fallback ────────────────────────────────────
   * Some sources (MangaDex) serve chapters from at-home nodes with
   * PARTIAL caches — some page files 404. The aggregate endpoint knows
   * which OTHER sources carry the same chapter number, so when an image
   * fails we hop to the next source that has this chapter. Paged mode
   * renders ONE <img> at a time, so the hop fires on the FIRST failure
   * (no threshold), and errors that land before the aggregate resolves
   * get re-checked when it arrives. This is what makes "every page
   * shows" true even when the primary source has holes. */
  const [srcIdx, setSrcIdx] = useState(0);
  /** `${source}:${pageIndex}` tags already seen failing — dedupes repeat
   *  error events for the same <img> element. */
  const flagged = useRef(new Set<string>());

  // Candidates: [0] = the source you opened, then every other source the
  // aggregate found for this exact chapter number.
  const candidates = useQuery({
    queryKey: ["chapter-sources", source, mangaId, chapterId],
    enabled: Boolean(chapter) && !isNovel,
    staleTime: 30 * 60 * 1000,
    queryFn: async (): Promise<{ source: string; chapterId: string }[]> => {
      const res = await fetch(
        `/api/aggregate?source=${encodeURIComponent(source)}&id=${encodeURIComponent(mangaId)}`,
      );
      if (!res.ok) return [];
      const data = (await res.json()) as {
        chapters: { number?: string; refs: { source: string; chapterId: string }[] }[];
      };
      const num = chapter?.number;
      const match = data.chapters.find((c) => c.number === num && c.number !== undefined);
      return match?.refs ?? [];
    },
  });

  const activeSource = candidates.data?.[srcIdx]?.source ?? source;
  const activeChapterId = candidates.data?.[srcIdx]?.chapterId ?? chapterId;

  /** Hop to the next alternate source, if the aggregate found one. */
  const hopSource = useCallback(() => {
    const alts = candidates.data;
    if (alts && srcIdx < alts.length - 1) setSrcIdx((i) => i + 1);
  }, [candidates.data, srcIdx]);

  // Image errors can land BEFORE the aggregate resolves — re-check the
  // moment candidates arrive: if the active source already failed a
  // page, hop right then. (After a hop the new source has no failure
  // tags, so this can't loop.)
  useEffect(() => {
    if (!candidates.data) return;
    const failedHere = [...flagged.current].some((t) =>
      t.startsWith(`${activeSource}:`),
    );
    if (failedHere) hopSource();
  }, [candidates.data, activeSource, hopSource]);

  const pagesQ = useQuery({
    queryKey: [
      "pages",
      activeSource,
      activeChapterId,
      isNovel ? "text" : "images",
    ],
    enabled: Boolean(manga),
    staleTime: 30 * 60 * 1000,
    queryFn: async () => {
      const mode = isNovel ? "text" : "images";
      const res = await fetch(
        `/api/pages/${encodeURIComponent(activeSource)}/${encodeURIComponent(activeChapterId)}?mode=${mode}`,
      );
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed to load pages");
      return res.json() as Promise<{ pages?: { url: string }[]; paragraphs?: string[] }>;
    },
  });

  // Reset fallback state when the chapter changes.
  useEffect(() => {
    setSrcIdx(0);
    flagged.current = new Set();
  }, [chapterId]);

  // In paged mode only ONE <img> exists at a time, so a failure-count
  // threshold could never be reached — hop on the FIRST failure instead.
  // Hopping is harmless: every candidate is a valid copy of the same
  // chapter, and srcIdx only moves forward (stops at the last alternate).
  const onImageError = useCallback(
    (index: number) => {
      const tag = `${activeSource}:${index}`;
      if (flagged.current.has(tag)) return; // one hop per failed page
      flagged.current.add(tag);
      hopSource();
    },
    [activeSource, hopSource],
  );

  /* ── Library wiring ─────────────────────────────────────────── */

  const { entries, hydrate, ensure, setProgress, markChapterDone } = useLibrary();
  const key = entryKey(source, mangaId);
  const entry = entries[key];
  const ensureRef = useRef(false);

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  useEffect(() => {
    if (!manga || ensureRef.current) return;
    ensureRef.current = true;
    void ensure({
      source,
      mangaId,
      title: manga.title,
      coverImage: manga.coverImage,
      kind: manga.kind,
    });
  }, [manga, ensure, source, mangaId]);

  const saved = entry?.chapters[chapterId];

  /* ── Mode selection (session override > persisted pref) ─────── */

  const useScrollForManhwa = useReaderPrefs((s) => s.useScrollForManhwa);
  const [override, setOverride] = useState<ReaderMode | null>(null);

  const mode: ReaderMode = useMemo(() => {
    if (override) return override;
    if (isNovel) return "novel";
    if (manga?.kind === "manhwa" && useScrollForManhwa) return "scroll";
    return "pages";
  }, [override, isNovel, manga?.kind, useScrollForManhwa]);

  /* ── Navigation ─────────────────────────────────────────────── */

  const idx = chapters.findIndex((c) => c.id === chapterId);
  const prev = idx > 0 ? chapters[idx - 1] : null;
  const next = idx >= 0 && idx < chapters.length - 1 ? chapters[idx + 1] : null;

  const hrefFor = (c: SourceChapter) =>
    `/read/${encodeURIComponent(source)}/${encodeURIComponent(mangaId)}/${encodeURIComponent(c.id)}`;
  const titleHref = `/title/${encodeURIComponent(source)}/${encodeURIComponent(mangaId)}`;
  const chLabel = (c?: SourceChapter | null) =>
    c ? `Ch. ${c.number ?? "?"}${c.title?.trim() ? ` — ${c.title.trim()}` : ""}` : "";

  /* ── Progress persistence (throttled) ───────────────────────── */

  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveProgress = useCallback(
    (update: { page?: number; pagesCount?: number; pct?: number }) => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => {
        void setProgress(key, chapterId, { ...update, chapterNumber: chapter?.number });
      }, 600);
    },
    [setProgress, key, chapterId, chapter?.number],
  );

  const onPageProgress = useCallback(
    (page: number, total: number) => {
      saveProgress({ page, pagesCount: total, pct: (page + 1) / Math.max(total, 1) });
      if (total > 0 && page === total - 1) void markChapterDone(key, chapterId);
    },
    [saveProgress, markChapterDone, key, chapterId],
  );

  const onPctProgress = useCallback(
    (pct: number) => saveProgress({ pct }),
    [saveProgress],
  );

  const onReachEnd = useCallback(() => {
    void markChapterDone(key, chapterId);
  }, [markChapterDone, key, chapterId]);

  /* ── Render ─────────────────────────────────────────────────── */

  const pages = pagesQ.data?.pages?.map((p) => p.url) ?? [];
  const paragraphs = pagesQ.data?.paragraphs ?? [];

  // Stable identity for PageReader: an inline arrow here would be a new
  // function on every render, re-firing its progress effect each time —
  // progress write → store update → re-render → new arrow → progress
  // write… an endless background cycle that pegs the tab. With a stable
  // callback the effect only runs when the page actually changes.
  const onPageReaderProgress = useCallback(
    (page: number) => onPageProgress(page, pages.length),
    [onPageProgress, pages.length],
  );

  // Overall chapter progress for the chrome's top bar.
  const chromeProgress = saved
    ? mode === "pages" && saved.page !== undefined
      ? (saved.page + 1) / Math.max(pages.length, 1)
      : (saved.pct ?? 0)
    : undefined;

  const body = (() => {
    // Gated on the LITE metadata + pages only — the full chapter list
    // (titleQ) streams in behind the reader for prev/next nav.
    if (liteQ.isPending || pagesQ.isPending) {
      return (
        <div className="grid h-dvh place-items-center">
          <div className="flex flex-col items-center gap-4">
            <PalaceMark size={44} className="animate-glow-pulse" />
            <p className="text-sm text-mist">Summoning pages…</p>
          </div>
        </div>
      );
    }

    if (liteQ.isError || pagesQ.isError) {
      const message =
        (pagesQ.error as Error)?.message ??
        (liteQ.error as Error)?.message ??
        "Something went wrong";
      return (
        <div className="grid h-dvh place-items-center px-6">
          <div className="max-w-sm text-center">
            <h2 className="font-display text-xl font-semibold">
              Couldn’t load this chapter
            </h2>
            <p className="mt-2 text-sm break-words text-mist">{message}</p>
            <div className="mt-5 flex flex-wrap justify-center gap-3">
              <button
                onClick={() => {
                  void pagesQ.refetch();
                  void liteQ.refetch();
                  void titleQ.refetch();
                }}
                className="rounded-xl bg-flame/15 px-5 py-2.5 text-sm font-medium text-flame ring-1 ring-flame/40 hover:bg-flame/25"
              >
                Retry
              </button>
              <Link
                href={titleHref}
                className="rounded-xl border border-veil/70 px-5 py-2.5 text-sm text-moon/90 hover:border-flame/50 hover:text-flame"
              >
                Back to title
              </Link>
            </div>
          </div>
        </div>
      );
    }

    if (mode === "novel") {
      return (
        <NovelReader
          paragraphs={paragraphs}
          chapterLabel={chLabel(chapter)}
          initialPct={saved?.pct ?? 0}
          onProgress={onPctProgress}
          onReachEnd={onReachEnd}
          prevHref={prev ? hrefFor(prev) : null}
          nextHref={next ? hrefFor(next) : null}
          prevLabel={chLabel(prev)}
          nextLabel={chLabel(next)}
        />
      );
    }

    if (mode === "scroll") {
      return (
        <ScrollReader
          pages={pages}
          initialPct={saved?.pct ?? 0}
          onProgress={onPctProgress}
          onReachEnd={onReachEnd}
          onImageError={onImageError}
          prevHref={prev ? hrefFor(prev) : null}
          nextHref={next ? hrefFor(next) : null}
          prevLabel={chLabel(prev)}
          nextLabel={chLabel(next)}
        />
      );
    }

    return (
      <PageReader
        pages={pages}
        initialPage={saved?.page ?? 0}
        onProgress={onPageReaderProgress}
        onReachEnd={onReachEnd}
        onImageError={onImageError}
        nextHref={next ? hrefFor(next) : null}
        nextLabel={chLabel(next)}
        titleHref={titleHref}
      />
    );
  })();

  return (
    <ReaderChrome
      title={manga?.title ?? "…"}
      chapterLabel={chLabel(chapter) || "Loading…"}
      href={titleHref}
      progress={chromeProgress}
      prev={prev ? { href: hrefFor(prev), label: chLabel(prev) } : null}
      next={next ? { href: hrefFor(next), label: chLabel(next) } : null}
      settings={<ReaderSettings mode={mode} onModeChange={setOverride} />}
    >
      {body}
    </ReaderChrome>
  );
}
