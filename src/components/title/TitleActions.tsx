"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useLibrary, entryKey } from "@/lib/library";
import type { SourceChapter, SourceManga } from "@/sources/types";
import { BookOpenIcon, BellIcon, CheckIcon, PlusIcon } from "@/components/icons";
import { cn } from "@/lib/utils";

interface TitleActionsProps {
  source: string;
  manga: SourceManga;
  chapters: SourceChapter[];
}

/**
 * Primary reading CTA + library toggle for the title page.
 * "Continue" resumes the last-opened chapter when one exists.
 */
export function TitleActions({ source, manga, chapters }: TitleActionsProps) {
  const router = useRouter();
  const { entries, hydrate, ensure, remove, toggleFollow } = useLibrary();
  const key = entryKey(source, manga.id);
  const entry = entries[key];
  const following = Boolean(entry?.followed);

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  const doneIds = new Set(
    Object.entries(entry?.chapters ?? {})
      .filter(([, p]) => p.done)
      .map(([id]) => id),
  );

  // First unread chapter, falling back to the first chapter overall.
  const firstUnread = chapters.find((c) => !doneIds.has(c.id)) ?? chapters[0];
  const resume = entry?.lastChapterId
    ? chapters.find((c) => c.id === entry.lastChapterId)
    : undefined;
  const target = resume ?? firstUnread;

  const label = resume
    ? `Continue · Ch. ${resume.number ?? "?"}`
    : firstUnread
      ? `Read · Ch. ${firstUnread.number ?? "?"}`
      : "Read";

  const goRead = () => {
    if (!target) return;
    void ensure({
      source,
      mangaId: manga.id,
      title: manga.title,
      coverImage: manga.coverImage,
      kind: manga.kind,
    });
    router.push(
      `/read/${encodeURIComponent(source)}/${encodeURIComponent(manga.id)}/${encodeURIComponent(target.id)}`,
    );
  };

  const inLibrary = Boolean(entry);

  const toggleLibrary = () => {
    if (inLibrary) void remove(key);
    else
      void ensure({
        source,
        mangaId: manga.id,
        title: manga.title,
        coverImage: manga.coverImage,
        kind: manga.kind,
      });
  };

  const toggleFollowBtn = () => {
    void toggleFollow(key, {
      source,
      mangaId: manga.id,
      title: manga.title,
      coverImage: manga.coverImage,
      kind: manga.kind,
    });
  };

  return (
    <div className="flex flex-wrap items-center gap-3">
      <button
        onClick={goRead}
        disabled={!target}
        className="flex items-center gap-2 rounded-xl bg-linear-to-r from-flame-deep to-flame px-6 py-3 font-semibold text-white shadow-lg shadow-flame-deep/25 transition-all hover:shadow-flame/40 hover:brightness-110 active:scale-[0.98] disabled:opacity-40"
      >
        <BookOpenIcon className="h-[18px] w-[18px]" width={18} height={18} />
        {label}
      </button>

      <button
        onClick={toggleLibrary}
        className={cn(
          "flex items-center gap-2 rounded-xl border px-4 py-3 text-sm font-medium transition-all",
          inLibrary
            ? "border-flame/50 bg-flame/10 text-flame"
            : "border-veil/70 text-mist hover:border-veil hover:text-moon",
        )}
      >
        {inLibrary ? (
          <>
            <CheckIcon className="h-4 w-4" width={16} height={16} />
            In library
          </>
        ) : (
          <>
            <PlusIcon className="h-4 w-4" width={16} height={16} />
            Add to library
          </>
        )}
      </button>

      <button
        onClick={toggleFollowBtn}
        aria-pressed={following}
        className={cn(
          "flex items-center gap-2 rounded-xl border px-4 py-3 text-sm font-medium transition-all",
          following
            ? "border-flame/50 bg-flame/10 text-flame"
            : "border-veil/70 text-mist hover:border-veil hover:text-moon",
        )}
      >
        <BellIcon className="h-4 w-4" width={16} height={16} />
        {following ? "Following" : "Follow"}
      </button>
    </div>
  );
}
