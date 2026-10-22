import "server-only";
import type {
  SourceAdapter,
  SourceChapter,
  SourceManga,
  SourcePage,
  SourceSearchResult,
} from "./types";
import { SourceError, type SourceKind } from "./types";
import { pickLocalized } from "@/lib/utils";

/**
 * MangaDex — official public API (api.mangadex.org).
 *
 * The most reliable source: no scraping, real page images served
 * through the at-home server system, huge catalog including manhua,
 * manhwa and light novels.
 */

const API = "https://api.mangadex.org";
const COVERS = "https://uploads.mangadex.org";

/** Metadata is stable for hours; pages must never be cached. */
const META_REVALIDATE = 60 * 60 * 6; // 6h

type MdRating = "safe" | "suggestive" | "erotica" | "pornographic";
// Personal reader — include every rating so the real Berserk / Vagabond
// (rated erotica) aren't filtered out of search results.
const CONTENT_RATING = ["safe", "suggestive", "erotica", "pornographic"] as MdRating[];

interface MdRelationship {
  id: string;
  type: string;
  attributes?: Record<string, unknown>;
}

interface MdObject<T = Record<string, unknown>> {
  id: string;
  type: string;
  attributes: T;
  relationships?: MdRelationship[];
}

interface MdMangaAttrs {
  title: Record<string, string>;
  altTitles?: Record<string, string>[];
  description?: Record<string, string>;
  status?: string;
  year?: number | null;
  tags?: { attributes: { name: Record<string, string> } }[];
}

interface MdChapterAttrs {
  chapter: string | null;
  title: string | null;
  pagesCount: number;
  publishAt: string;
  translatedLanguage?: string;
}

async function mdFetch<T>(path: string, revalidate?: number): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API}${path}`, {
      headers: { Accept: "application/json" },
      ...(revalidate ? { next: { revalidate } } : { cache: "no-store" as const }),
    });
  } catch (err) {
    throw new SourceError(`MangaDex unreachable: ${err}`, "mangadex", 503);
  }
  if (!res.ok) {
    throw new SourceError(`MangaDex responded ${res.status}`, "mangadex", 502);
  }
  return res.json() as Promise<T>;
}

function coverUrl(mangaId: string, rels?: MdRelationship[]): string | undefined {
  const cover = rels?.find((r) => r.type === "cover_art");
  const fileName = cover?.attributes?.fileName as string | undefined;
  if (!fileName) return undefined;
  return `${COVERS}/covers/${mangaId}/${fileName}.512.jpg`;
}

function mangaTitle(attrs: MdMangaAttrs): string {
  const base = pickLocalized(attrs.title);
  if (base !== "Unknown") return base;
  const alt = attrs.altTitles?.find((t) => t.en)?.en;
  return alt ?? pickLocalized(attrs.altTitles?.[0] ?? {});
}

function mangaKind(attrs: MdMangaAttrs, demographics: string[]): SourceKind {
  const tags = (attrs.tags ?? [])
    .map((t) => pickLocalized(t.attributes.name).toLowerCase());
  if (tags.some((t) => t.includes("novel"))) return "novel";
  if (demographics.includes("manhwa")) return "manhwa";
  if (demographics.includes("manhua")) return "manhwa";
  return "manga";
}

export const mangadex: SourceAdapter = {
  id: "mangadex",
  name: "MangaDex",
  kind: "manga",
  description: "Huge community catalog — manga, manhwa, manhua & light novels",

  async search(query, limit = 24): Promise<SourceSearchResult[]> {
    const params = new URLSearchParams({ title: query, limit: String(limit) });
    params.append("order[relevance]", "desc");
    params.append("includes[]", "cover_art");
    for (const r of CONTENT_RATING) params.append("contentRating[]", r);

    const res = await mdFetch<{ data: MdObject<MdMangaAttrs>[] }>(
      `/manga?${params}`,
      META_REVALIDATE,
    );

    return res.data.map((m) => ({
      id: m.id,
      title: mangaTitle(m.attributes),
      coverImage: coverUrl(m.id, m.relationships),
      subtitle: undefined,
    }));
  },

  async getPopular(limit = 18): Promise<SourceSearchResult[]> {
    const params = new URLSearchParams({ limit: String(limit) });
    params.append("order[followedCount]", "desc");
    params.append("includes[]", "cover_art");
    for (const r of CONTENT_RATING) params.append("contentRating[]", r);

    const res = await mdFetch<{ data: MdObject<MdMangaAttrs>[] }>(
      `/manga?${params}`,
      META_REVALIDATE,
    );
    return res.data.map((m) => ({
      id: m.id,
      title: mangaTitle(m.attributes),
      coverImage: coverUrl(m.id, m.relationships),
    }));
  },

  async getLatest(limit = 18): Promise<SourceSearchResult[]> {
    const params = new URLSearchParams({ limit: String(limit) });
    params.append("order[latestUploadedChapter]", "desc");
    params.append("includes[]", "cover_art");
    for (const r of CONTENT_RATING) params.append("contentRating[]", r);

    const res = await mdFetch<{ data: MdObject<MdMangaAttrs>[] }>(
      `/manga?${params}`,
      META_REVALIDATE,
    );
    return res.data.map((m) => ({
      id: m.id,
      title: mangaTitle(m.attributes),
      coverImage: coverUrl(m.id, m.relationships),
    }));
  },

  async getManga(id): Promise<SourceManga> {
    const params = new URLSearchParams();
    params.append("includes[]", "cover_art");
    params.append("includes[]", "artist");
    params.append("includes[]", "author");
    for (const r of CONTENT_RATING) params.append("contentRating[]", r);

    const res = await mdFetch<{ data: MdObject<MdMangaAttrs> }>(
      `/manga/${id}?${params}`,
      META_REVALIDATE,
    );
    const m = res.data;
    const a = m.attributes;

    const authors = (m.relationships ?? [])
      .filter((r) => r.type === "artist" || r.type === "author")
      .map((r) => (r.attributes?.name as string) ?? "")
      .filter(Boolean);

    const genres = (a.tags ?? [])
      .map((t) => pickLocalized(t.attributes.name))
      .filter(Boolean);

    const demographics = (m as unknown as { publicationDemographic?: string | null })
      .publicationDemographic
      ? [String((m as unknown as { publicationDemographic: string }).publicationDemographic)]
      : [];

    return {
      id: m.id,
      title: mangaTitle(a),
      description: pickLocalized(a.description ?? {}),
      coverImage: coverUrl(m.id, m.relationships),
      genres,
      status: a.status,
      authors: [...new Set(authors)],
      year: a.year ?? undefined,
      kind: mangaKind(a, demographics),
    };
  },

  async getChapters(mangaId): Promise<SourceChapter[]> {
    const chapters: SourceChapter[] = [];
    const limit = 500;
    let offset = 0;
    let total = Number.MAX_SAFE_INTEGER;

    while (offset < total && offset < 5000) {
      const params = new URLSearchParams({
        limit: String(limit),
        offset: String(offset),
      });
      params.append("translatedLanguage[]", "en");
      params.append("order[chapter]", "asc");
      params.append("order[createdAt]", "asc");
      for (const r of CONTENT_RATING) params.append("contentRating[]", r);

      const res = await mdFetch<{
        data: MdObject<MdChapterAttrs>[];
        total: number;
      }>(`/manga/${mangaId}/feed?${params}`, META_REVALIDATE);

      total = res.total;
      for (const c of res.data) {
        chapters.push({
          id: c.id,
          number: c.attributes.chapter ?? undefined,
          title: c.attributes.title ?? undefined,
          publishedAt: c.attributes.publishAt,
          pagesCount: c.attributes.pagesCount || undefined,
        });
      }
      offset += limit;
    }

    return chapters;
  },

  async getPages(chapterId): Promise<SourcePage[]> {
    // NOTE: MangaDex at-home nodes can have PARTIAL caches (some files
    // 404) and the node is sticky per chapter, so rotating here doesn't
    // help. Instead the READER falls back to another source that has the
    // chapter (see the read route's source-fallback). Keep this simple.
    const res = await mdFetch<{
      baseUrl: string;
      chapter: { hash: string; data: string[] };
    }>(`/at-home/server/${chapterId}`);

    const { baseUrl, chapter } = res;
    return chapter.data.map((file) => ({
      url: `${baseUrl}/data/${chapter.hash}/${file}`,
    }));
  },
};
