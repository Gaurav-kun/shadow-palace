import { getAdapter } from "@/sources/registry";
import { SourceError } from "@/sources/types";
import { cached, TTL_CHAPTERS } from "@/lib/cache";

/**
 * GET /api/title/[source]/[id] — details + full chapter list.
 *
 * Chapter lists are expensive to build (novelFull walks 81 pages at
 * ~1 req/s), so results are cached in-process for an hour.
 */
export async function GET(
  _request: Request,
  ctx: { params: Promise<{ source: string; id: string }> },
) {
  const { source, id } = await ctx.params;

  try {
    const adapter = getAdapter(source);
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
