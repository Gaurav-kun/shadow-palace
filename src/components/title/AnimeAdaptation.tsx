"use client";

import { useQuery } from "@tanstack/react-query";
import { cn, timeAgo } from "@/lib/utils";

interface AnimeAdaptation {
  id: number;
  title: string;
  format?: string;
  status: string;
  episodes?: number;
  season?: string;
  seasonYear?: number;
  nextEpisode?: number;
  nextAiringAt?: number;
  score?: number;
}

const STATUS_STYLE: Record<string, { label: string; cls: string; dot: string }> = {
  RELEASING: {
    label: "Airing",
    cls: "border-emerald-400/40 bg-emerald-400/10 text-emerald-300",
    dot: "bg-emerald-400 animate-pulse",
  },
  NOT_YET_RELEASED: {
    label: "Upcoming",
    cls: "border-flame/40 bg-flame/10 text-flame",
    dot: "bg-flame",
  },
  FINISHED: {
    label: "Finished",
    cls: "border-veil text-mist",
    dot: "bg-mist",
  },
  CANCELLED: {
    label: "Cancelled",
    cls: "border-ember/40 bg-ember/10 text-ember",
    dot: "bg-ember",
  },
  HIATUS: {
    label: "Hiatus",
    cls: "border-amber-400/40 bg-amber-400/10 text-amber-300",
    dot: "bg-amber-400",
  },
};

function Countdown({ at }: { at: number }) {
  const ms = at - Date.now();
  if (ms <= 0) return <span className="text-emerald-300">out now</span>;
  const d = Math.floor(ms / 86_400_000);
  const h = Math.floor((ms % 86_400_000) / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  const text = d > 0 ? `${d}d ${h}h` : h > 0 ? `${h}h ${m}m` : `${m}m`;
  return <span className="text-flame">in {text}</span>;
}

/**
 * Anime adaptation panel for a title page — pulled live from AniList.
 * Shows airing status, episode counts and the next-episode countdown.
 */
export function AnimeAdaptationPanel({ title }: { title: string }) {
  const { data, isPending } = useQuery({
    queryKey: ["airing", title],
    staleTime: 6 * 60 * 60 * 1000,
    queryFn: async () => {
      const res = await fetch(`/api/airing?title=${encodeURIComponent(title)}`);
      if (!res.ok) throw new Error("airing failed");
      return (await res.json()) as {
        info: { anime: AnimeAdaptation[] } | null;
      };
    },
  });

  if (isPending) {
    return (
      <div className="rounded-2xl border border-veil/50 bg-palace/40 p-4">
        <div className="h-3 w-28 animate-shimmer rounded bg-veil/60" />
        <div className="mt-3 h-3 w-48 animate-shimmer rounded bg-veil/40" />
      </div>
    );
  }

  const anime = data?.info?.anime ?? [];
  if (anime.length === 0) return null;

  return (
    <div className="rounded-2xl border border-veil/50 bg-palace/40 p-4">
      <p className="mb-3 text-[10.5px] font-semibold tracking-[0.2em] text-mist uppercase">
        Anime adaptation
      </p>
      <ul className="space-y-3">
        {anime.slice(0, 3).map((a) => {
          const s = STATUS_STYLE[a.status] ?? STATUS_STYLE.FINISHED;
          return (
            <li key={a.id} className="flex items-start gap-3">
              <span className={cn("mt-1.5 h-2 w-2 shrink-0 rounded-full", s.dot)} />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={cn(
                      "rounded-full border px-2 py-0.5 text-[10px] font-semibold",
                      s.cls,
                    )}
                  >
                    {s.label}
                  </span>
                  {a.format && (
                    <span className="text-[11px] text-mist">{a.format}</span>
                  )}
                  {a.season && (
                    <span className="text-[11px] capitalize text-mist">
                      {a.season.toLowerCase()} {a.seasonYear}
                    </span>
                  )}
                  {a.episodes && (
                    <span className="text-[11px] text-mist">{a.episodes} eps</span>
                  )}
                  {a.score && (
                    <span className="text-[11px] text-amber-300/90">
                      ★ {(a.score / 10).toFixed(1)}
                    </span>
                  )}
                </div>
                <p className="mt-0.5 truncate text-[13px] text-moon/90">
                  {a.title}
                </p>
                {a.status === "RELEASING" && (
                  <p className="mt-0.5 text-[11.5px] text-mist">
                    {a.nextEpisode ? `Ep ${a.nextEpisode}` : "New episode"}{" "}
                    {a.nextAiringAt ? (
                      <Countdown at={a.nextAiringAt} />
                    ) : (
                      <span className="text-mist/70">soon</span>
                    )}
                  </p>
                )}
                {a.status === "NOT_YET_RELEASED" && a.nextAiringAt && (
                  <p className="mt-0.5 text-[11.5px] text-mist">
                    premieres {timeAgo(a.nextAiringAt)} (
                    {new Date(a.nextAiringAt).toLocaleDateString()})
                  </p>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
