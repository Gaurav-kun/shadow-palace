"use client";

import { useCallback, useEffect, useState } from "react";
import type { SeriesCharacter, SeriesInfo } from "@/lib/anilist";
import type { ComickStats } from "@/lib/comick";
import { cn } from "@/lib/utils";

function fmt(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

const ROLE_STYLE: Record<string, string> = {
  MAIN: "border-flame/50 bg-flame/10 text-flame",
  SIDE: "border-veil text-mist",
  BACKGROUND: "border-veil/50 text-mist/60",
};

const ROLE_LABEL: Record<string, string> = {
  MAIN: "Main",
  SIDE: "Supporting",
  BACKGROUND: "Background",
};

/**
 * Series details panel — AniList scores/popularity + the character
 * roster. Portraits are a preview row; tapping opens the full
 * character popup (grid of cast cards with roles & bios).
 */
export function SeriesDetails({
  series,
  comick,
}: {
  series: SeriesInfo | null;
  comick?: ComickStats | null;
}) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<number | null>(null);

  const characters = series?.characters ?? [];
  const hasScore = typeof series?.averageScore === "number";
  const preview = characters.slice(0, 10);

  const close = useCallback(() => {
    setOpen(false);
    setSelected(null);
  }, []);

  // Esc closes the popup.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, close]);

  if ((!series || (!hasScore && characters.length === 0)) && !comick) return null;

  return (
    <section className="mt-8 max-w-3xl rounded-2xl border border-veil/50 bg-palace/40 p-4">
      <p className="mb-3 text-[10.5px] font-semibold tracking-[0.2em] text-mist uppercase">
        Series details
      </p>

      {/* Scores + stats */}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
        {hasScore && (
          <div className="flex items-baseline gap-1.5">
            <span className="text-2xl font-bold text-amber-300">
              ★ {(series.averageScore! / 10).toFixed(1)}
            </span>
            <span className="text-[11px] text-mist">AniList</span>
          </div>
        )}
        {series?.popularity !== undefined && (
          <span className="text-xs text-mist">
            <span className="font-semibold text-moon/90">{fmt(series.popularity)}</span>{" "}
            readers
          </span>
        )}
        {series?.favourites !== undefined && (
          <span className="text-xs text-mist">
            <span className="font-semibold text-moon/90">{fmt(series.favourites)}</span>{" "}
            favourites
          </span>
        )}
        {series?.chapters !== undefined && (
          <span className="text-xs text-mist">
            <span className="font-semibold text-moon/90">{series.chapters}</span> chapters
          </span>
        )}
        {series?.startDateYear !== undefined && (
          <span className="text-xs text-mist">{series.startDateYear}</span>
        )}
        {series?.siteUrl && (
          <a
            href={series.siteUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="ml-auto text-[11px] text-mist underline-offset-2 transition-colors hover:text-flame hover:underline"
          >
            AniList ↗
          </a>
        )}
      </div>

      {/* Comick community rating + score histogram */}
      {comick && comick.ratingCount > 0 && (
        <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-3">
          <div className="text-center">
            <div className="text-3xl leading-none font-bold text-amber-300">
              {comick.rating.toFixed(1)}
            </div>
            <div className="mt-1 text-[10px] text-mist">
              {fmt(comick.ratingCount)} ratings · Comick
            </div>
          </div>
          <div className="min-w-[200px] flex-1 space-y-1">
            {([10, 9, 8, 7, 6, 5, 4, 3, 2, 1] as const).map((s) => {
              const count = comick.distribution[String(s)] ?? 0;
              const max = Math.max(
                1,
                ...Object.values(comick.distribution),
              );
              const pct = (count / max) * 100;
              return (
                <div key={s} className="flex items-center gap-1.5 text-[9px] text-mist">
                  <span className="w-3 text-right tabular-nums">{s}</span>
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-veil/40">
                    <div
                      className="h-full rounded-full bg-linear-to-r from-flame-deep to-flame"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <span className="w-9 text-right tabular-nums text-mist/70">
                    {count > 0 ? (count >= 1000 ? `${(count / 1000).toFixed(1)}k` : count) : ""}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Character preview → popup */}
      {preview.length > 0 && (
        <div className="mt-4">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-xs font-medium text-moon/90">
              Main cast{" "}
              <span className="font-normal text-mist">
                · {characters.length} known
              </span>
            </p>
            <button
              onClick={() => setOpen(true)}
              className="text-xs text-mist transition-colors hover:text-flame"
            >
              View all →
            </button>
          </div>
          <div className="no-scrollbar flex gap-2.5 overflow-x-auto pb-1">
            {preview.map((c) => (
              <button
                key={c.id}
                onClick={() => {
                  setSelected(c.id);
                  setOpen(true);
                }}
                className="group w-16 shrink-0 text-center"
                title={c.name}
              >
                <CharPortrait c={c} />
                <p className="mt-1 line-clamp-2 text-[10px] leading-tight text-mist transition-colors group-hover:text-moon">
                  {c.name}
                </p>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Character list popup */}
      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Character list"
          className="fixed inset-0 z-50 flex items-end justify-center sm:items-center"
          onClick={close}
        >
          <div className="absolute inset-0 bg-void/85 backdrop-blur-sm" />
          <div
            className="relative max-h-[85dvh] w-full max-w-3xl overflow-hidden rounded-t-2xl border border-veil/60 bg-palace shadow-2xl sm:rounded-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-veil/40 px-5 py-3.5">
              <div>
                <h3 className="font-display text-base font-semibold">Characters</h3>
                <p className="text-[11px] text-mist">
                  {series?.title} · {characters.length} in cast
                </p>
              </div>
              <button
                onClick={close}
                className="rounded-lg border border-veil/60 px-2.5 py-1.5 text-sm text-mist transition-colors hover:border-flame/40 hover:text-flame"
                aria-label="Close"
              >
                ✕
              </button>
            </div>

            <div className="max-h-[calc(85dvh-64px)] overflow-y-auto p-4">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {characters.map((c) => (
                  <div
                    key={c.id}
                    className={cn(
                      "rounded-xl border p-3 transition-colors",
                      selected === c.id
                        ? "border-flame/50 bg-flame/5"
                        : "border-veil/40 bg-palace/60",
                    )}
                  >
                    <div className="flex items-start gap-3">
                      <div className="h-20 w-14 shrink-0 overflow-hidden rounded-lg bg-hall/60">
                        <CharPortrait c={c} />
                      </div>
                      <div className="min-w-0">
                        <p className="line-clamp-2 text-[13px] leading-snug font-medium text-moon/90">
                          {c.name}
                        </p>
                        <span
                          className={cn(
                            "mt-1 inline-block rounded-full border px-1.5 py-0.5 text-[9px] font-semibold",
                            ROLE_STYLE[c.role] ?? ROLE_STYLE.SIDE,
                          )}
                        >
                          {ROLE_LABEL[c.role] ?? c.role}
                        </span>
                      </div>
                    </div>
                    {c.description && (
                      <p className="mt-2 line-clamp-3 text-[11px] leading-relaxed text-mist">
                        {c.description}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

function CharPortrait({ c }: { c: SeriesCharacter }) {
  const [failed, setFailed] = useState(false);
  if (!c.image || failed) {
    return (
      <div className="grid h-full w-full place-items-center bg-gradient-to-br from-hall via-palace to-abyss">
        <span className="font-display text-lg font-bold text-veil">
          {c.name.trim().charAt(0).toUpperCase() || "?"}
        </span>
      </div>
    );
  }
  // eslint-disable-next-line @next/next/no-img-element -- AniList portraits
  return (
    <img
      src={c.image}
      alt={c.name}
      loading="lazy"
      onError={() => setFailed(true)}
      className="h-full w-full object-cover"
    />
  );
}
