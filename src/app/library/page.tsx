"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useLibrary } from "@/lib/library";
import { CoverImage } from "@/components/media/CoverImage";
import { Skeleton } from "@/components/ui/Skeleton";
import { LibraryIcon, TrashIcon } from "@/components/icons";
import { cn } from "@/lib/utils";

/**
 * Library — everything saved on this device, newest activity first.
 */
export default function LibraryPage() {
  const { entries, hydrated, hydrate, remove } = useLibrary();

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  const list = Object.values(entries).sort((a, b) => b.updatedAt - a.updatedAt);

  return (
    <div className="px-5 pt-8 lg:px-10">
      <div className="mb-6 flex items-baseline gap-3">
        <h1 className="font-display text-2xl font-bold">Library</h1>
        {hydrated && list.length > 0 && (
          <span className="text-sm text-mist">
            {list.length} title{list.length === 1 ? "" : "s"}
          </span>
        )}
      </div>

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

      {hydrated && list.length > 0 && (
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7">
          {list.map((e) => {
            const pct = Math.round((e.progressPct ?? 0) * 100);
            const resumeHref = e.lastChapterId
              ? `/read/${encodeURIComponent(e.source)}/${encodeURIComponent(e.mangaId)}/${encodeURIComponent(e.lastChapterId)}`
              : `/title/${encodeURIComponent(e.source)}/${encodeURIComponent(e.mangaId)}`;
            return (
              <div key={e.key} className="group relative">
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
                  onClick={() => void remove(e.key)}
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
          })}
        </div>
      )}
    </div>
  );
}
