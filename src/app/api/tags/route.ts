import { getAdapter, PRIMARY_SOURCE } from "@/sources/registry";
import { SourceError } from "@/sources/types";
import { cached, TTL_CHAPTERS } from "@/lib/cache";

/**
 * GET /api/tags — filter tag/category list for the browse page,
 * from the primary source's catalog (MangaDex: genre/theme/…).
 * Cached in-process (6h) + at the edge (6h).
 */
export async function GET() {
  try {
    const adapter = getAdapter(PRIMARY_SOURCE);
    if (!adapter.browseTags) {
      throw new SourceError(
        "The primary source doesn’t expose browse tags",
        PRIMARY_SOURCE,
        404,
      );
    }
    const tags = await cached(
      `tags:${PRIMARY_SOURCE}`,
      TTL_CHAPTERS,
      () => adapter.browseTags!(),
    );
    return Response.json(
      { tags },
      {
        headers: {
          "Cache-Control": "public, s-maxage=21600, stale-while-revalidate=43200",
        },
      },
    );
  } catch (err) {
    const status = err instanceof SourceError ? err.status : 500;
    return Response.json(
      { error: err instanceof Error ? err.message : "Failed to load tags", tags: [] },
      { status },
    );
  }
}
