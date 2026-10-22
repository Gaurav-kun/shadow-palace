import "server-only";
import type {
  SourceAdapter,
  SourceChapter,
  SourceManga,
  SourcePage,
  SourceSearchResult,
} from "./types";
import { SourceError } from "./types";

/**
 * Toonkotsu (https://toonkotsu.com) — manga/manhwa/manhua reader.
 *
 * The site is a SvelteKit SPA, but it exposes the same JSON APIs its own UI
 * uses, so this adapter does not scrape HTML at all:
 *
 *   GET /cdn/v1/browse?q=<query>      advanced search (relevance-sorted)
 *   GET /cdn/v1/series/<code>         series details + full chapter list
 *   GET /cdn/v1/latest                recently updated chapters
 *   GET /api/v1/rankings?metric=views top / most-opened titles
 *   GET /api/manga/chapter/<id>       reader page list (robots.txt explicitly
 *                                     allows this path: "Allow: /api/manga/chapter/")
 *
 * The "/cdn" prefix is the catalogue API base (confusingly shared with the
 * image CDN paths like /cdn/c/...); it was derived from the site's own client
 * bundle (chunks/CWXtfXTH.js: `const g="/cdn"`) and verified live.
 *
 * Id formats (documented for the app layer):
 *   - manga id    = the 6-character series "code" used in title URLs, e.g.
 *                   "bm0ssx" from /title/bm0ssx-jujutsu-kaisen. The APIs
 *                   resolve numeric ids to this code, so it is the canonical key.
 *   - chapter id  = the numeric chapter id as a decimal string, e.g. "4581997"
 *                   from /title/bm0ssx-jujutsu-kaisen/4581997-chapter-271.
 *
 * Caveats found while verifying live (2026-10):
 *   - Cloudflare fronts the site; plain non-browser clients can get a 403
 *     challenge on some paths. We send a browser User-Agent, and the /cdn/v1
 *     catalogue API answered without challenge during testing.
 *   - /api/manga/chapter/* enforces an anonymous "chapter allowance" and can
 *     answer 429 (the official reader shows "your chapter allowance has been
 *     reached" in that case). getPages maps 429 to a clear SourceError.
 *   - Page objects can carry AES-CTR crypto fields (`k` key, `n` nonce,
 *     `t` mime) — the official reader downloads the bytes and decrypts them in
 *     the browser. The SourcePage contract only carries hotlinkable URLs, so
 *     for those chapters the returned `src` URLs point at encrypted bytes and
 *     the app may fail to render them. This affects mainly "Official" sources;
 *     fan-scan chapters are typically plain images.
 */

const BASE = "https://toonkotsu.com";

/** Catalogue API (search / series / latest) — also the image CDN origin. */
const CATALOGUE = `${BASE}/cdn/v1`;
/** Reader metrics API (rankings). */
const METRICS = `${BASE}/api/v1`;
/** Reader API (chapter page lists) — allowed by robots.txt. */
const READER = `${BASE}/api/manga/chapter`;

/** Browser UA: Cloudflare challenges default/library user agents. */
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

/** Metadata is stable for hours; pages must never be cached. */
const META_REVALIDATE = 60 * 60 * 6; // 6h

/** Cover sizes the CDN serves: /cdn/c/<hid>/<hash>/(220|460|720).webp */
function bigCover(cover?: string | null): string | undefined {
  if (!cover) return undefined;
  return cover.replace(/\/(220|460)\.webp$/, "/720.webp");
}

/** API image paths are site-relative ("/cdn/c/..."); make them absolute. */
function abs(path?: string | null): string | undefined {
  if (!path) return undefined;
  return path.startsWith("/") ? `${BASE}${path}` : path;
}

/** The site's own status vocabulary ("Complete", "Canceled", …). */
function toStatus(status?: string): string | undefined {
  if (!status) return undefined;
  const s = status.toLowerCase();
  if (s === "ongoing") return "ongoing";
  if (s === "complete" || s === "completed") return "completed";
  if (s === "hiatus") return "hiatus";
  if (s === "canceled" || s === "cancelled") return "cancelled";
  return status;
}

/** SourceKind only has manga/manhwa/manhua collapses to manhwa. */
function toKind(type?: string): SourceManga["kind"] {
  const t = (type ?? "").toLowerCase();
  if (t === "manhwa" || t === "manhua") return "manhwa";
  if (t === "novel") return "novel";
  return "manga";
}

async function tkFetch(url: string, revalidate?: number): Promise<Response> {
  let res: Response;
  try {
    res = await fetch(url, {
      headers: {
        "User-Agent": UA,
        Accept: "application/json,text/html;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
      },
      ...(revalidate ? { next: { revalidate } } : { cache: "no-store" as const }),
    });
  } catch (err) {
    throw new SourceError(`Toonkotsu unreachable: ${err}`, "toonkotsu", 503);
  }
  if (res.status === 429) {
    throw new SourceError(
      "Toonkotsu rate limit (429) — the anonymous chapter allowance may be exhausted for this IP; retry later.",
      "toonkotsu",
      429,
    );
  }
  if (res.status === 403) {
    throw new SourceError(
      "Toonkotsu responded 403 — likely a Cloudflare challenge for this client.",
      "toonkotsu",
      403,
    );
  }
  if (!res.ok) {
    throw new SourceError(`Toonkotsu responded ${res.status} for ${url}`, "toonkotsu", 502);
  }
  return res;
}

async function tkJson<T>(url: string, revalidate?: number): Promise<T> {
  const res = await tkFetch(url, revalidate);
  try {
    return (await res.json()) as T;
  } catch (err) {
    throw new SourceError(`Toonkotsu returned invalid JSON: ${err}`, "toonkotsu", 502);
  }
}

/* ------------------------------------------------------------------ */
/* API payload shapes (as observed live; all fields optional/defensive) */
/* ------------------------------------------------------------------ */

interface TkCard {
  id: number;
  hid?: string;
  code: string;
  slug: string;
  title: string;
  cover?: string | null;
  type?: string;
  status?: string;
  year?: number | null;
  tags?: string[];
  latest?: { label?: string } | null;
}

interface TkBrowseResponse {
  items?: TkCard[];
}

interface TkChapter {
  id: number;
  n: number | null;
  label?: string;
  vol?: string | null;
  /** Upload time, epoch milliseconds. */
  at?: number;
  /** Page count known up-front. */
  pages?: number;
  group?: { name?: string } | null;
}

interface TkSeriesResponse {
  series?: TkCard & {
    authors?: string[];
    description?: string;
    banner?: string | null;
  };
  chapters?: TkChapter[];
}

interface TkLatestResponse {
  items?: { chapter?: TkChapter; series?: TkCard }[];
}

interface TkPage {
  src: string;
  /** AES-CTR key (base64) — present on encrypted ("Official") chapters. */
  k?: string;
  /** AES-CTR nonce (base64). */
  n?: string;
  /** Mime type for decrypted bytes. */
  t?: string;
  w?: number;
  h?: number;
}

interface TkChapterPagesResponse {
  chapter?: { id?: number; pages?: TkPage[] };
}

/* ------------------------------------------------------------------ */

/** Map a browse/rankings card to a search result. */
function cardToResult(c: TkCard): SourceSearchResult {
  return {
    id: c.code,
    title: c.title,
    coverImage: abs(bigCover(c.cover)),
    latestChapter: c.latest?.label || undefined,
    subtitle: [c.type, c.year ? String(c.year) : null].filter(Boolean).join(" · ") || undefined,
  };
}

export const toonkotsu: SourceAdapter = {
  id: "toonkotsu",
  name: "Toonkotsu",
  kind: "manga",
  description: "Manga, manhwa & manhua reader — relevance search, full chapter metadata",

  /**
   * Advanced search. The UI's "title" form field maps to API param `q`
   * (verified live: `?q=jujutsu kaisen` returns relevance-sorted matches).
   */
  async search(query, limit = 24): Promise<SourceSearchResult[]> {
    const params = new URLSearchParams({ q: query, limit: String(limit) });
    const res = await tkJson<TkBrowseResponse>(
      `${CATALOGUE}/browse?${params}`,
      META_REVALIDATE,
    );
    return (res.items ?? []).map(cardToResult);
  },

  /** Home shelf: most opened titles (metric=views), verified live. */
  async getPopular(limit = 18): Promise<SourceSearchResult[]> {
    const params = new URLSearchParams({ metric: "views", limit: String(limit) });
    const res = await tkJson<TkBrowseResponse>(`${METRICS}/rankings?${params}`, META_REVALIDATE);
    return (res.items ?? []).map(cardToResult);
  },

  /** Home shelf: newest chapter uploads (items are {chapter, series}). */
  async getLatest(limit = 18): Promise<SourceSearchResult[]> {
    const params = new URLSearchParams({ limit: String(limit), sfw: "1" });
    const res = await tkJson<TkLatestResponse>(`${CATALOGUE}/latest?${params}`, META_REVALIDATE);
    return (res.items ?? [])
      .filter((it) => it.series)
      .map((it) => ({
        id: it.series!.code,
        title: it.series!.title,
        coverImage: abs(bigCover(it.series!.cover)),
        latestChapter: it.chapter?.label || undefined,
        subtitle: it.chapter?.group?.name || undefined,
      }));
  },

  /** Series details. `id` is the 6-char code, e.g. "bm0ssx". */
  async getManga(id): Promise<SourceManga> {
    const s = await fetchSeries(id);
    return {
      id: s.code,
      title: s.title,
      description: s.description ?? "",
      coverImage: abs(bigCover(s.cover)),
      bannerImage: abs(s.banner),
      genres: s.tags ?? [],
      status: toStatus(s.status),
      authors: s.authors ?? [],
      year: s.year ?? undefined,
      kind: toKind(s.type),
    };
  },

  /**
   * Chapter list from the same series payload (single request; the API
   * returns every release newest-first, several scan groups per chapter).
   * Duplicates sharing a chapter number are collapsed to the site's
   * preferred (first-listed) version; unnumbered extras (bonus, epilogue,
   * volume compilations) are kept, labelled, and sorted after the numbered
   * chapters. Result is ascending reading order.
   */
  async getChapters(mangaId): Promise<SourceChapter[]> {
    const payload = await fetchSeriesFull(mangaId);
    const seen = new Set<string>();
    const chapters: SourceChapter[] = [];

    for (const c of payload.chapters ?? []) {
      // First entry per chapter number (or per label for extras) is the
      // version the site itself promotes; later ones are alternate groups.
      const key = c.n != null ? `n:${c.n}` : `label:${(c.label ?? "").toLowerCase()}`;
      if (!c.id || seen.has(key)) continue;
      seen.add(key);
      chapters.push({
        id: String(c.id),
        number: c.n != null ? String(c.n) : undefined,
        title: c.label || undefined,
        publishedAt: c.at ? new Date(c.at).toISOString() : undefined,
        pagesCount: c.pages || undefined,
      });
    }

    // The API list is newest-first; sort ascending by chapter number, with
    // unnumbered extras (bonus/epilogue/volumes) after the numbered run in
    // their upload order.
    chapters.sort((a, b) => {
      const na = a.number != null ? Number(a.number) : Number.POSITIVE_INFINITY;
      const nb = b.number != null ? Number(b.number) : Number.POSITIVE_INFINITY;
      if (na !== nb) return na - nb;
      return (a.publishedAt ?? "").localeCompare(b.publishedAt ?? "");
    });
    return chapters;
  },

  /**
   * Page list for one chapter (`chapterId` = numeric id as string).
   *
   * Backed by the reader's own endpoint, /api/manga/chapter/<id>, which
   * robots.txt explicitly allows for crawlers. Response: { chapter: { pages } }
   * where each page is { src, k?, n?, t?, w?, h? } — verified against the
   * official reader bundle; live response could not be re-confirmed during
   * development because this IP had exhausted the anonymous 429 allowance.
   *
   * `src` may be site-relative or absolute; both are normalized to absolute.
   * Pages with `k`/`n` fields are AES-CTR encrypted (the official reader
   * decrypts in-browser) — those URLs are still returned in order, but the
   * raw bytes are not renderable as plain images.
   */
  async getPages(chapterId): Promise<SourcePage[]> {
    const res = await tkJson<TkChapterPagesResponse>(`${READER}/${chapterId}`);
    const pages = res.chapter?.pages;
    if (!pages?.length) {
      throw new SourceError(`Toonkotsu chapter ${chapterId} has no pages`, "toonkotsu", 404);
    }
    // The image CDN is fine with hotlinking but a Referer never hurts.
    const headers = { Referer: `${BASE}/` };
    const urls = pages
      .map((p) => abs(p.src))
      .filter((u): u is string => !!u);
    if (!urls.length) {
      throw new SourceError(`Toonkotsu chapter ${chapterId} has no usable page URLs`, "toonkotsu", 502);
    }
    return urls.map((url) => ({ url, headers }));
  },
};

/** Fetch just the series object. */
async function fetchSeries(id: string) {
  const payload = await fetchSeriesFull(id);
  const series = payload.series;
  if (!series?.code) {
    throw new SourceError(`Toonkotsu title ${id} not found`, "toonkotsu", 404);
  }
  return series;
}

/** Fetch series + chapters in one request (cached for metadata). */
function fetchSeriesFull(id: string): Promise<TkSeriesResponse> {
  return tkJson<TkSeriesResponse>(`${CATALOGUE}/series/${encodeURIComponent(id)}`, META_REVALIDATE);
}
