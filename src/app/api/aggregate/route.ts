import { getAdapter, listSources } from "@/sources/registry";
import type { SourceAdapter, SourceChapter } from "@/sources/types";
import { SourceError } from "@/sources/types";
import { mergeChapters, titleScore, type MergedChapter } from "@/lib/merge";
import { cached, TTL_CHAPTERS } from "@/lib/cache";

/**
 * GET /api/aggregate?source=mangadex&id=<mangaId>
 *
 * Given the source you're viewing a title on, find that same title on
 * every OTHER manga source and merge all their chapter lists by chapter
 * number — so gaps in one source (e.g. MangaDex missing middle
 * chapters) are filled by another. Resilient: a slow or failing source
 * is skipped, never blocks.
 */

interface Match {
  source: string;
  sourceName: string;
  mangaId: string;
  title: string;
  coverImage?: string;
}

/** Race a promise against a timeout so one source can't hang us. */
function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error("timeout")), ms),
    ),
  ]);
}

const MATCH_THRESHOLD = 0.5;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const source = searchParams.get("source");
  const id = searchParams.get("id");
  if (!source || !id) {
    return Response.json({ error: "source and id required" }, { status: 400 });
  }

  let primary: SourceAdapter;
  let title: string;
  try {
    primary = getAdapter(source);
    title = (await primary.getManga(id)).title;
  } catch (err) {
    const status = err instanceof SourceError ? err.status : 500;
    return Response.json(
      { error: err instanceof Error ? err.message : "Unknown title" },
      { status },
    );
  }

  // The cross-source fan-out is expensive (search + chapter lists from
  // every source) — cache the merged result for an hour.
  const payload = await cached(
    `agg:${source}:${id}`,
    TTL_CHAPTERS,
    async () => {
      // Primary chapters + every other manga source's, in parallel.
      const others = listSources().filter(
        (a) => a.id !== source && a.kind !== "novel",
      );

      const [primaryChapters, settled] = await Promise.all([
        primary.getChapters(id).catch(() => [] as SourceChapter[]),
        Promise.allSettled(
          others.map(async (adapter) => {
            const results = await withTimeout(adapter.search(title, 6), 8000);
            const best = results
              .map((r) => ({ r, score: titleScore(title, r.title) }))
              .sort((a, b) => b.score - a.score)[0];
            if (!best || best.score < MATCH_THRESHOLD) throw new Error("no match");

            const chapters = await withTimeout(adapter.getChapters(best.r.id), 10000);
            if (!chapters.length) throw new Error("no chapters");

            return {
              match: {
                source: adapter.id,
                sourceName: adapter.name,
                mangaId: best.r.id,
                title: best.r.title,
                coverImage: best.r.coverImage,
              } satisfies Match,
              chapters,
            };
          }),
        ),
      ]);

      const matches: Match[] = [];
      const lists = [
        { source: primary.id, sourceName: primary.name, chapters: primaryChapters },
      ];

      for (const s of settled) {
        if (s.status !== "fulfilled") continue;
        matches.push(s.value.match);
        lists.push({
          source: s.value.match.source,
          sourceName: s.value.match.sourceName,
          chapters: s.value.chapters,
        });
      }

      const chapters: MergedChapter[] = mergeChapters(lists, primary.id);
      return { primary: { source: primary.id, id, title }, matches, chapters };
    },
  );

  return Response.json(payload, {
    headers: {
      "Cache-Control": "public, s-maxage=900, stale-while-revalidate=3600",
    },
  });
}
