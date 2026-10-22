import { listSources, getAdapter, PRIMARY_SOURCE } from "@/sources/registry";
import { SourceError } from "@/sources/types";

/**
 * GET /api/search?q=solo+leveling[&source=all|mangadex|...]
 *
 * Searches one source, or all sources in parallel when source=all.
 * Failing sources never break the response — their error is reported
 * per-group so the UI can show what's available.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q")?.trim();
  const source = searchParams.get("source") ?? "all";

  if (!q) {
    return Response.json({ groups: [] });
  }

  try {
    if (source !== "all") {
      const adapter = getAdapter(source);
      const results = await adapter.search(q);
      return Response.json({
        groups: [
          { source: adapter.id, name: adapter.name, kind: adapter.kind, results },
        ],
      });
    }

    const settled = await Promise.allSettled(
      listSources().map(async (adapter) => ({
        source: adapter.id,
        name: adapter.name,
        kind: adapter.kind,
        results: await adapter.search(q),
      })),
    );

    const groups = settled.map((s, i) => {
      const adapter = listSources()[i];
      if (s.status === "fulfilled") return s.value;
      return {
        source: adapter.id,
        name: adapter.name,
        kind: adapter.kind,
        results: [],
        error: s.reason instanceof SourceError ? s.reason.message : "Search failed",
      };
    });

    // Put the primary source's results first.
    groups.sort((a, b) =>
      a.source === PRIMARY_SOURCE ? -1 : b.source === PRIMARY_SOURCE ? 1 : 0,
    );

    return Response.json({ groups });
  } catch (err) {
    const status = err instanceof SourceError ? err.status : 500;
    return Response.json(
      { error: err instanceof Error ? err.message : "Search failed" },
      { status },
    );
  }
}
