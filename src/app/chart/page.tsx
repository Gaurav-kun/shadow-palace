"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { CoverImage } from "@/components/media/CoverImage";
import { ChevronLeftIcon, ChevronRightIcon } from "@/components/icons";
import { cn } from "@/lib/utils";
import { currentSeason, type Season, type SeasonEntry } from "@/lib/anilist";

/**
 * Seasonal chart — AniChart-style grid of a season's anime with scores,
 * formats and live next-episode countdowns, all in the palace's dark
 * language. Data comes from AniList via /api/chart (cached 6h).
 */

const SEASON_ORDER: Season[] = ["WINTER", "SPRING", "SUMMER", "FALL"];
const SEASON_LABEL: Record<Season, string> = {
  WINTER: "Winter",
  SPRING: "Spring",
  SUMMER: "Summer",
  FALL: "Fall",
};

type SortKey = "popularity" | "score" | "airing";

function stepSeason(season: Season, year: number, dir: 1 | -1) {
  const i = SEASON_ORDER.indexOf(season) + dir;
  if (i < 0) return { season: SEASON_ORDER[3], year: year - 1 };
  if (i > 3) return { season: SEASON_ORDER[0], year: year + 1 };
  return { season: SEASON_ORDER[i], year };
}

/** Compact human countdown: "4h 12m", "2d 3h", "just now". */
function countdown(ms: number, now: number): string {
  const diff = ms - now;
  if (diff <= 0) return "aired";
  const m = Math.floor(diff / 60_000);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ${m % 60}m`;
  const d = Math.floor(h / 24);
  return `${d}d ${h % 24}h`;
}

function airingRank(e: SeasonEntry): number {
  if (e.nextAiringAt) return e.nextAiringAt;
  if (e.startsAt && e.status === "NOT_YET_RELEASED") return e.startsAt;
  return Number.MAX_SAFE_INTEGER;
}

export default function ChartPage() {
  const init = useMemo(() => currentSeason(), []);
  const [season, setSeason] = useState<Season>(init.season);
  const [year, setYear] = useState<number>(init.year);
  const [sort, setSort] = useState<SortKey>("popularity");
  // Ticker so countdowns stay alive without re-rendering per second.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

  const chart = useQuery({
    queryKey: ["chart", season, year],
    queryFn: async () => {
      const res = await fetch(
        `/api/chart?season=${season}&year=${year}`,
      );
      if (!res.ok) throw new Error("Chart failed");
      return res.json() as Promise<{
        entries: SeasonEntry[];
      }>;
    },
    staleTime: 30 * 60 * 1000,
  });

  const entries = useMemo(() => {
    const list = [...(chart.data?.entries ?? [])];
    if (sort === "score") list.sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
    else if (sort === "airing") list.sort((a, b) => airingRank(a) - airingRank(b));
    else list.sort((a, b) => (b.popularity ?? 0) - (a.popularity ?? 0));
    return list;
  }, [chart.data?.entries, sort]);

  const prev = stepSeason(season, year, -1);
  const next = stepSeason(season, year, 1);

  return (
    <div className="px-5 pt-8 lg:px-10">
      {/* Header */}
      <div className="mx-auto max-w-3xl text-center">
        <h2 className="font-display text-2xl font-semibold tracking-wide">
          Seasonal <span className="text-gradient">Chart</span>
        </h2>
        <p className="mt-1.5 text-sm text-mist">
          What&apos;s airing — {SEASON_LABEL[season]} {year}, straight from
          AniList.
        </p>
      </div>

      {/* Season stepper */}
      <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
        <button
          onClick={() => {
            setSeason(prev.season);
            setYear(prev.year);
          }}
          className="rounded-full border border-veil/60 p-2 text-mist transition-colors hover:border-veil hover:text-moon"
          aria-label="Previous season"
        >
          <ChevronLeftIcon width={16} height={16} />
        </button>
        {SEASON_ORDER.map((s) => (
          <button
            key={s}
            onClick={() => setSeason(s)}
            className={cn(
              "rounded-full border px-3.5 py-1.5 text-xs font-medium whitespace-nowrap transition-all",
              s === season
                ? "border-flame/60 bg-flame/15 text-flame"
                : "border-veil/60 bg-palace/50 text-mist hover:border-veil hover:text-moon",
            )}
          >
            {SEASON_LABEL[s]}
          </button>
        ))}
        <div className="flex items-center gap-1 rounded-full border border-veil/60 bg-palace/50 px-1 py-0.5">
          <button
            onClick={() => setYear((y) => y - 1)}
            className="rounded-full px-2 py-1 text-mist transition-colors hover:text-moon"
            aria-label="Previous year"
          >
            <ChevronLeftIcon width={14} height={14} />
          </button>
          <span className="min-w-[3.5ch] text-center text-xs font-semibold text-moon">
            {year}
          </span>
          <button
            onClick={() => setYear((y) => y + 1)}
            className="rounded-full px-2 py-1 text-mist transition-colors hover:text-moon"
            aria-label="Next year"
          >
            <ChevronRightIcon width={14} height={14} />
          </button>
        </div>
        <button
          onClick={() => {
            setSeason(next.season);
            setYear(next.year);
          }}
          className="rounded-full border border-veil/60 p-2 text-mist transition-colors hover:border-veil hover:text-moon"
          aria-label="Next season"
        >
          <ChevronRightIcon width={16} height={16} />
        </button>
      </div>

      {/* Sort toggle */}
      <div className="mt-4 flex justify-center gap-2">
        {(
          [
            ["popularity", "Popular"],
            ["score", "Top rated"],
            ["airing", "Airing order"],
          ] as [SortKey, string][]
        ).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setSort(key)}
            className={cn(
              "rounded-lg px-3 py-1.5 text-[11px] font-medium transition-colors",
              sort === key
                ? "bg-hall text-flame ring-1 ring-flame/30"
                : "text-mist hover:text-moon",
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Grid */}
      <div className="mt-8">
        {chart.isLoading && (
          <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7">
            {Array.from({ length: 14 }).map((_, i) => (
              <div key={i} className="aspect-2/3 animate-pulse rounded-xl bg-hall/60" />
            ))}
          </div>
        )}

        {chart.isError && (
          <p className="py-16 text-center text-sm text-mist">
            The chart couldn&apos;t reach AniList — try again shortly.
          </p>
        )}

        {entries.length > 0 && (
          <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7">
            {entries.map((e, i) => (
              <ChartCard key={e.id} entry={e} now={now} index={i} />
            ))}
          </div>
        )}

        {!chart.isLoading && !chart.isError && entries.length === 0 && (
          <p className="py-16 text-center text-sm text-mist">
            Nothing on the board for {SEASON_LABEL[season]} {year}.
          </p>
        )}
      </div>
    </div>
  );
}

function ChartCard({
  entry,
  now,
  index,
}: {
  entry: SeasonEntry;
  now: number;
  index: number;
}) {
  const status = (() => {
    if (entry.nextAiringAt) {
      return {
        live: true,
        text:
          entry.nextAiringAt > now
            ? `Ep ${entry.nextEpisode} in ${countdown(entry.nextAiringAt, now)}`
            : `Ep ${entry.nextEpisode} aired`,
      };
    }
    if (entry.status === "NOT_YET_RELEASED") {
      return {
        live: false,
        text: entry.startsAt
          ? entry.startsAt > now
            ? `Premieres in ${countdown(entry.startsAt, now)}`
            : "Premiered"
          : "Upcoming",
      };
    }
    if (entry.status === "HIATUS") return { live: false, text: "On hiatus" };
    if (entry.status === "CANCELLED") return { live: false, text: "Cancelled" };
    return {
      live: false,
      text: entry.episodes ? `Finished · ${entry.episodes} ep` : "Finished",
    };
  })();

  return (
    <motion.a
      href={`https://anilist.co/anime/${entry.id}`}
      target="_blank"
      rel="noopener noreferrer"
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay: Math.min(index, 24) * 0.025 }}
      className="group block outline-none"
    >
      <div className="relative aspect-2/3 overflow-hidden rounded-xl ring-1 ring-veil/50 transition-all duration-300 group-hover:ring-flame/50 group-focus-visible:ring-flame/70">
        <CoverImage
          src={entry.coverImage}
          alt={entry.title}
          className="h-full w-full transition-transform duration-500 group-hover:scale-[1.06]"
        />
        <div className="pointer-events-none absolute inset-0 bg-linear-to-t from-void/85 via-transparent to-transparent" />
        {/* Score */}
        {entry.score != null && (
          <span className="absolute top-2 left-2 rounded-md bg-void/80 px-1.5 py-0.5 text-[10px] font-semibold text-amber-300/90 backdrop-blur-sm">
            ★ {(entry.score / 10).toFixed(1)}
          </span>
        )}
        {/* Format */}
        {entry.format && entry.format !== "TV" && (
          <span className="absolute top-2 right-2 rounded-md bg-void/80 px-1.5 py-0.5 text-[9px] font-semibold tracking-wide text-mist uppercase backdrop-blur-sm">
            {entry.format}
          </span>
        )}
        {/* Status strip */}
        <span
          className={cn(
            "absolute right-2 bottom-2 left-2 flex items-center gap-1.5 text-[10px] font-medium",
            status.live ? "text-flame" : "text-mist",
          )}
        >
          {status.live && (
            <span className="h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-flame" />
          )}
          <span className="truncate">{status.text}</span>
        </span>
      </div>
      <h3 className="mt-2 line-clamp-2 text-[13px] leading-snug font-medium text-moon/90 transition-colors group-hover:text-flame">
        {entry.title}
      </h3>
      {entry.genres.length > 0 && (
        <p className="mt-0.5 truncate text-[10.5px] text-mist/80">
          {entry.genres.slice(0, 2).join(" · ")}
        </p>
      )}
    </motion.a>
  );
}
