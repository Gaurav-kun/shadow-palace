import { getAdapter, PRIMARY_SOURCE } from "@/sources/registry";
import { SourceError, type BrowseQuery } from "@/sources/types";
import { cached, TTL_CHAPTERS } from "@/lib/cache";

/**
 * GET /api/browse?sort=&tags=&demo=&lang=&status=&q=&limit=&offset=
 *
 * Filtered, sorted, paged catalog for the browse page. Whitelists
 * every enum-style param so MangaDex never sees an invalid value
 * (it 400s instead of ignoring unknowns), and caches each unique
 * query in-process for an hour.
 */
const SORTS = new Set(["latest", "popular", "rated", "newest"]);
const DEMOGRAPHICS = new Set(["shounen", "shoujo", "seinen", "josei"]);
const LANGUAGES = new Set(["ja", "ko", "zh", "zh-hk", "en"]);
const STATUSES = new Set(["ongoing", "completed", "hiatus", "cancelled"]);

export async function GET(request: Request) {
  const sp = new URL(request.url).searchParams;

  const sort = sp.get("sort") ?? "latest";
  const query: BrowseQuery = {
    sort: SORTS.has(sort) ? (sort as NonNullable<BrowseQuery["sort"]>) : "latest",
    tags: (sp.get("tags") ?? "")
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean)
      .slice(0, 10),
    demographic: DEMOGRAPHICS.has(sp.get("demo") ?? "")
      ? sp.get("demo")!
      : undefined,
    language: LANGUAGES.has(sp.get("lang") ?? "") ? sp.get("lang")! : undefined,
    status: STATUSES.has(sp.get("status") ?? "") ? sp.get("status")! : undefined,
    q: sp.get("q")?.trim() || undefined,
    limit: Math.min(Math.max(Number(sp.get("limit")) || 24, 1), 48),
    offset: Math.max(Number(sp.get("offset")) || 0, 0),
  };

  try {
    const adapter = getAdapter(PRIMARY_SOURCE);
    if (!adapter.browse) {
      throw new SourceError(
        "Browsing isn’t supported by the primary source",
        PRIMARY_SOURCE,
        404,
      );
    }
    const page = await cached(
      `browse:${JSON.stringify(query)}`,
      TTL_CHAPTERS,
      () => adapter.browse!(query),
    );
    return Response.json(
      { ...page, offset: query.offset },
      {
        headers: {
          "Cache-Control": "public, s-maxage=900, stale-while-revalidate=3600",
        },
      },
    );
  } catch (err) {
    const status = err instanceof SourceError ? err.status : 500;
    return Response.json(
      {
        error: err instanceof Error ? err.message : "Browse failed",
        results: [],
        total: 0,
        offset: query.offset,
      },
      { status },
    );
  }
}
