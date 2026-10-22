import { getAdapter, PRIMARY_SOURCE } from "@/sources/registry";
import { SourceError } from "@/sources/types";

/**
 * GET /api/shelf?type=popular|latest&limit=18
 *
 * Home-screen shelves from the primary source. Cached briefly at the
 * edge so the home page paints instantly with client-side fetch.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const type = searchParams.get("type") === "latest" ? "latest" : "popular";
  const limit = Math.min(Number(searchParams.get("limit")) || 18, 30);

  try {
    const adapter = getAdapter(PRIMARY_SOURCE);
    const results =
      type === "latest"
        ? (await adapter.getLatest?.(limit)) ?? []
        : (await adapter.getPopular?.(limit)) ?? [];

    return Response.json(
      { results },
      {
        headers: {
          "Cache-Control": "public, s-maxage=1800, stale-while-revalidate=3600",
        },
      },
    );
  } catch (err) {
    const status = err instanceof SourceError ? err.status : 500;
    return Response.json(
      { error: err instanceof Error ? err.message : "Failed", results: [] },
      { status },
    );
  }
}
