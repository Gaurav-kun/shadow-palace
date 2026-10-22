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
