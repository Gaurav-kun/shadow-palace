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
  const { source, mangaId, chapterId } = use(params);

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

  const manga = titleQ.data?.manga;
  const chapters = useMemo(
    () => titleQ.data?.chapters ?? [],
    [titleQ.data],
  );
  const chapter = chapters.find((c) => c.id === chapterId);

  const isNovel = manga?.kind === "novel";

  const pagesQ = useQuery({
    queryKey: ["pages", source, chapterId, isNovel ? "text" : "images"],
    enabled: Boolean(manga),
    staleTime: 30 * 60 * 1000,
    queryFn: async () => {
      const mode = isNovel ? "text" : "images";
      const res = await fetch(
        `/api/pages/${encodeURIComponent(source)}/${encodeURIComponent(chapterId)}?mode=${mode}`,
      );
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed to load pages");
      return res.json() as Promise<{ pages?: { url: string }[]; paragraphs?: string[] }>;
    },
  });

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

  // Overall chapter progress for the chrome's top bar.
  const chromeProgress = saved
    ? mode === "pages" && saved.page !== undefined
      ? (saved.page + 1) / Math.max(pages.length, 1)
      : (saved.pct ?? 0)
    : undefined;

  const body = (() => {
    if (titleQ.isPending || pagesQ.isPending) {
      return (
        <div className="grid h-dvh place-items-center">
          <div className="flex flex-col items-center gap-4">
            <PalaceMark size={44} className="animate-glow-pulse" />
            <p className="text-sm text-mist">Summoning pages…</p>
          </div>
        </div>
      );
    }

    if (titleQ.isError || pagesQ.isError) {
      const message =
        (pagesQ.error as Error)?.message ??
        (titleQ.error as Error)?.message ??
        "Something went wrong";
      return (
        <div className="grid h-dvh place-items-center px-6">
          <div className="max-w-sm text-center">
            <h2 className="font-display text-xl font-semibold">
              Couldn’t load this chapter
            </h2>
            <p className="mt-2 text-sm break-words text-mist">{message}</p>
            <div className="mt-5 flex justify-center gap-3">
              <button
                onClick={() => {
                  void pagesQ.refetch();
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
        onProgress={(page) => onPageProgress(page, pages.length)}
        onReachEnd={onReachEnd}
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
