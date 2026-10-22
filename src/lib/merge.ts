import type { SourceAdapter, SourceChapter } from "@/sources/types";

/**
 * Cross-source chapter aggregation.
 *
 * MangaDex alone has holes (dead scanlation groups drop middle chapters).
 * So for a given title we query every manga source that carries it and
 * merge chapters by chapter number — a chapter "exists" if ANY source
 * has it. Each merged chapter remembers which sources serve it so the
 * reader can fall back when the primary has no pages.
 */

export interface ChapterSourceRef {
  source: string;
  sourceName: string;
  chapterId: string;
  pagesCount?: number;
}

export interface MergedChapter {
  /** Numeric chapter key for ordering/merging (NaN-safe). */
  sortKey: number;
  number?: string;
  title?: string;
  publishedAt?: string;
  /** Sources that have this chapter, best first. */
  refs: ChapterSourceRef[];
  /** The source we'll read from by default. */
  primary: ChapterSourceRef;
}

export interface SourceMatch {
  adapter: SourceAdapter;
  mangaId: string;
  title: string;
  coverImage?: string;
}

/** Normalize a chapter number string to a sortable float. */
function num(n?: string): number {
  const v = parseFloat(n ?? "");
  return Number.isNaN(v) ? Number.NaN : v;
}

/** Loose title normalization for cross-source matching. */
export function normalizeTitle(t: string): string {
  return t
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Score how well a candidate title matches the target (0..1). */
export function titleScore(target: string, candidate: string): number {
  const a = new Set(normalizeTitle(target).split(" "));
  const b = new Set(normalizeTitle(candidate).split(" "));
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const w of a) if (b.has(w)) inter++;
  return inter / Math.max(a.size, b.size);
}

/**
 * Merge chapter lists from multiple sources. `primarySource`'s refs win
 * ties. Chapters are returned ascending by number.
 */
export function mergeChapters(
  lists: { source: string; sourceName: string; chapters: SourceChapter[] }[],
  primarySource: string,
): MergedChapter[] {
  const byKey = new Map<number | string, MergedChapter>();

  for (const list of lists) {
    for (const c of list.chapters) {
      const n = num(c.number);
      const key = Number.isNaN(n) ? `${list.source}:${c.id}` : n;

      const ref: ChapterSourceRef = {
        source: list.source,
        sourceName: list.sourceName,
        chapterId: c.id,
        pagesCount: c.pagesCount,
      };

      const existing = byKey.get(key);
      if (existing) {
        existing.refs.push(ref);
        // Prefer the primary source; else prefer one that knows its page count.
        const curBest = existing.primary;
        const betterPrimary =
          ref.source === primarySource && curBest.source !== primarySource;
        const betterPages =
          ref.source !== curBest.source &&
          curBest.source !== primarySource &&
          ref.source !== primarySource &&
          (ref.pagesCount ?? 0) > (curBest.pagesCount ?? 0);
        if (betterPrimary) existing.primary = ref;
        else if (betterPages) existing.primary = ref;

        // Fill in missing metadata from any list.
        existing.title = existing.title ?? c.title;
        existing.publishedAt = existing.publishedAt ?? c.publishedAt;
      } else {
        byKey.set(key, {
          sortKey: Number.isNaN(n) ? Number.POSITIVE_INFINITY : n,
          number: c.number,
          title: c.title,
          publishedAt: c.publishedAt,
          refs: [ref],
          primary: ref,
        });
      }
    }
  }

  return [...byKey.values()].sort((a, b) => {
    if (a.sortKey !== b.sortKey) return a.sortKey - b.sortKey;
    return (a.number ?? "").localeCompare(b.number ?? "");
  });
}

/** Total number of distinct sources serving a manga (for a coverage badge). */
export function sourceCoverage(matches: SourceMatch[]): number {
  return matches.length;
}
