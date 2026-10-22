import { cached } from "@/lib/cache";
import {
  currentSeason,
  getSeasonChart,
  type Season,
} from "@/lib/anilist";

/**
 * GET /api/chart?season=WINTER&year=2026
 *
 * Seasonal anime chart from AniList (AniChart-style). Defaults to the
 * current season. Cached for 6h — seasons don't change fast.
 */

const SEASONS: Season[] = ["WINTER", "SPRING", "SUMMER", "FALL"];
const TTL_CHART = 6 * 60 * 60 * 1000;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const now = currentSeason();

  const seasonParam = (searchParams.get("season") ?? "").toUpperCase();
  const season = (SEASONS.includes(seasonParam as Season)
    ? seasonParam
    : now.season) as Season;

  const yearParam = Number(searchParams.get("year"));
  const year =
    Number.isFinite(yearParam) && yearParam >= 1990 && yearParam <= 2100
      ? yearParam
      : now.year;

  try {
    const entries = await cached(
      `chart:${season}:${year}`,
      TTL_CHART,
      () => getSeasonChart(season, year),
    );
    return Response.json(
      { season, year, entries },
      { headers: { "Cache-Control": "public, max-age=1800" } },
    );
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "Chart failed" },
      { status: 502 },
    );
  }
}
