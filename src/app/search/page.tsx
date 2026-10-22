"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { MangaCard } from "@/components/media/MangaCard";
import { CardSkeletonGrid, Skeleton } from "@/components/ui/Skeleton";
import { cn } from "@/lib/utils";
import { CompassIcon } from "@/components/icons";

interface GroupResult {
  source: string;
  name: string;
  kind: string;
  results: {
    id: string;
    title: string;
    coverImage?: string;
    latestChapter?: string;
    subtitle?: string;
  }[];
  error?: string;
}

const KIND_LABEL: Record<string, string> = {
  manga: "Manga",
  manhwa: "Manhwa",
  novel: "Novel",
};

export default function SearchPage() {
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [source, setSource] = useState("all");
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-focus on desktop
  useEffect(() => {
    if (window.matchMedia("(pointer: fine)").matches) inputRef.current?.focus();
  }, []);

  // Debounce typing
  useEffect(() => {
    const t = setTimeout(() => setDebounced(query.trim()), 350);
    return () => clearTimeout(t);
  }, [query]);

  const { data, isFetching, isLoading } = useQuery({
    queryKey: ["search", debounced, source],
    queryFn: async () => {
      const params = new URLSearchParams({ q: debounced, source });
      const res = await fetch(`/api/search?${params}`);
      if (!res.ok) throw new Error("Search failed");
      return res.json() as Promise<{ groups: GroupResult[] }>;
    },
    enabled: debounced.length > 0,
    staleTime: 60_000,
  });

  const sources = useQuery({
    queryKey: ["sources"],
    queryFn: async () => {
      const res = await fetch("/api/sources");
      return res.json() as Promise<{
        sources: { id: string; name: string; kind: string }[];
      }>;
    },
    staleTime: Infinity,
  });

  const totalResults = useMemo(
    () => data?.groups.reduce((n, g) => n + g.results.length, 0) ?? 0,
    [data],
  );

  return (
    <div className="px-5 pt-8 lg:px-10">
      {/* Search input */}
      <div className="relative mx-auto max-w-2xl">
        <span className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-mist">
          ⌕
        </span>
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search titles across the archives…"
          className="w-full rounded-2xl border border-veil/70 bg-palace/80 py-3.5 pr-12 pl-11 text-[15px] text-moon placeholder:text-mist/70 outline-none transition-colors focus:border-flame/60"
        />
        {query && (
          <button
            onClick={() => {
              setQuery("");
              inputRef.current?.focus();
            }}
            className="absolute top-1/2 right-4 -translate-y-1/2 text-mist hover:text-moon"
            aria-label="Clear search"
          >
            ✕
          </button>
        )}
      </div>

      {/* Source chips */}
      <div className="no-scrollbar mt-4 flex justify-center gap-2 overflow-x-auto pb-1">
        <Chip active={source === "all"} onClick={() => setSource("all")}>
          All sources
        </Chip>
        {sources.data?.sources.map((s) => (
          <Chip key={s.id} active={source === s.id} onClick={() => setSource(s.id)}>
            {s.name}
            <span className="ml-1 text-[9px] opacity-60">
              {KIND_LABEL[s.kind] ?? s.kind}
            </span>
          </Chip>
        ))}
      </div>

      {/* Results */}
      <div className="mt-8">
        {debounced === "" && (
          <EmptyState
            icon={<CompassIcon className="h-10 w-10" width={40} height={40} />}
            title="Search the archives"
            subtitle="Find manga, manhwa and light novels by title — results come from every registered source at once."
          />
        )}

        {debounced !== "" && (isLoading || isFetching) && (
          <CardSkeletonGrid count={12} />
        )}

        {debounced !== "" && !isFetching && totalResults === 0 && (
          <EmptyState
            title={`Nothing found for “${debounced}”`}
            subtitle="Check the spelling, or try a different source."
          />
        )}

        {data?.groups.map(
          (g) =>
            g.results.length > 0 && (
              <section key={g.source} className="mb-10">
                <div className="mb-3 flex items-center gap-2">
                  <h2 className="font-display text-base font-semibold">
                    {g.name}
                  </h2>
                  <span className="rounded-full bg-hall px-2 py-0.5 text-[10px] font-medium text-mist">
                    {KIND_LABEL[g.kind] ?? g.kind}
                  </span>
                  {g.error && (
                    <span className="text-[11px] text-ember/80">{g.error}</span>
                  )}
                </div>
                <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7">
                  {g.results.map((r) => (
                    <MangaCard
                      key={`${g.source}:${r.id}`}
                      source={g.source}
                      id={r.id}
                      title={r.title}
                      coverImage={r.coverImage}
                      badge={r.latestChapter}
                    />
                  ))}
                </div>
              </section>
            ),
        )}
      </div>
    </div>
  );
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "shrink-0 rounded-full border px-3.5 py-1.5 text-xs font-medium whitespace-nowrap transition-all",
        active
          ? "border-flame/60 bg-flame/15 text-flame"
          : "border-veil/60 bg-palace/50 text-mist hover:border-veil hover:text-moon",
      )}
    >
      {children}
    </button>
  );
}

function EmptyState({
  icon,
  title,
  subtitle,
}: {
  icon?: React.ReactNode;
  title: string;
  subtitle: string;
}) {
  return (
    <div className="mx-auto max-w-md py-16 text-center">
      {icon && <div className="mb-4 flex justify-center text-veil">{icon}</div>}
      <h3 className="font-display text-lg font-semibold text-moon/90">
        {title}
      </h3>
      <p className="mt-1.5 text-sm text-mist">{subtitle}</p>
    </div>
  );
}
