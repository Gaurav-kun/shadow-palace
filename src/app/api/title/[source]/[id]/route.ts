import { getAdapter } from "@/sources/registry";
import { SourceError } from "@/sources/types";
import { cached, TTL_CHAPTERS } from "@/lib/cache";
import { decodeParam } from "@/lib/utils";

/**
 * GET /api/title/[source]/[id]?lite=1
 *
 * lite=1 returns ONLY the metadata (`{ manga }`) — one fast getManga
 * call. The reader uses this to open immediately instead of waiting out
 * the full chapter walk (novelFull: 81 pages @ ~1 req/s ≈ 80s cold),
 * which loads in the background via the default (non-lite) response.
 *
 * Chapter lists are expensive to build, so full results are cached
 * in-process for an hour.
 */
export async function GET(
  request: Request,
  ctx: { params: Promise<{ source: string; id: string }> },
) {
  const { source, id: rawId } = await ctx.params;
  const id = decodeParam(rawId);

  try {
    const adapter = getAdapter(source);

    const lite = new URL(request.url).searchParams.get("lite") === "1";
    if (lite) {
      const manga = await cached(
        `title-lite:${source}:${id}`,
        TTL_CHAPTERS,
        () => adapter.getManga(id),
      );
      return Response.json({ manga });
    }

    const { manga, chapters } = await cached(
      `title:${source}:${id}`,
      TTL_CHAPTERS,
      async () => {
        const [m, c] = await Promise.all([
          adapter.getManga(id),
          adapter.getChapters(id),
        ]);
        return { manga: m, chapters: c };
      },
    );
    return Response.json({ manga, chapters });
  } catch (err) {
    const status = err instanceof SourceError ? err.status : 500;
    return Response.json(
      { error: err instanceof Error ? err.message : "Failed to load title" },
      { status },
    );
  }
}
