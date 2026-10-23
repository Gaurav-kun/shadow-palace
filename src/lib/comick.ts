/**
 * Comick (api.comick.dev) enrichment — community ratings.
 *
 * Comick's public surface only serves /top and /v1.0/search without an
 * app session (everything else 403s), so instead of a full source
 * adapter we mine /v1.0/search for its rating stats: bayesian score,
 * rating counts and the full 1–10 score histogram. Used purely to
 * enrich title pages alongside AniList — failures always resolve null.
 */

const API = "https://api.comick.dev";

export interface ComickStats {
  /** Community score, 0–10 scale. */
  rating: number;
  /** How many ratings the score is based on. */
  ratingCount: number;
  /** Histogram of scores: key "1".."10" → number of ratings. */
  distribution: Record<string, number>;
}

interface ComickSearchItem {
  title?: string;
  rating?: string;
  bayesian_rating?: string;
  rating_count?: number;
  statistics?: Array<{
    score_count?: number;
    distribution?: Record<string, string | number>;
  }>;
}

function normalize(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/**
 * Find the series on Comick by title and return its rating stats.
 * Only an exact (normalized) title match counts — a wrong series'
 * score would be worse than none at all.
 */
export async function getComickStats(title: string): Promise<ComickStats | null> {
  try {
    const res = await fetch(
      `${API}/v1.0/search?q=${encodeURIComponent(title)}&limit=6`,
      {
        headers: { Accept: "application/json" },
        next: { revalidate: 21600 },
        signal: AbortSignal.timeout(5000),
      },
    );
    if (!res.ok) return null;

    const items = (await res.json()) as ComickSearchItem[];
    if (!Array.isArray(items) || items.length === 0) return null;

    const target = normalize(title);
    const hit =
      items.find((i) => normalize(i.title ?? "") === target) ??
      items.find(
        (i) =>
          target.length >= 6 &&
          (normalize(i.title ?? "").includes(target) ||
            target.includes(normalize(i.title ?? ""))),
      );
    if (!hit) return null;

    const stats = hit.statistics?.[0];
    const rating = Number(hit.bayesian_rating ?? hit.rating);
    const ratingCount = stats?.score_count ?? hit.rating_count;
    if (!Number.isFinite(rating) || !ratingCount) return null;

    const distribution: Record<string, number> = {};
    for (const [k, v] of Object.entries(stats?.distribution ?? {})) {
      const n = Number(v);
      if (Number.isFinite(n)) distribution[k] = n;
    }

    return { rating, ratingCount, distribution };
  } catch {
    return null;
  }
}
