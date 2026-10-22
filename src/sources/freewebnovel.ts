import "server-only";
import { execFile } from "node:child_process";
import * as cheerio from "cheerio";
import type {
  SourceAdapter,
  SourceChapter,
  SourceManga,
  SourcePage,
  SourceSearchResult,
} from "./types";
import { SourceError } from "./types";

/**
 * FreeWebNovel — live light-novel/web-novel site (freewebnovel.com):
 * Shadow Slave, Lord of the Mysteries and thousands more. Verified live
 * 2026-10-23. `www.freewebnovel.com` simply redirects to
 * `https://freewebnovel.com/home`, so the bare domain is canonical.
 *
 * Adapter-local id formats:
 *   - Novel id: the URL slug, e.g. `shadow-slave`
 *     (URL: `/novel/{id}`).
 *   - Chapter id: the site-relative chapter path without leading slash,
 *     e.g. `novel/shadow-slave/chapter-1`
 *     (URL: `/{chapterId}`).
 *
 * Site map (all selectors verified against live pages):
 *   - Search:  GET /search?keyword=QUERY — server-rendered result rows
 *     `.ul-list1 .li-row` (cover `.pic a img`, title `.txt h3.tit a`
 *     with href `/novel/{slug}`, language `.desc a.novel[href^="/sort/"]`,
 *     latest chapter `a.chapter` linking `/novel/{slug}/chapter-{n}`).
 *   - Book:    GET /novel/{slug} — title `.m-desc h1.tit`, cover
 *     `.m-imgtxt .pic img` (fallback: `.m-book1 .bg2` background-image),
 *     labeled info rows `.m-imgtxt .txt .item` (icon
 *     `span[title="Author"|"Genre"|"Status"]`), description
 *     `.m-desc .txt .inner p`, rich `og:novel:*` meta tags as fallback.
 *     The chapter list lives in `ul#idData` (page 1, 40 rows) inside
 *     `#indexListPage`, which advertises `data-page-size`,
 *     `data-total-page` and `data-total-chapters`.
 *   - Chapters: GET /novel/{slug}?ajax=chapters&page={N}&pageSize={40}
 *     with an `X-Requested-With: XMLHttpRequest` header → JSON
 *     `{ code, html, page, pageSize, totalPage, totalChapters }`, where
 *     `html` is an `<li><a href="/novel/{slug}/chapter-…" class="con">`
 *     fragment (same shape as `ul#idData`). This is the endpoint the
 *     site's own `indexlist.js` uses.
 *   - Chapter: GET /novel/{slug}/chapter-{n} — prose container
 *     `div.txt > div#article` holding `<h4>` (chapter heading) and clean
 *     `<p>` paragraphs; ad slots (`.reader-ad-skip`, pubadx scripts) are
 *     injected BETWEEN paragraphs and are stripped below.
 *
 * TRANSPORT NOTE: unlike novelfull.net, freewebnovel.com answered plain
 * curl with HTTP 200 on every page tested (home/search/book/chapter and
 * the ajax endpoint — verified 2026-10-23), i.e. no Cloudflare challenge
 * today. The adapter still mirrors NovelFull's native-fetch → curl
 * fallback transport so it keeps working if the site puts a managed
 * challenge in front later (curl ships with Windows 10+); after the first
 * challenge it goes curl-first so we never double-hit the site.
 *
 * Novels carry text, not images: reading goes through `getTextPages()`;
 * `getPages()` throws a SourceError on purpose.
 */

const BASE = "https://freewebnovel.com";

/** The ID this adapter reports in SourceErrors. */
const SID = "freewebnovel";

/** Browser UA so the site treats us like a normal reader. */
const HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
    "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
};

/** The chapter-list JSON endpoint only answers to "real" XHR callers. */
const XHR_HEADERS = { "X-Requested-With": "XMLHttpRequest" };

/**
 * NOTE on caching: with the native/curl dual transport below, per-request
 * fetch caching would only apply to one of the two paths, so responses are
 * always fetched fresh; call sites stay cheap (pages are 100–150 kB) and
 * the app layer remains free to cache results.
 */

/** Safety cap for the ajax chapter-list walk (40 chapters/page → 6000). */
const MAX_CHAPTER_PAGES = 150;

/** Personal-use throttle: never more than ~1 request/second. */
const MIN_INTERVAL_MS = 1000;
let lastRequestAt = 0;
let requestChain: Promise<unknown> = Promise.resolve();

type Loaded = ReturnType<typeof cheerio.load>;

/**
 * Serialize outgoing requests and space them at least ~1s apart so the
 * adapter stays polite no matter how much a caller fans out.
 */
function withSlot<T>(fn: () => Promise<T>): Promise<T> {
  const run = requestChain.then(async () => {
    const wait = lastRequestAt + MIN_INTERVAL_MS - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    lastRequestAt = Date.now();
    return fn();
  });
  requestChain = run.catch(() => undefined);
  return run;
}

/** Marker used to extract the status code from curl's combined output. */
const CURL_STATUS = "\n<<<freewebnovel-status:";

/** GET via system curl (different TLS stack — passes CDN challenges). */
function curlGet(
  url: string,
  extraHeaders?: Record<string, string>,
): Promise<{ status: number; body: string }> {
  const args = [
    "-s",
    "-L",
    "--max-time",
    "25",
    "-A",
    HEADERS["User-Agent"],
  ];
  for (const [key, value] of Object.entries(extraHeaders ?? {})) {
    args.push("-H", `${key}: ${value}`);
  }
  args.push("-w", `${CURL_STATUS}%{http_code}>`, url);
  return new Promise((resolve, reject) => {
    execFile(
      "curl",
      args,
      { maxBuffer: 16 * 1024 * 1024, timeout: 30000 },
      (err, stdout) => {
        if (err) {
          reject(err);
          return;
        }
        const idx = stdout.lastIndexOf(CURL_STATUS);
        if (idx === -1) {
          reject(new Error("curl produced no status marker"));
          return;
        }
        resolve({
          status: Number(
            stdout.slice(idx + CURL_STATUS.length).replace(/[^0-9]/g, ""),
          ),
          body: stdout.slice(0, idx),
        });
      },
    );
  });
}

/** Cloudflare managed challenge instead of real content. */
function isChallenge(status: number, body: string): boolean {
  return (
    (status === 403 || status === 503) &&
    /just a moment|cf-chl|challenge-platform|turnstile/i.test(body)
  );
}

/** Once the CDN has challenged the native client, skip straight to curl. */
let nativeChallenged = false;

/**
 * Fetch a page body. Native fetch first; on a Cloudflare challenge retry
 * through curl (every wire request takes its own throttle slot).
 * Non-OK statuses are returned as-is for the caller to map.
 */
async function fetchBody(
  path: string,
  extraHeaders?: Record<string, string>,
): Promise<{ status: number; body: string }> {
  let nativeStatus: number | undefined;
  if (!nativeChallenged) {
    try {
      const res = await withSlot(() =>
        fetch(`${BASE}${path}`, {
          headers: { ...HEADERS, ...extraHeaders },
          cache: "no-store" as const,
        }),
      );
      const body = await res.text();
      if (!isChallenge(res.status, body)) return { status: res.status, body };
      nativeStatus = res.status;
      nativeChallenged = true;
    } catch {
      // Network error — the curl path below still gets a chance.
    }
  }

  try {
    const { status, body } = await withSlot(() =>
      curlGet(`${BASE}${path}`, extraHeaders),
    );
    if (isChallenge(status, body)) {
      throw new Error("CDN challenge even via curl");
    }
    return { status, body };
  } catch (err) {
    if (nativeStatus !== undefined) {
      throw new SourceError(
        `FreeWebNovel blocked: HTTP ${nativeStatus} bot challenge, ` +
          `curl fallback failed (${err})`,
        SID,
        502,
      );
    }
    throw new SourceError(`FreeWebNovel unreachable: ${err}`, SID, 503);
  }
}

/** Fetch a page body; failures and non-OK statuses become SourceError. */
async function fetchText(
  path: string,
  extraHeaders?: Record<string, string>,
): Promise<string> {
  const { status, body } = await fetchBody(path, extraHeaders);
  if (status === 404) {
    throw new SourceError(`FreeWebNovel: not found (${path})`, SID, 404);
  }
  if (status >= 400) {
    throw new SourceError(
      `FreeWebNovel responded ${status} (${path})`,
      SID,
      502,
    );
  }
  return body;
}

/** Fetch an HTML page and load it with cheerio. */
async function fetchHtml(
  path: string,
  extraHeaders?: Record<string, string>,
): Promise<Loaded> {
  return cheerio.load(await fetchText(path, extraHeaders));
}

/** Collapse whitespace so paragraphs come back as clean plain text. */
function squash(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

/** Normalize any src/href (protocol-relative, root-relative) to absolute. */
function absoluteUrl(url: string | undefined): string | undefined {
  if (!url) return undefined;
  const clean = url.trim();
  if (!clean || clean.startsWith("data:")) return undefined;
  if (clean.startsWith("//")) return `https:${clean}`;
  if (clean.startsWith("/")) return `${BASE}${clean}`;
  return clean;
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * The novel slug as it appears in site URLs. Ids are href-derived (already
 * URL-encoded by the site), so they are used verbatim — never re-encoded.
 */
function slugOf(id: string): string {
  return id.replace(/^\/+|\/+$/g, "");
}

/** Find one labeled `.item` row of the book info block (icon carries the label). */
function infoRow($: Loaded, label: string) {
  return $(".m-imgtxt .txt .item")
    .filter((_, el) => $(el).find(`span[title="${label}"]`).length > 0)
    .first();
}

/** Link texts inside the labeled book-info row (authors, genres). */
function infoLinks($: Loaded, label: string): string[] {
  return infoRow($, label)
    .find(".right a")
    .map((_, a) => squash($(a).text()))
    .get()
    .filter(Boolean);
}

/** Plain text of the labeled book-info row (status). */
function infoText($: Loaded, label: string): string | undefined {
  const text = squash(infoRow($, label).find(".right").text());
  return text || undefined;
}

/** Map the site's status wording onto our status values. */
function normalizeStatus(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  const s = raw.toLowerCase();
  if (s.includes("ongoing")) return "ongoing";
  if (s.includes("complete") || s.includes("finished")) return "completed";
  if (s.includes("hiatus")) return "hiatus";
  if (s.includes("cancel")) return "cancelled";
  return s;
}

/**
 * Parse one chapter-list source (the rendered `ul#idData` on the book
 * page, or an `?ajax=chapters` HTML fragment) into SourceChapter entries,
 * preserving ascending document order.
 */
function parseChapterList(
  $: Loaded,
  chapterPattern: RegExp,
  scope?: string,
): SourceChapter[] {
  const out: SourceChapter[] = [];
  const seen = new Set<string>();
  const root = scope ? $(scope) : $.root();
  root.find("a[href]").each((_, el) => {
    const a = $(el);
    const href = (a.attr("href") ?? "").split(/[?#]/)[0];
    if (!chapterPattern.test(href)) return;
    const id = href.replace(/^\/+/, "");
    if (seen.has(id)) return;
    seen.add(id);
    const title = squash(a.text()) || undefined;
    out.push({ id, number: chapterNumber(id, title), title });
  });
  return out;
}

/**
 * Chapter number, e.g. "3222" or "12.5". The slug is authoritative — it is
 * always `chapter-<number>[…]` — while the visible title is the fallback.
 */
function chapterNumber(id: string, title?: string): string | undefined {
  const slug = id.split("/").pop() ?? id;
  const fromSlug = slug.match(/chapter-(\d+(?:\.\d+)?)/i)?.[1];
  if (fromSlug) return fromSlug;
  return title?.match(/\bchapter\s+['‘’"]?(\d+(?:\.\d+)?)/i)?.[1];
}

export const freewebnovel: SourceAdapter = {
  id: "freewebnovel",
  name: "FreeWebNovel",
  kind: "novel",
  description:
    "freewebnovel.com — translated light novels & web novels (text reader)",

  async search(query, limit = 24): Promise<SourceSearchResult[]> {
    const $ = await fetchHtml(
      `/search?keyword=${encodeURIComponent(query)}`,
    );

    const results: SourceSearchResult[] = [];
    const seen = new Set<string>();

    // Result rows: `.ul-list1 .li-row` — cover cell `.pic`, text cell `.txt`.
    $(".ul-list1 .li-row").each((_, el) => {
      const row = $(el);
      const titleA = row.find(".txt h3.tit a[href]").first();
      const href = (titleA.attr("href") ?? "").split(/[?#]/)[0];
      const slug = href.match(/^\/novel\/([^/]+)$/)?.[1];
      const title = squash(titleA.text());
      if (!slug || !title || seen.has(slug)) return;
      seen.add(slug);

      // Latest chapter cell links straight to the newest chapter.
      const chapA = row.find("a.chapter[href]").first();
      const latest =
        chapA.attr("href")?.match(/\/chapter-([\d.]+)[^/]*$/)?.[1] ??
        undefined;

      const img = row.find(".pic a img").first();
      results.push({
        id: slug,
        title,
        coverImage: absoluteUrl(img.attr("src") ?? img.attr("data-src")),
        latestChapter: latest ? `Ch. ${latest}` : undefined,
        // The language cell ("English Novel", "Chinese Novel", …) — the
        // genre cells also use class "novel", hence the href prefix check.
        subtitle:
          squash(row.find('.desc a.novel[href^="/sort/"]').first().text()) ||
          undefined,
      });
    });

    return results.slice(0, limit);
  },

  async getManga(id): Promise<SourceManga> {
    const slug = slugOf(id);
    const $ = await fetchHtml(`/novel/${slug}`);

    const title =
      squash($(".m-desc h1.tit").first().text()) ||
      squash($('meta[property="og:title"]').attr("content") ?? "").replace(
        /\s*[-|–]\s*Free\s*Web\s*Novel\s*$/i,
        "",
      );
    if (!title) {
      throw new SourceError(
        `FreeWebNovel: could not parse title for "${slug}"`,
        SID,
        502,
      );
    }

    const coverImg = $(".m-imgtxt .pic img").first();
    const cover =
      absoluteUrl(coverImg.attr("src") ?? coverImg.attr("data-src")) ??
      absoluteUrl(
        $(".m-book1 .bg2").attr("style")?.match(/url\(['"]?([^'")]+)/)?.[1],
      ) ??
      absoluteUrl($('meta[property="og:image"]').attr("content"));

    const authors = infoLinks($, "Author");

    const genres = infoLinks($, "Genre");

    const status = normalizeStatus(infoText($, "Status"));

    // Description lives as <p> blocks in the SUMMARY box.
    const descPs = $(".m-desc .txt .inner p")
      .map((_, p) => squash($(p).text()))
      .get()
      .filter(Boolean);
    const description =
      descPs.length > 0
        ? descPs.join("\n")
        : squash($(".m-desc .inner").first().text()) ||
          squash($('meta[property="og:description"]').attr("content") ?? "");

    return {
      id: slug,
      title,
      description,
      coverImage: cover,
      genres,
      status,
      authors,
      kind: "novel",
    };
  },

  async getChapters(mangaId): Promise<SourceChapter[]> {
    const slug = slugOf(mangaId);
    const $ = await fetchHtml(`/novel/${slug}`);

    // The list container advertises its own paging metadata.
    const root = $("#indexListPage");
    const pageSize = Number(root.attr("data-page-size") ?? "40") || 40;
    const totalPage = Number(root.attr("data-total-page") ?? "1") || 1;
    const chapterPattern = new RegExp(
      `^/novel/${escapeRe(slug)}/chapter-[^/?#]+$`,
    );

    // Page 1 is rendered server-side inside the book page (`ul#idData`).
    const chapters = parseChapterList($, chapterPattern, "#idData");
    if (chapters.length === 0) {
      throw new SourceError(
        `FreeWebNovel: chapter list not found for "${slug}"`,
        SID,
        502,
      );
    }
    const seenIds = new Set(chapters.map((c) => c.id));

    // Remaining pages come from the JSON endpoint the site itself uses.
    if (totalPage > 1) {
      const pages = Math.min(totalPage, MAX_CHAPTER_PAGES);
      for (let page = 2; page <= pages; page++) {
        const body = await fetchText(
          `/novel/${slug}?ajax=chapters&page=${page}&pageSize=${pageSize}`,
          XHR_HEADERS,
        );
        let payload: { code?: number; html?: string };
        try {
          payload = JSON.parse(body) as { code?: number; html?: string };
        } catch {
          throw new SourceError(
            `FreeWebNovel: bad chapter-list payload (page ${page})`,
            SID,
            502,
          );
        }
        if (payload.code !== 200 || typeof payload.html !== "string") {
          throw new SourceError(
            `FreeWebNovel: chapter-list page ${page} rejected ` +
              `(${payload.code ?? "no code"})`,
            SID,
            502,
          );
        }
        for (const c of parseChapterList(
          cheerio.load(payload.html),
          chapterPattern,
        )) {
          // Some editions repeat a chapter row on a neighbouring page;
          // keep the first occurrence (site order is canonical).
          if (!seenIds.has(c.id)) {
            seenIds.add(c.id);
            chapters.push(c);
          }
        }
      }
    }

    return chapters;
  },

  /**
   * Novels have no image pages — reading goes through getTextPages().
   * The interface only requires this method to exist; FreeWebNovel
   * chapters are pure prose, so image-page requests are rejected loudly
   * instead of silently returning an empty chapter.
   */
  async getPages(_chapterId): Promise<SourcePage[]> {
    throw new SourceError(
      "FreeWebNovel serves text novels, not image pages",
      SID,
    );
  },

  async getTextPages(chapterId): Promise<string[]> {
    const path = chapterId.startsWith("/") ? chapterId : `/${chapterId}`;
    const $ = await fetchHtml(path);

    // The prose container (verified live: div.txt > div#article, with the
    // chapter heading in an <h4> and the prose in <p> paragraphs).
    let container = $("#article").first();
    if (container.length === 0) container = $(".txt").first();
    if (container.length === 0) {
      throw new SourceError(
        `FreeWebNovel: chapter text container not found in "${chapterId}" ` +
          "(markup changed or page blocked)",
        SID,
        502,
      );
    }

    // Ad slots are injected BETWEEN paragraphs — strip them …
    container
      .find(
        "script, style, noscript, ins, iframe, .ads, .ads-container, " +
          ".adsbygoogle, .reader-ad-skip",
      )
      .remove();
    // … and any in-container prev/next navigation links.
    container.find("a").each((_, a) => {
      const el = $(a);
      const text = squash(el.text());
      if (text.length <= 60 && /\b(previous|next)(\s+chapter)?\b/i.test(text)) {
        el.remove();
      }
    });

    // Live markup: clean <p> paragraphs (entities already decoded by
    // cheerio); the <h4> heading is skipped on purpose (the chapter list
    // carries the title).
    let paragraphs = container
      .find("p")
      .map((_, p) => squash($(p).text()))
      .get()
      .filter(Boolean);

    // Fallback: editions that separate paragraphs with <br> instead.
    if (paragraphs.length === 0) {
      const parse = (fragment: string): string =>
        cheerio.load(`<div>${fragment}</div>`).root().text();
      paragraphs = (container.html() ?? "")
        .split(/<br\s*\/?>/i)
        .map((fragment) => squash(parse(fragment)))
        .filter(Boolean);
    }

    // Last resort: whole container text split on blank lines.
    if (paragraphs.length === 0) {
      paragraphs = container
        .text()
        .split(/\n{2,}/)
        .map((p) => squash(p))
        .filter(Boolean);
    }

    if (paragraphs.length === 0) {
      throw new SourceError(
        `FreeWebNovel: no readable text in "${chapterId}"`,
        SID,
        502,
      );
    }

    return paragraphs;
  },
};
