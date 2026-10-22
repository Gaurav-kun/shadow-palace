"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useLibrary, type LibraryEntry } from "@/lib/library";
import { useReaderPrefs } from "@/lib/prefs";
import { CoverImage } from "@/components/media/CoverImage";
import { Skeleton } from "@/components/ui/Skeleton";
import { LibraryIcon, TrashIcon } from "@/components/icons";
import { cn, timeAgo } from "@/lib/utils";

/**
 * Library — shelves of everything saved on this device, plus a reading
 * history view and JSON backup export/import (entries + reader prefs).
 */
export default function LibraryPage() {
  const { entries, hydrated, hydrate, remove, importAll } = useLibrary();
  const [view, setView] = useState<"shelves" | "history">("shelves");
  const [backupMsg, setBackupMsg] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  const list = Object.values(entries).sort((a, b) => b.updatedAt - a.updatedAt);

  /* ── Backup ──────────────────────────────────────────────── */
  const exportBackup = () => {
    const prefs = useReaderPrefs.getState();
    const payload = {
      app: "shadow-palace",
      version: 1,
      exportedAt: new Date().toISOString(),
      entries: list,
      prefs: {
        fitMode: prefs.fitMode,
        direction: prefs.direction,
        useScrollForManhwa: prefs.useScrollForManhwa,
        novelFontSize: prefs.novelFontSize,
        novelLineHeight: prefs.novelLineHeight,
        dimmer: prefs.dimmer,
      },
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `shadow-palace-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setBackupMsg(`Exported ${list.length} titles.`);
  };

  const importBackup = async (file: File) => {
    try {
      const parsed = JSON.parse(await file.text()) as {
        entries?: LibraryEntry[];
        prefs?: Record<string, unknown>;
      };
      if (!Array.isArray(parsed.entries)) throw new Error("No entries found in file");
      const merged = await importAll(parsed.entries);
      if (parsed.prefs) {
        const { set, ...rest } = parsed.prefs;
        useReaderPrefs.setState(rest as never);
      }
      setBackupMsg(`Imported ${merged} title${merged === 1 ? "" : "s"}.`);
    } catch (err) {
      setBackupMsg(err instanceof Error ? err.message : "Import failed");
    }
  };

  return (
    <div className="px-5 pt-8 lg:px-10">
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <h1 className="font-display text-2xl font-bold">Library</h1>
        {hydrated && list.length > 0 && (
          <span className="text-sm text-mist">
            {list.length} title{list.length === 1 ? "" : "s"}
          </span>
        )}

        <div className="ml-auto flex items-center gap-2">
          {/* View toggle */}
          <div className="flex rounded-lg bg-hall/70 p-0.5 ring-1 ring-veil/50">
            {(
              [
                ["shelves", "Shelves"],
                ["history", "History"],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                onClick={() => setView(key)}
                className={cn(
                  "rounded-md px-3 py-1.5 text-[11.5px] font-medium transition-colors",
                  view === key
                    ? "bg-abyss text-flame shadow-sm"
                    : "text-mist hover:text-moon",
                )}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Backup */}
          <button
            onClick={exportBackup}
            className="rounded-lg border border-veil/60 px-3 py-1.5 text-[11.5px] font-medium text-mist transition-colors hover:border-veil hover:text-moon"
            title="Download your library + reader settings as JSON"
          >
            Export
          </button>
          <button
            onClick={() => fileRef.current?.click()}
            className="rounded-lg border border-veil/60 px-3 py-1.5 text-[11.5px] font-medium text-mist transition-colors hover:border-veil hover:text-moon"
            title="Restore from a backup file"
          >
            Import
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void importBackup(f);
              e.target.value = "";
            }}
          />
        </div>
      </div>

      {backupMsg && (
        <p
          className="mb-4 rounded-xl bg-hall/70 px-4 py-2.5 text-[13px] text-moon ring-1 ring-veil/50"
          role="status"
        >
          {backupMsg}
          <button
            onClick={() => setBackupMsg(null)}
            className="ml-3 text-mist hover:text-moon"
          >
            ✕
          </button>
        </p>
      )}

      {!hydrated && (
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7">
          {Array.from({ length: 7 }).map((_, i) => (
            <Skeleton key={i} className="aspect-2/3 w-full" />
          ))}
        </div>
      )}

      {hydrated && list.length === 0 && (
        <div className="mx-auto max-w-md py-20 text-center">
          <div className="mb-4 flex justify-center text-veil">
            <LibraryIcon className="h-12 w-12" width={48} height={48} />
          </div>
          <h3 className="font-display text-lg font-semibold text-moon/90">
            The shelves are bare
          </h3>
          <p className="mt-1.5 text-sm text-mist">
            Open any title and hit “Add to library” — or just start reading,
            it’ll appear here automatically.
          </p>
          <Link
            href="/search"
            className="mt-5 inline-block rounded-xl bg-flame/15 px-5 py-2.5 text-sm font-medium text-flame ring-1 ring-flame/40 transition-colors hover:bg-flame/25"
          >
            Find something to read
          </Link>
        </div>
      )}

      {/* ── Shelves ──────────────────────────────────────────── */}
      {hydrated && view === "shelves" && list.length > 0 && (
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7">
          {list.map((e) => (
            <ShelfCard key={e.key} entry={e} onRemove={() => void remove(e.key)} />
          ))}
        </div>
      )}

      {/* ── History ──────────────────────────────────────────── */}
      {hydrated && view === "history" && list.length > 0 && (
        <div className="mx-auto max-w-2xl">
          {list.map((e) => {
            const pct = Math.round((e.progressPct ?? 0) * 100);
            const readCount = Object.values(e.chapters).filter(
              (c) => c.done,
            ).length;
            const resumeHref = e.lastChapterId
              ? `/read/${encodeURIComponent(e.source)}/${encodeURIComponent(e.mangaId)}/${encodeURIComponent(e.lastChapterId)}`
              : `/title/${encodeURIComponent(e.source)}/${encodeURIComponent(e.mangaId)}`;
            return (
              <Link
                key={e.key}
                href={resumeHref}
                className="group flex items-center gap-3.5 border-b border-veil/30 py-3 transition-colors hover:bg-hall/30"
              >
                <div className="h-16 w-11 shrink-0 overflow-hidden rounded-lg ring-1 ring-veil/50">
                  <CoverImage
                    src={e.coverImage}
                    alt={e.title}
                    className="h-full w-full"
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13.5px] font-medium text-moon/90 group-hover:text-flame">
                    {e.title}
                  </p>
                  <p className="mt-0.5 text-[11.5px] text-mist">
                    {e.lastChapterNumber ? `Ch. ${e.lastChapterNumber} · ` : ""}
                    {pct > 0 ? `${pct}% read · ` : ""}
                    {readCount > 0 && `${readCount} finished · `}
                    {timeAgo(e.updatedAt)}
                  </p>
                  {e.progressPct !== undefined && e.progressPct < 1 && (
                    <div className="mt-1.5 h-0.5 overflow-hidden rounded-full bg-veil/60">
                      <div
                        className="h-full bg-linear-to-r from-flame to-ember"
                        style={{ width: `${Math.max(pct, 3)}%` }}
                      />
                    </div>
                  )}
                </div>
                <span className="shrink-0 text-[11px] font-medium text-flame opacity-0 transition-opacity group-hover:opacity-100">
                  Resume ›
                </span>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

function ShelfCard({
  entry: e,
  onRemove,
}: {
  entry: LibraryEntry;
  onRemove: () => void;
}) {
  const pct = Math.round((e.progressPct ?? 0) * 100);
  const resumeHref = e.lastChapterId
    ? `/read/${encodeURIComponent(e.source)}/${encodeURIComponent(e.mangaId)}/${encodeURIComponent(e.lastChapterId)}`
    : `/title/${encodeURIComponent(e.source)}/${encodeURIComponent(e.mangaId)}`;
  return (
    <div className="group relative">
      <Link href={resumeHref} className="block">
        <div className="relative aspect-2/3 overflow-hidden rounded-xl ring-1 ring-veil/50 transition-all duration-300 group-hover:ring-flame/50">
          <CoverImage
            src={e.coverImage}
            alt={e.title}
            className="h-full w-full transition-transform duration-500 group-hover:scale-[1.05]"
          />
          <div className="absolute inset-x-0 bottom-0 bg-linear-to-t from-void/90 to-transparent p-2 pt-6">
            {e.lastChapterNumber && (
              <p className="text-[10px] font-semibold text-flame">
                Ch. {e.lastChapterNumber}
                {e.progressPct !== undefined && pct < 99 && (
                  <span className="text-mist"> · {pct}%</span>
                )}
              </p>
            )}
            <div className="mt-1 h-0.5 overflow-hidden rounded-full bg-veil/60">
              <div
                className="h-full bg-linear-to-r from-flame to-ember"
                style={{ width: `${Math.max(pct, 3)}%` }}
              />
            </div>
          </div>
        </div>
        <p className="mt-2 line-clamp-2 text-[12.5px] leading-snug font-medium text-moon/90 transition-colors group-hover:text-flame">
          {e.title}
        </p>
      </Link>

      {/* Remove */}
      <button
        onClick={onRemove}
        aria-label={`Remove ${e.title} from library`}
        className={cn(
          "absolute top-2 right-2 rounded-lg bg-void/70 p-1.5 text-mist backdrop-blur-sm transition-all",
          "hover:bg-ember/20 hover:text-ember",
          "opacity-100 sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100",
        )}
      >
        <TrashIcon className="h-3.5 w-3.5" width={14} height={14} />
      </button>
    </div>
  );
}
