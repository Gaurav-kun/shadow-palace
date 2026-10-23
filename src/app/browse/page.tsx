"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { MangaCard } from "@/components/media/MangaCard";
import { CardSkeletonGrid, Skeleton } from "@/components/ui/Skeleton";
import { cn } from "@/lib/utils";

interface BrowseResult {
  id: string;
  title: string;
  coverImage?: string;
  latestChapter?: string;
}

interface BrowsePageData {
  results: BrowseResult[];
  total: number;
  offset: number;
}

interface Tag {
  id: string;
  name: string;
  group: string;
}

const PAGE = 24;

const SORTS: { id: string; label: string }[] = [
  { id: "latest", label: "Latest update" },
  { id: "popular", label: "Popular" },
  { id: "rated", label: "Top rated" },
  { id: "newest", label: "Newest" },
];

const STATUSES: { id: string; label: string }[] = [
  { id: "", label: "Any status" },
  { id: "ongoing", label: "Ongoing" },
  { id: "completed", label: "Completed" },
  { id: "hiatus", label: "Hiatus" },
];

const ORIGINS: { id: string; label: string }[] = [
  { id: "", label: "All origins" },
  { id: "ja", label: "Manga" },
  { id: "ko", label: "Manhwa" },
  { id: "zh", label: "Manhua" },
];

const DEMOGRAPHICS: { id: string; label: string }[] = [
  { id: "", label: "Any audience" },
  { id: "shounen", label: "Shounen" },
  { id: "shoujo", label: "Shoujo" },
  { id: "seinen", label: "Seinen" },
  { id: "josei", label: "Josei" },
];

const GROUP_LABEL: Record<string, string> = {
  genre: "Genres",
  theme: "Themes",
  demographic: "Demographics",
  format: "Formats",
  content: "Content",
};

function Chip({
  active,
  onClick,
  children,
  removeable,
  onRemove,
}: {
  active?: boolean;
  onClick?: () => void;
  children: React.ReactNode;
  removeable?: boolean;
  onRemove?: () => void;
}) {
  return (
    <button
      onClick={removeable ? onRemove : onClick}
      className={cn(
        "flex shrink-0 items-center gap-1 rounded-full border px-3 py-1.5 text-xs font-medium whitespace-nowrap transition-all",
        active
          ? "border-flame/60 bg-flame/15 text-flame"
          : "border-veil/60 bg-palace/50 text-mist hover:border-veil hover:text-moon",
        removeable && "pr-2",
      )}
    >
      {children}
      {removeable && <span className="ml-0.5 text-[10px] opacity-70">✕</span>}
    </button>
  );
}

function BrowseInner() {
  const sp = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const sort = sp.get("sort") ?? "latest";
  const tagIds = useMemo(
    () => (sp.get("tags") ?? "").split(",").filter(Boolean),
    [sp],
  );
  const status = sp.get("status") ?? "";
  const lang = sp.get("lang") ?? "";
  const demo = sp.get("demo") ?? "";
  const q = sp.get("q") ?? "";

  const [panelOpen, setPanelOpen] = useState(false);
  const [tagFilter, setTagFilter] = useState("");
  const [qInput, setQInput] = useState(q);

  const applyParams = useCallback(
    (patch: Record<string, string | null>) => {
      const next = new URLSearchParams(sp.toString());
      for (const [k, v] of Object.entries(patch)) {
        if (v === null || v === "") next.delete(k);
        else next.set(k, v);
      }
      const qs = next.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [sp, router, pathname],
  );

  // Debounced title search → URL.
  useEffect(() => {
    const t = setTimeout(() => {
      const v = qInput.trim();
      if (v !== q) applyParams({ q: v || null });
    }, 350);
    return () => clearTimeout(t);
  }, [qInput, q, applyParams]);

  const tagsQ = useQuery({
    queryKey: ["browse-tags"],
    queryFn: async (): Promise<Tag[]> => {
      const res = await fetch("/api/tags");
      if (!res.ok) throw new Error("tags failed");
      return (await res.json()).tags ?? [];
    },
    staleTime: 6 * 60 * 60 * 1000,
    retry: 1,
  });

  const filterKey = useMemo(
    () => [sort, tagIds.join(","), status, lang, demo, q].join("|"),
    [sort, tagIds, status, lang, demo, q],
  );

  const bq = useInfiniteQuery({
    queryKey: ["browse", filterKey],
    initialPageParam: 0,
    queryFn: async ({ pageParam }): Promise<BrowsePageData> => {
      const p = new URLSearchParams({ limit: String(PAGE), offset: String(pageParam) });
      p.set("sort", sort);
      if (tagIds.length) p.set("tags", tagIds.join(","));
      if (status) p.set("status", status);
      if (lang) p.set("lang", lang);
      if (demo) p.set("demo", demo);
      if (q) p.set("q", q);
      const res = await fetch(`/api/browse?${p}`);
      if (!res.ok) throw new Error((await res.json()).error ?? "Browse failed");
      return res.json();
    },
    getNextPageParam: (last) =>
      last.offset + last.results.length < last.total
        ? last.offset + last.results.length
        : undefined,
    staleTime: 15 * 60 * 1000,
  });

  // Flattened + deduped (sort reshuffles can overlap page boundaries).
  const items = useMemo(() => {
    const seen = new Set<string>();
    const out: BrowseResult[] = [];
    for (const page of bq.data?.pages ?? []) {
      for (const r of page.results) {
        if (!seen.has(r.id)) {
          seen.add(r.id);
          out.push(r);
        }
      }
    }
    return out;
  }, [bq.data]);

  const total = bq.data?.pages[0]?.total ?? 0;

  // Infinite scroll sentinel (with a manual button fallback below).
  const sentinelRef = useRef<HTMLDivElement>(null);
  const fetchNext = bq.fetchNextPage;
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || !bq.hasNextPage || bq.isFetchingNextPage) return;
    const ob = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) void fetchNext();
      },
      { rootMargin: "800px 0px" },
    );
    ob.observe(el);
    return () => ob.disconnect();
  }, [bq.hasNextPage, bq.isFetchingNextPage, fetchNext]);

  const toggleTag = (id: string) => {
    const next = tagIds.includes(id)
      ? tagIds.filter((t) => t !== id)
      : [...tagIds, id];
    applyParams({ tags: next.length ? next.join(",") : null });
  };

  const clearAll = () =>
    applyParams({ tags: null, status: null, lang: null, demo: null, q: null, sort: null });

  const activeFilterCount =
    tagIds.length + (status ? 1 : 0) + (lang ? 1 : 0) + (demo ? 1 : 0);

  // Grouped, text-filtered tag sections.
  const tagSections = useMemo(() => {
    const f = tagFilter.trim().toLowerCase();
    const all = tagsQ.data ?? [];
    const filtered = f ? all.filter((t) => t.name.toLowerCase().includes(f)) : all;
    const groups = new Map<string, Tag[]>();
    for (const t of filtered) {
      const arr = groups.get(t.group) ?? [];
      arr.push(t);
      groups.set(t.group, arr);
    }
    const order = ["genre", "theme", "demographic", "format", "content"];
    return [...groups.entries()].sort(
      (a, b) => order.indexOf(a[0]) - order.indexOf(b[0]),
    );
  }, [tagsQ.data, tagFilter]);

  const hasAnyFilter =
    activeFilterCount > 0 || sort !== "latest" || q !== "";

  return (
    <div className="px-5 pt-6 pb-16 lg:px-10">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold sm:text-3xl">Browse</h1>
          <p className="mt-1 text-xs text-mist">
            {bq.isPending
              ? "Querying the archives…"
              : total > 0
                ? `${items.length > 0 ? `Showing ${items.length} of ` : ""}${total.toLocaleString()} titles`
                : "Every corner of the catalog"}
          </p>
        </div>

        {/* Title search */}
        <div className="relative w-full sm:w-72">
          <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-sm text-mist">
            ⌕
          </span>
          <input
            value={qInput}
            onChange={(e) => setQInput(e.target.value)}
            placeholder="Search within catalog…"
            className="w-full rounded-xl border border-veil/60 bg-palace/70 py-2.5 pr-8 pl-9 text-sm text-moon placeholder:text-mist/60 outline-none transition-colors focus:border-flame/60"
          />
          {qInput && (
            <button
              onClick={() => setQInput("")}
              className="absolute top-1/2 right-3 -translate-y-1/2 text-xs text-mist hover:text-moon"
              aria-label="Clear"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {/* Sort + filters toolbar */}
      <div className="no-scrollbar mt-4 flex gap-2 overflow-x-auto pb-1">
        {SORTS.map((s) => (
          <Chip key={s.id} active={sort === s.id} onClick={() => applyParams({ sort: s.id === "latest" ? null : s.id })}>
            {s.label}
          </Chip>
        ))}
        <Chip active={panelOpen} onClick={() => setPanelOpen((v) => !v)}>
          ⚗ Filters{activeFilterCount > 0 ? ` (${activeFilterCount})` : ""}
        </Chip>
        {hasAnyFilter && <Chip onClick={clearAll}>Clear all</Chip>}
      </div>

      {/* Active filter chips */}
      {activeFilterCount > 0 && (
        <div className="no-scrollbar mt-2 flex gap-2 overflow-x-auto pb-1">
          {status && (
            <Chip removeable onRemove={() => applyParams({ status: null })}>
              {STATUSES.find((s) => s.id === status)?.label ?? status}
            </Chip>
          )}
          {lang && (
            <Chip removeable onRemove={() => applyParams({ lang: null })}>
              {ORIGINS.find((s) => s.id === lang)?.label ?? lang}
            </Chip>
          )}
          {demo && (
            <Chip removeable onRemove={() => applyParams({ demo: null })}>
              {DEMOGRAPHICS.find((s) => s.id === demo)?.label ?? demo}
            </Chip>
          )}
          {tagIds.map((id) => {
            const t = (tagsQ.data ?? []).find((x) => x.id === id);
            return (
              <Chip key={id} removeable onRemove={() => toggleTag(id)}>
                {t?.name ?? "Tag"}
              </Chip>
            );
          })}
        </div>
      )}

      {/* Filter panel */}
      {panelOpen && (
        <div className="mt-3 rounded-2xl border border-veil/50 bg-palace/40 p-4">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <FilterGroup label="Status">
              {STATUSES.map((s) => (
                <Chip key={s.id} active={status === s.id} onClick={() => applyParams({ status: s.id || null })}>
                  {s.label}
                </Chip>
              ))}
            </FilterGroup>
            <FilterGroup label="Origin">
              {ORIGINS.map((s) => (
                <Chip key={s.id} active={lang === s.id} onClick={() => applyParams({ lang: s.id || null })}>
                  {s.label}
                </Chip>
              ))}
            </FilterGroup>
            <FilterGroup label="Audience">
              {DEMOGRAPHICS.map((s) => (
                <Chip key={s.id} active={demo === s.id} onClick={() => applyParams({ demo: s.id || null })}>
                  {s.label}
                </Chip>
              ))}
            </FilterGroup>
            <FilterGroup label="Sort order">
              {SORTS.map((s) => (
                <Chip key={s.id} active={sort === s.id} onClick={() => applyParams({ sort: s.id === "latest" ? null : s.id })}>
                  {s.label}
                </Chip>
              ))}
            </FilterGroup>
          </div>

          {/* Tags */}
          <div className="mt-5">
            <div className="mb-2 flex items-center justify-between gap-3">
              <p className="text-[10.5px] font-semibold tracking-[0.2em] text-mist uppercase">
                Categories & tags
              </p>
              <input
                value={tagFilter}
                onChange={(e) => setTagFilter(e.target.value)}
                placeholder="Filter tags…"
                className="w-40 rounded-lg border border-veil/60 bg-palace/60 px-2.5 py-1.5 text-xs text-moon placeholder:text-mist/60 outline-none focus:border-flame/50"
              />
            </div>

            {tagsQ.isPending && (
              <div className="flex flex-wrap gap-2">
                {Array.from({ length: 10 }).map((_, i) => (
                  <Skeleton key={i} className="h-7 w-20 rounded-full" />
                ))}
              </div>
            )}
            {tagsQ.isError && (
              <p className="text-xs text-ember/80">
                Tags couldn’t be loaded — filters still work without them.
              </p>
            )}

            <div className="max-h-72 space-y-3 overflow-y-auto pr-1">
              {tagSections.map(([group, list]) => (
                <div key={group}>
                  <p className="mb-1.5 text-[11px] font-medium text-flame/80">
                    {GROUP_LABEL[group] ?? group}
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {list.map((t) => (
                      <Chip
                        key={t.id}
                        active={tagIds.includes(t.id)}
                        onClick={() => toggleTag(t.id)}
                      >
                        {t.name}
                      </Chip>
                    ))}
                  </div>
                </div>
              ))}
              {tagSections.length === 0 && tagsQ.data && (
                <p className="text-xs text-mist">No tags match “{tagFilter}”.</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Results */}
      <div className="mt-6">
        {bq.isPending && <CardSkeletonGrid count={12} />}

        {bq.isError && !bq.isPending && (
          <div className="py-14 text-center">
            <p className="text-sm text-mist">
              {(bq.error as Error)?.message ?? "The archives are unreachable."}
            </p>
            <button
              onClick={() => void bq.refetch()}
              className="mt-4 rounded-xl bg-flame/15 px-5 py-2.5 text-sm font-medium text-flame ring-1 ring-flame/40 hover:bg-flame/25"
            >
              Try again
            </button>
          </div>
        )}

        {!bq.isPending && !bq.isError && items.length === 0 && (
          <div className="py-16 text-center">
            <h3 className="font-display text-lg font-semibold">Nothing matches</h3>
            <p className="mt-1.5 text-sm text-mist">
              {q
                ? `No titles found for “${q}” with these filters.`
                : "Try removing a tag or widening the filters."}
            </p>
            {hasAnyFilter && (
              <button
                onClick={clearAll}
                className="mt-4 rounded-xl border border-veil/70 px-5 py-2.5 text-sm text-moon/90 hover:border-flame/50 hover:text-flame"
              >
                Clear all filters
              </button>
            )}
          </div>
        )}

        {items.length > 0 && (
          <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7">
            {items.map((r) => (
              <MangaCard
                key={r.id}
                source="mangadex"
                id={r.id}
                title={r.title}
                coverImage={r.coverImage}
                badge={r.latestChapter}
              />
            ))}
          </div>
        )}

        {/* Load-more zone */}
        {bq.hasNextPage && (
          <div className="mt-6 flex flex-col items-center gap-3">
            <button
              onClick={() => void bq.fetchNextPage()}
              disabled={bq.isFetchingNextPage}
              className="rounded-xl border border-veil/60 bg-palace/60 px-6 py-2.5 text-sm text-mist transition-colors hover:border-flame/40 hover:text-flame disabled:opacity-50"
            >
              {bq.isFetchingNextPage ? "Summoning…" : "Load more"}
            </button>
            <div ref={sentinelRef} className="h-1 w-full" aria-hidden />
          </div>
        )}

        {!bq.hasNextPage && items.length > 0 && (
          <p className="mt-8 text-center text-xs text-mist/70">
            That’s all {total.toLocaleString()} titles — the archives end here.
          </p>
        )}
      </div>
    </div>
  );
}

function FilterGroup({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <p className="mb-1.5 text-[10.5px] font-semibold tracking-[0.18em] text-mist uppercase">
        {label}
      </p>
      <div className="flex flex-wrap gap-1.5">{children}</div>
    </div>
  );
}

export default function BrowsePage() {
  return (
    <Suspense
      fallback={
        <div className="px-5 pt-6 lg:px-10">
          <CardSkeletonGrid count={12} />
        </div>
      }
    >
      <BrowseInner />
    </Suspense>
  );
}
