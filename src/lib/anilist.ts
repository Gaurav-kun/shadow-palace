/**
 * AniList GraphQL client (public, no auth).
 *
 * Used purely for metadata enrichment: does this manga have an anime
 * adaptation, is it airing / finished / upcoming, when does the next
 * episode drop, which season did it air in. AniList timestamps are in
 * SECONDS — we normalize to epoch ms.
 */

const ENDPOINT = "https://graphql.anilist.co";

export type AniStatus =
  | "RELEASING"
  | "FINISHED"
  | "NOT_YET_RELEASED"
  | "CANCELLED"
  | "HIATUS";

export interface AnimeAdaptation {
  id: number;
  title: string;
  format?: string;
  status: AniStatus;
  episodes?: number;
  season?: string;
  seasonYear?: number;
  nextEpisode?: number;
  /** Epoch ms of the next airing episode, when known. */
  nextAiringAt?: number;
  score?: number;
  popularity?: number;
}

export interface AiringInfo {
  /** Best-match manga id on AniList (for linking). */
  mangaId: number;
  mangaTitle: string;
  /** Anime adaptations of this manga, airing/soon first. */
  anime: AnimeAdaptation[];
}

const ADAPTATION_QUERY = /* GraphQL */ `
  query ($search: String) {
    Media(search: $search, type: MANGA) {
      id
      title { romaji english native }
      relations {
        nodes {
          id
          type
          format
          status
          episodes
          season
          seasonYear
          averageScore
          popularity
          title { romaji english native }
          nextAiringEpisode { airingAt episode }
        }
      }
    }
  }
`;

interface GqlMedia {
  id: number;
  title: { romaji?: string; english?: string; native?: string };
  relations?: {
    nodes?: Array<{
      id: number;
      type: string;
      format?: string;
      status?: AniStatus;
      episodes?: number | null;
      season?: string | null;
      seasonYear?: number | null;
      averageScore?: number | null;
      popularity?: number | null;
      title: { romaji?: string; english?: string; native?: string };
      nextAiringEpisode?: { airingAt: number; episode: number } | null;
    }>;
  };
}

function pickTitle(t: { romaji?: string; english?: string; native?: string }) {
  return t.english ?? t.romaji ?? t.native ?? "Unknown";
}

/* ── Seasonal chart (AniChart-style) ────────────────────────────── */

export type Season = "WINTER" | "SPRING" | "SUMMER" | "FALL";

export interface SeasonEntry {
  id: number;
  title: string;
  format?: string;
  status: AniStatus;
  episodes?: number;
  season?: string;
  seasonYear?: number;
  score?: number;
  popularity?: number;
  genres: string[];
  coverImage?: string;
  bannerImage?: string;
  description?: string;
  /** Epoch ms of the next airing episode, when known. */
  nextAiringAt?: number;
  nextEpisode?: number;
  /** Epoch ms of the premiere date. */
  startsAt?: number;
}

/** Which season is "now" (Northern-Hemisphere anime seasons). */
export function currentSeason(d = new Date()): { season: Season; year: number } {
  const m = d.getMonth(); // 0=Jan
  const season: Season =
    m === 11 || m <= 1 ? "WINTER" : m <= 4 ? "SPRING" : m <= 7 ? "SUMMER" : "FALL";
  // Winter straddles years: Dec belongs to the *upcoming* Winter year.
  const year = season === "WINTER" && m === 11 ? d.getFullYear() + 1 : d.getFullYear();
  return { season, year };
}

const SEASON_QUERY = /* GraphQL */ `
  query ($season: MediaSeason, $year: Int) {
    Page(page: 1, perPage: 50) {
      media(
        season: $season
        seasonYear: $year
        type: ANIME
        sort: POPULARITY_DESC
      ) {
        id
        format
        status
        episodes
        season
        seasonYear
        averageScore
        popularity
        genres
        description(asHtml: false)
        coverImage { extraLarge }
        bannerImage
        title { romaji english native }
        startDate { year month day }
        nextAiringEpisode { airingAt episode }
      }
    }
  }
`;

interface GqlSeasonMedia {
  id: number;
  format?: string | null;
  status?: AniStatus | null;
  episodes?: number | null;
  season?: string | null;
  seasonYear?: number | null;
  averageScore?: number | null;
  popularity?: number | null;
  genres?: string[] | null;
  description?: string | null;
  coverImage?: { extraLarge?: string | null } | null;
  bannerImage?: string | null;
  title: { romaji?: string; english?: string; native?: string };
  startDate?: { year?: number | null; month?: number | null; day?: number | null } | null;
  nextAiringEpisode?: { airingAt: number; episode: number } | null;
}

/**
 * The seasonal chart: the 50 most popular anime of a given season.
 * AniList timestamps are seconds — normalized to ms here.
 */
export async function getSeasonChart(
  season: Season,
  year: number,
): Promise<SeasonEntry[]> {
  let data: { Page: { media: GqlSeasonMedia[] | null } };
  try {
    data = await gql<{ Page: { media: GqlSeasonMedia[] | null } }>(SEASON_QUERY, {
      season,
      year,
    });
  } catch {
    return [];
  }

  return (data.Page.media ?? []).map((m) => ({
    id: m.id,
    title: pickTitle(m.title),
    format: m.format ?? undefined,
    status: m.status ?? "FINISHED",
    episodes: m.episodes ?? undefined,
    season: m.season ?? undefined,
    seasonYear: m.seasonYear ?? undefined,
    score: m.averageScore ?? undefined,
    popularity: m.popularity ?? undefined,
    genres: m.genres ?? [],
    coverImage: m.coverImage?.extraLarge ?? undefined,
    bannerImage: m.bannerImage ?? undefined,
    description: m.description ?? undefined,
    nextAiringAt: m.nextAiringEpisode ? m.nextAiringEpisode.airingAt * 1000 : undefined,
    nextEpisode: m.nextAiringEpisode?.episode,
    startsAt:
      m.startDate?.year && m.startDate?.month && m.startDate?.day
        ? new Date(m.startDate.year, m.startDate.month - 1, m.startDate.day).getTime()
        : undefined,
  }));
}

/** Sort airing/soon-first, then by popularity. */
const STATUS_RANK: Record<AniStatus, number> = {
  RELEASING: 0,
  NOT_YET_RELEASED: 1,
  HIATUS: 2,
  FINISHED: 3,
  CANCELLED: 4,
};

async function gql<T>(query: string, variables: Record<string, unknown>): Promise<T> {
  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ query, variables }),
    // AniList allows caching; keep responses fresh-ish.
    next: { revalidate: 21600 },
  });
  if (!res.ok) throw new Error(`AniList responded ${res.status}`);
  const json = (await res.json()) as { data?: T; errors?: { message: string }[] };
  if (json.errors?.length) throw new Error(json.errors[0].message);
  if (!json.data) throw new Error("AniList returned no data");
  return json.data;
}

/**
 * Find a manga on AniList by title and return its anime adaptations
 * with airing/next-episode info. Returns null if nothing matches.
 */
export async function getAiringInfo(title: string): Promise<AiringInfo | null> {
  let data: { Media: GqlMedia | null };
  try {
    data = await gql<{ Media: GqlMedia | null }>(ADAPTATION_QUERY, {
      search: title,
    });
  } catch {
    return null;
  }

  const media = data.Media;
  if (!media) return null;

  const anime: AnimeAdaptation[] = (media.relations?.nodes ?? [])
    .filter((n) => n.type === "ANIME")
    .map((n) => ({
      id: n.id,
      title: pickTitle(n.title),
      format: n.format ?? undefined,
      status: n.status ?? "FINISHED",
      episodes: n.episodes ?? undefined,
      season: n.season ?? undefined,
      seasonYear: n.seasonYear ?? undefined,
      nextEpisode: n.nextAiringEpisode?.episode,
      nextAiringAt: n.nextAiringEpisode
        ? n.nextAiringEpisode.airingAt * 1000
        : undefined,
      score: n.averageScore ?? undefined,
      popularity: n.popularity ?? undefined,
    }))
    .sort(
      (a, b) =>
        STATUS_RANK[a.status] - STATUS_RANK[b.status] ||
        (b.popularity ?? 0) - (a.popularity ?? 0),
    );

  return { mangaId: media.id, mangaTitle: pickTitle(media.title), anime };
}
