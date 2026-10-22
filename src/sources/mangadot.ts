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
 * MangaDot — https://mangadot.net/ (an independent site; NOT MangaDex).
 *
 * The site is a React Router 7 SPA. Its HTML pages sit behind a Cloudflare
 * managed challenge for non-browser clients, but the JSON API the SPA itself
 * calls is served without a challenge:
 *
 *   GET /api/search?search=q&page=n    { manga_list: [...], pagination, ... }
 *   GET /api/manga/:id                 { manga: { title, description, ... } }
 *   GET /api/manga/:id/chapters/list   [ chapter, ... ]        (ascending)
 *   GET /api/chapters/:id/images       { chapter, manga, images: [{url,...}] }
 *   GET /api/token/generate            { page_token, signing_key } (HMAC gate)
 *
 * Verified live 2026-10-23: search relevance ("naruto" → NARUTO first), manga
 * metadata incl. authors, a 130-chapter ascending list, and an 81-page chapter
 * whose WebP URLs return 200 image/webp.
 *
 * Adapter-local ids (opaque to callers):
 *   manga   — site numeric id, e.g. "1310".
 *   chapter — site numeric id, e.g. "140455". User-uploaded chapters are
 *             prefixed "user:" (e.g. "user:5512") because their pages live
 *             under /api/uploads/:id/images instead of /api/chapters/:id/images.
 */

const BASE = "https://mangadot.net";

/** Metadata is stable for hours; page lists must never be cached. */
const META_REVALIDATE = 60 * 60 * 6; // 6h

/** The search API ignores per_page — it always returns 20 entries per page. */
const SEARCH_PAGE_SIZE = 20;

/** Browser-ish headers: Cloudflare is happier with them (verified working). */
const HEADERS: Record<string, string> = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
  Accept: "application/json, text/plain, */*",
  "Accept-Language": "en-US,en;q=0.9",
  Referer: `${BASE}/`,
};

// ---------------------------------------------------------------------------
// Response shapes (only the fields we consume; the API carries many more)
// ---------------------------------------------------------------------------

interface MgSearchEntry {
  id: number;
  title: string;
  photo?: string | null;
  /** number or "130.0"-style string, depending on the row */
  latest_chapter_number?: number | string | null;
}

interface MgSearchResponse {
  manga_list?: MgSearchEntry[];
}

interface MgManga {
  id: number;
  title: string;
  description?: string | null;
  photo?: string | null;
  banner_image?: string | null;
  genres?: string[];
  status?: string | null;
  /** JSON-encoded string, e.g. "[\"HONGDUCK\"]" — NOT a real array */
  authors?: string | string[] | null;
  /** ditto */
  artists?: string | string[] | null;
  year?: number | null;
}

interface MgMangaResponse {
  manga?: MgManga;
}

interface MgChapterItem {
  id: number;
  chapter_number?: number | string | null;
  chapter_title?: string | null;
  date_added?: string | null;
  page_count?: number;
  source?: string | null;
}

interface MgImage {
  url: string;
}

interface MgImagesResponse {
  images?: MgImage[];
}

interface MgToken {
  page_token?: string;
  signing_key?: string;
}

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Personal-use politeness: never burst more than ~1 request/second. */
const REQUEST_SPACING_MS = 1000;
let lastRequestAt = 0;
async function pace(): Promise<void> {
  const wait = lastRequestAt + REQUEST_SPACING_MS - Date.now();
  if (wait > 0) await sleep(wait);
  lastRequestAt = Date.now();
}

/** Site paths are root-relative ("/uploads/...") — absolutize for the reader. */
function abs(path?: string | null): string | undefined {
  if (!path) return undefined;
  return path.startsWith("http") ? path : `${BASE}${path}`;
}

/** MangaDot ids are always numeric — reject junk early. */
function requireId(id: string, what: "manga" | "chapter"): void {
  if (!/^\d+$/.test(id)) {
    throw new SourceError(`Invalid MangaDot ${what} id "${id}"`, "mangadot", 400);
  }
}

/** "2026-03-02 19:57:08+00" → ISO-8601 ("2026-03-02T19:57:08.000Z"). */
function toIso(value?: string | null): string | undefined {
  if (!value) return undefined;
  const iso = value.trim().replace(" ", "T").replace(/([+-]\d{2})$/, "$1:00");
  const date = new Date(/([+-]\d{2}:\d{2}|Z)$/.test(iso) ? iso : `${iso}Z`);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

/** The API stores name lists as JSON strings: "[\"HONGDUCK\"]". */
function nameList(value?: string | string[] | null): string[] {
  if (Array.isArray(value)) return value.map(String).filter(Boolean);
  if (typeof value === "string") {
    try {
      const parsed: unknown = JSON.parse(value);
      if (Array.isArray(parsed)) return parsed.map(String).filter(Boolean);
    } catch {
      // not JSON — no names
    }
  }
  return [];
}

/** "Completed" → "completed", "On Hiatus" → "hiatus", ... */
function normStatus(status?: string | null): string | undefined {
  if (!status) return undefined;
  const value = status.toLowerCase();
  if (value.includes("hiatus")) return "hiatus";
  if (value.includes("cancel")) return "cancelled";
  if (value.includes("complete")) return "completed";
  if (value.includes("ongoing")) return "ongoing";
  return value;
}

/** 12.0 → "12" (keeps "12.5"); null/"" → undefined. */
function chapterNumber(value?: number | string | null): string | undefined {
  if (value == null || value === "") return undefined;
  return String(value).replace(/\.0+$/, "");
}

/** Numeric sort key; specials without a number sort first. */
function chapterSortKey(chapter: MgChapterItem): number {
  const value = Number.parseFloat(String(chapter.chapter_number ?? ""));
  return Number.isFinite(value) ? value : Number.NEGATIVE_INFINITY;
}

function toSearchResult(entry: MgSearchEntry): SourceSearchResult {
  const latest = chapterNumber(entry.latest_chapter_number);
  return {
    id: String(entry.id),
    title: entry.title,
    coverImage: abs(entry.photo),
    ...(latest ? { latestChapter: `Ch. ${latest}` } : {}),
  };
}

// ---------------------------------------------------------------------------
// Fetch plumbing
// ---------------------------------------------------------------------------

function httpError(status: number, path: string, contentType?: string | null): SourceError {
  if (status === 404) return new SourceError(`MangaDot: not found (${path})`, "mangadot", 404);
  if (status === 429) {
    return new SourceError("MangaDot rate-limited us — try again shortly", "mangadot", 429);
  }
  if (status === 403 && contentType?.includes("text/html")) {
    // Cloudflare managed challenge page instead of the API payload
    return new SourceError("MangaDot blocked this request (Cloudflare challenge)", "mangadot", 403);
  }
  return new SourceError(`MangaDot responded ${status} for ${path}`, "mangadot", status);
}

/**
 * GET one API path. Transient 403/429 responses were occasionally observed on
 * the live API, so retry once after a polite second before giving up.
 */
async function request(path: string, revalidate?: number): Promise<Response> {
  for (let attempt = 0; ; attempt++) {
    await pace();
    let res: Response;
    try {
      res = await fetch(`${BASE}${path}`, {
        headers: HEADERS,
        ...(revalidate ? { next: { revalidate } } : { cache: "no-store" as const }),
      });
    } catch (err) {
      throw new SourceError(`MangaDot unreachable: ${err}`, "mangadot", 503);
    }
    if ((res.status === 403 || res.status === 429) && attempt < 1) {
      await sleep(1000);
      continue;
    }
    return res;
  }
}

async function apiGet<T>(path: string, revalidate?: number): Promise<T> {
  const res = await request(path, revalidate);
  if (!res.ok) throw httpError(res.status, path, res.headers.get("content-type"));
  return res.json() as Promise<T>;
}

// ---------------------------------------------------------------------------
// Search (also powers getLatest — a bare /api/search is the recently-updated
// shelf, sorted by last chapter date descending)
// ---------------------------------------------------------------------------

function searchPath(query: string | undefined, page: number): string {
  const params = new URLSearchParams();
  if (query) params.set("search", query); // NOTE: the param is `search`, not `q`
  if (page > 1) params.set("page", String(page));
  const qs = params.toString();
  return `/api/search${qs ? `?${qs}` : ""}`;
}

/** Fetch as many fixed-size pages as needed to fill `limit` (max 5 requests). */
async function searchEntries(query: string | undefined, limit: number): Promise<MgSearchEntry[]> {
  const maxPages = Math.min(5, Math.max(1, Math.ceil(limit / SEARCH_PAGE_SIZE)));
  const entries: MgSearchEntry[] = [];
  for (let page = 1; page <= maxPages && entries.length < limit; page++) {
    const data = await apiGet<MgSearchResponse>(searchPath(query, page), META_REVALIDATE);
    const batch = Array.isArray(data.manga_list) ? data.manga_list : [];
    if (batch.length === 0) break;
    entries.push(...batch);
    if (batch.length < SEARCH_PAGE_SIZE) break; // last page
  }
  return entries;
}

// ---------------------------------------------------------------------------
// Chapter pages: /api/chapters/:id/images, optionally HMAC-gated
// ---------------------------------------------------------------------------

/**
 * The reader gates image listings behind an HMAC token from
 * /api/token/generate?chapter_id=&type=. Anonymous visitors always receive
 * empty tokens, so remember that and skip the extra call — until a 403 says
 * otherwise (then re-enable the token flow).
 */
let tokensUnused = false;

/** Same scheme as the site: HMAC-SHA256(signing_key, `${nonce}|${ts}|${path}`). */
async function hmacHex(key: string, message: string): Promise<string> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) {
    throw new SourceError("MangaDot: Web Crypto unavailable for page tokens", "mangadot", 500);
  }
  const encoder = new TextEncoder();
  const cryptoKey = await subtle.importKey(
    "raw",
    encoder.encode(key),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await subtle.sign("HMAC", cryptoKey, encoder.encode(message));
  return Array.from(new Uint8Array(signature))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

/** Signed-or-plain GET of an images endpoint, mirroring the site's retries. */
async function fetchImages(
  path: string,
  chapterId: string,
  type: "chapter" | "upload",
): Promise<MgImagesResponse> {
  for (let attempt = 0; ; attempt++) {
    const headers: Record<string, string> = { ...HEADERS };
    if (!tokensUnused) {
      const token = await apiGet<MgToken>(
        `/api/token/generate?chapter_id=${chapterId}&type=${type}`,
      );
      if (token.page_token && token.signing_key) {
        const nonce = globalThis.crypto.randomUUID();
        const timestamp = String(Math.floor(Date.now() / 1000));
        headers["X-Page-Token"] = token.page_token;
        headers["X-Nonce"] = nonce;
        headers["X-Timestamp"] = timestamp;
        // site signs the request path exactly as passed to fetch()
        headers["X-Signature"] = await hmacHex(token.signing_key, `${nonce}|${timestamp}|${path}`);
      } else {
        tokensUnused = true;
      }
    }

    await pace();
    let res: Response;
    try {
      res = await fetch(`${BASE}${path}`, { headers, cache: "no-store" });
    } catch (err) {
      throw new SourceError(`MangaDot unreachable: ${err}`, "mangadot", 503);
    }
    if (res.ok) return res.json() as Promise<MgImagesResponse>;
    if ((res.status === 403 || res.status === 429) && attempt < 2) {
      if (res.status === 403) tokensUnused = false; // tokens may have become required
      await sleep(1000 * (attempt + 1));
      continue;
    }
    throw httpError(res.status, path, res.headers.get("content-type"));
  }
}

// ---------------------------------------------------------------------------
// The adapter
// ---------------------------------------------------------------------------

export const mangadot: SourceAdapter = {
  id: "mangadot",
  name: "MangaDot",
  kind: "manga",
  description: "MangaDot — huge manga & manhwa catalog with a fast built-in reader",

  async search(query, limit = 24): Promise<SourceSearchResult[]> {
    const entries = await searchEntries(query.trim() || undefined, limit);
    return entries.slice(0, limit).map(toSearchResult);
  },

  /** Recently-updated shelf: bare /api/search is sorted by latest chapter. */
  async getLatest(limit = 18): Promise<SourceSearchResult[]> {
    const entries = await searchEntries(undefined, limit);
    return entries.slice(0, limit).map(toSearchResult);
  },

  async getManga(id): Promise<SourceManga> {
    requireId(id, "manga");
    const data = await apiGet<MgMangaResponse>(`/api/manga/${id}`, META_REVALIDATE);
    const manga = data.manga;
    if (!manga) throw new SourceError(`MangaDot: manga ${id} has no data`, "mangadot", 404);

    // authors and artists both come as JSON strings; show creators like the site does
    const authors = [...new Set([...nameList(manga.authors), ...nameList(manga.artists)])];

    return {
      id: String(manga.id),
      title: manga.title,
      description: manga.description ?? "",
      coverImage: abs(manga.photo),
      bannerImage: abs(manga.banner_image),
      genres: manga.genres ?? [],
      status: normStatus(manga.status),
      authors,
      year: manga.year ?? undefined,
      kind: "manga",
    };
  },

  async getChapters(mangaId): Promise<SourceChapter[]> {
    requireId(mangaId, "manga");
    const list = await apiGet<MgChapterItem[]>(
      `/api/manga/${mangaId}/chapters/list`,
      META_REVALIDATE,
    );
    if (!Array.isArray(list)) {
      throw new SourceError(`MangaDot: bad chapter list for ${mangaId}`, "mangadot", 502);
    }

    // API order is already ascending; re-sort (stable) to guarantee the contract
    return [...list]
      .sort((a, b) => chapterSortKey(a) - chapterSortKey(b))
      .map((chapter) => ({
        id: chapter.source === "user" ? `user:${chapter.id}` : String(chapter.id),
        number: chapterNumber(chapter.chapter_number),
        title: chapter.chapter_title || undefined,
        publishedAt: toIso(chapter.date_added),
        pagesCount: chapter.page_count || undefined,
      }));
  },

  async getPages(chapterId): Promise<SourcePage[]> {
    const isUserUpload = chapterId.startsWith("user:");
    const numericId = isUserUpload ? chapterId.slice("user:".length) : chapterId;
    requireId(numericId, "chapter");

    const type = isUserUpload ? "upload" : "chapter";
    const path = isUserUpload
      ? `/api/uploads/${numericId}/images`
      : `/api/chapters/${numericId}/images`;

    const data = await fetchImages(path, numericId, type);

    // images[] is already in reading order (001.webp, 002.webp, ...)
    const pages: SourcePage[] = [];
    for (const image of data.images ?? []) {
      const url = abs(image.url);
      if (url) pages.push({ url });
    }
    if (pages.length === 0) {
      throw new SourceError(`MangaDot: chapter ${chapterId} has no pages`, "mangadot", 404);
    }
    return pages;
  },
};
