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
 * Royal Road — the largest western web-fiction site (royalroad.com):
 * original English novels and fan fiction (Mother of Learning, The Perfect
 * Run, Beware of Chicken …). Verified live 2026-10-23.
 *
 * Adapter-local id formats (NOTE: these differ from the slug-based ids
 * originally envisioned — verified live, slugs DO NOT resolve):
 *   - Novel id: the NUMERIC fiction id, e.g. `21220`
 *     (URL: `/fiction/{id}` — redirects to the canonical `/fiction/{id}/{slug}`).
 *     Slug-only URLs (`/fiction/mother-of-learning`) return 404, and the
 *     slug segment is decorative on every other URL: `/fiction/21220/<any
 *     garbage slug>` still serves the page, so numeric ids are both the
 *     only resolvable and the rename-proof choice.
 *   - Chapter id: the site-relative chapter path without leading slash,
 *     e.g. `fiction/21220/mother-of-learning/chapter/301778/1-good-morning-brother`
 *     (URL: `${BASE}/{chapterId}`). The two slugs inside are ignored by the
 *     server — only `/fiction/{fictionId}/…/chapter/{chapterId}/…` matters —
 *     so stored ids survive fiction renames.
 *
 * Site map (all selectors verified against live pages 2026-10-23):
 *   - Search:  GET /fictions/search?title=QUERY[&page=N] — server-rendered
 *     result rows `div.row.fiction-list-item` (cover `figure img[src]`,
 *     title `h2.fiction-title a[href]` → `/fiction/{id}/{slug}`, type/status
 *     chips `span.label`, chapter count in the `div` holding `i.fa-list`).
 *     20 rows per page; `perPage` is ignored, paginate with `page=N`.
 *   - Fiction: GET /fiction/{id} (301 → canonical) — title `.fic-title h1`,
 *     author(s) `.fic-title h4 a[href^="/profile/"]`, cover
 *     `.cover-art-container img` (fallback `og:image`), description
 *     `.description .hidden-content p` (fallback meta description), tags
 *     `a.fiction-tag` (RR's genres are its "tags"), status/type chips
 *     `span.label` ("Original"/"Fan Fiction" + "ONGOING"/"COMPLETED"/
 *     "HIATUS"/"INACTIVE"). Chapter list: `table#chapters[data-chapters]`
 *     with one `tr.chapter-row[data-url]` per chapter — ALL chapters are
 *     rendered server-side (verified 109/109 and 131/131), no paging.
 *   - Chapter: GET /fiction/{fid}/…/chapter/{cid}/… — prose lives in
 *     `div.chapter-inner.chapter-content` as clean `<p>` paragraphs.
 *     NitroPay ad portlets and the author's note
 *     (`div.portlet.solid.author-note-portlet`) are SIBLINGS outside the
 *     container, so a plain `<p>` walk yields pure prose; ads/nav inside
 *     the container are stripped defensively anyway.
 *
 * TRANSPORT NOTE: royalroad.com sits behind Cloudflare, which serves its
 * managed "Just a moment…" challenge to Node's undici client (403, verified
 * 2026-10-23) while letting the system curl through (verified on this
 * machine). The adapter therefore mirrors NovelFull's native-fetch → curl
 * fallback transport; after the first challenge it goes curl-first so we
 * never double-hit the site. Also verified: HEAD requests 404 regardless
 * of path — only GET is used here.
 *
 * Caveats: big-name fictions occasionally get delisted/removed from Royal
 * Road entirely (e.g. Shadow Slave's old id 11219 now belongs to a
 * different story) — the adapter reflects whatever the site serves.
 *
 * Novels carry text, not images: reading goes through `getTextPages()`;
 * `getPages()` throws a SourceError on purpose.
 */

const BASE = "https://www.royalroad.com";

/** The ID this adapter reports in SourceErrors. */
const SID = "royalroad";

/** Browser UA so the site treats us like a normal reader. */
const HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
    "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
};

/**
 * NOTE on caching: with the native/curl dual transport below, per-request
 * fetch caching would only apply to one of the two paths, so responses are
 * always fetched fresh; call sites stay cheap (pages are 100–250 kB) and
 * the app layer remains free to cache results.
 */

/** Search renders 20 rows/page; cap the pagination walk (20 × 5 = 100). */
const MAX_SEARCH_PAGES = 5;

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
const CURL_STATUS = "\n<<<royalroad-status:";

/** GET via system curl (different TLS stack — passes the CDN challenge). */
function curlGet(url: string): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    execFile(
      "curl",
      [
        "-s",
        "-L",
        "--max-time",
        "25",
        "-A",
        HEADERS["User-Agent"],
        "-w",
        `${CURL_STATUS}%{http_code}>`,
        url,
      ],
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
): Promise<{ status: number; body: string }> {
  let nativeStatus: number | undefined;
  if (!nativeChallenged) {
    try {
      const res = await withSlot(() =>
        fetch(`${BASE}${path}`, {
          headers: HEADERS,
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
    const { status, body } = await withSlot(() => curlGet(`${BASE}${path}`));
    if (isChallenge(status, body)) {
      throw new Error("CDN challenge even via curl");
    }
    return { status, body };
  } catch (err) {
    if (nativeStatus !== undefined) {
      throw new SourceError(
        `Royal Road blocked: HTTP ${nativeStatus} bot challenge, ` +
          `curl fallback failed (${err})`,
        SID,
        502,
      );
    }
    throw new SourceError(`Royal Road unreachable: ${err}`, SID, 503);
  }
}

/** Fetch a page body; failures and non-OK statuses become SourceError. */
async function fetchText(path: string): Promise<string> {
  const { status, body } = await fetchBody(path);
  if (status === 404) {
    throw new SourceError(`Royal Road: not found (${path})`, SID, 404);
  }
  if (status >= 400) {
    throw new SourceError(
      `Royal Road responded ${status} (${path})`,
      SID,
      502,
    );
  }
  return body;
}

/** Fetch an HTML page and load it with cheerio. */
async function fetchHtml(path: string): Promise<Loaded> {
  return cheerio.load(await fetchText(path));
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

/**
 * Coerce the site's datetime attributes (which carry 7 fractional-second
 * digits, e.g. `2017-04-01T01:04:46.0000000+00:00`) into a valid ISO
 * timestamp, or undefined when unparsable.
 */
function isoTimestamp(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  const date = new Date(raw.replace(/\.(\d{3})\d+/, ".$1"));
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

/**
 * Map a status chip ("ONGOING", "Completed", "ON HIATUS", "INACTIVE",
 * "CANCELLED") onto our status values; non-status chips yield undefined.
 */
function mapStatusLabel(text: string): string | undefined {
  const s = text.toLowerCase();
  if (s.includes("ongoing")) return "ongoing";
  if (s.includes("complete")) return "completed";
  if (s.includes("hiatus")) return "hiatus";
  if (s.includes("cancel")) return "cancelled";
  // RR's "INACTIVE" = no update for ~6 months without a stated break;
  // hiatus is the closest reader-facing bucket.
  if (s.includes("inactive")) return "hiatus";
  return undefined;
}

/**
 * Chapter number, e.g. "12" or "12.5". Titles vary wildly on RR
 * ("Chapter 12", "12. The Fall", "Side story 2", plain "Afterword"), so
 * the visible title is tried first and the URL slug
 * (`…/chapter/301778/1-good-morning-brother`, `…/chapter-52-…`) is the
 * fallback. Returns undefined for unnumbered chapters.
 */
function chapterNumber(title: string | undefined, url: string): string | undefined {
  const fromTitle =
    title?.match(/^\s*(?:chapter|ch\.?)\s+(\d+(?:\.\d+)?)/i)?.[1] ??
    title?.match(/^\s*(\d+(?:\.\d+)?)\s*[.:\-–—)]/)?.[1];
  if (fromTitle) return fromTitle;
  const slug = url.split("/").pop() ?? "";
  return slug.match(/^(?:chapter-)?(\d+(?:\.\d+)?)(?:[-.]\D|$)/i)?.[1];
}

export const royalroad: SourceAdapter = {
  id: "royalroad",
  name: "RoyalRoad",
  kind: "novel",
  description:
    "royalroad.com — western web novels & fan fiction (Mother of Learning, The Perfect Run, text reader)",

  async search(query, limit = 24): Promise<SourceSearchResult[]> {
    const results: SourceSearchResult[] = [];
    const seen = new Set<string>();
    const pages = Math.min(Math.max(1, Math.ceil(limit / 20)), MAX_SEARCH_PAGES);

    for (let page = 1; page <= pages && results.length < limit; page++) {
      const suffix = page > 1 ? `&page=${page}` : "";
      const $ = await fetchHtml(
        `/fictions/search?title=${encodeURIComponent(query)}${suffix}`,
      );

      const rows = $(".row.fiction-list-item");
      if (rows.length === 0) break;

      rows.each((_, el) => {
        const row = $(el);
        const titleA = row.find("h2.fiction-title a[href]").first();
        const href = (titleA.attr("href") ?? "").split(/[?#]/)[0];
        // `/fiction/21220/mother-of-learning` → "21220".
        const id = href.match(/^\/fiction\/(\d+)(?:\/|$)/)?.[1];
        const title = squash(titleA.text());
        if (!id || !title || seen.has(id)) return;
        seen.add(id);

        // Type ("Original"/"Fan Fiction") chip doubles as the subtitle;
        // status chips ("ONGOING"…) carry no chapter info and are skipped.
        let subtitle: string | undefined;
        row.find("span.label").each((_, chip) => {
          const text = squash($(chip).text());
          if (mapStatusLabel(text)) return;
          if (/^(original|fan fiction|community)$/i.test(text)) {
            subtitle ??= text;
          }
        });

        // "108 Chapters" stat cell (icon `i.fa-list` in the span's own
        // parent div — scoping to the parent avoids matching the outer
        // .row.stats, which merely contains the icon as a descendant).
        const countSpan = row
          .find("span")
          .filter(
            (_, span) => $(span).parent().find("i.fa-list").length > 0,
          )
          .first();
        const chapterTotal = squash(countSpan.text()).match(/(\d[\d,]*)\s+chapters/i)
          ?.[1]
          ?.replace(/,/g, "");

        const coverA = row.find("figure img").first();
        results.push({
          id,
          title,
          subtitle,
          coverImage: absoluteUrl(
            coverA.attr("src") ?? coverA.attr("data-src"),
          ),
          latestChapter: chapterTotal ? `Ch. ${chapterTotal}` : undefined,
        });
      });

      // A short page means we reached the last one.
      if (rows.length < 20) break;
    }

    return results.slice(0, limit);
  },

  async getManga(id): Promise<SourceManga> {
    // Tolerate both the bare numeric id and a stored "id/slug" composite.
    const fictionId = id.split("/")[0].trim();
    if (!/^\d+$/.test(fictionId)) {
      throw new SourceError(
        `Royal Road: invalid fiction id "${id}" (expected numeric)`,
        SID,
        404,
      );
    }
    const $ = await fetchHtml(`/fiction/${fictionId}`);

    const title =
      squash($(".fic-title h1").first().text()) ||
      squash($('meta[property="og:title"]').attr("content") ?? "").replace(
        /\s*[-|–]\s*Royal Road\s*$/i,
        "",
      );
    if (!title) {
      throw new SourceError(
        `Royal Road: could not parse title for "${id}"`,
        SID,
        502,
      );
    }

    const cover = absoluteUrl(
      $(".cover-art-container img").first().attr("src") ??
        $('meta[property="og:image"]').attr("content"),
    );

    const authors = $(".fic-title h4 a[href^='/profile/']")
      .map((_, a) => squash($(a).text()))
      .get()
      .filter(Boolean);

    // Royal Road's "genres" are its tags.
    const genres = [
      ...new Set(
        $("a.fiction-tag")
          .map((_, t) => squash($(t).text()))
          .get()
          .filter(Boolean),
      ),
    ];

    // Status chip among the header labels ("Original" is the type, not
    // the status — only mapped labels are considered).
    let status: string | undefined;
    $("span.label").each((_, chip) => {
      status ??= mapStatusLabel(squash($(chip).text()));
    });

    // Description lives as <p> blocks behind the "show more" toggle
    // (the content is present server-side; the toggle is pure CSS).
    const descPs = $(".description .hidden-content p")
      .map((_, p) => squash($(p).text()))
      .get()
      .filter(Boolean);
    const description =
      descPs.length > 0
        ? descPs.join("\n")
        : squash($('meta[name="description"]').attr("content") ?? "").replace(
            /\s*\(\.\.\.\)\s*$/,
            "",
          );

    return {
      id: fictionId,
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
    const fictionId = mangaId.split("/")[0].trim();
    if (!/^\d+$/.test(fictionId)) {
      throw new SourceError(
        `Royal Road: invalid fiction id "${mangaId}" (expected numeric)`,
        SID,
        404,
      );
    }
    const $ = await fetchHtml(`/fiction/${fictionId}`);

    // One row per chapter; `data-url` is the canonical chapter path.
    // (The site renders the ENTIRE table server-side — no paging.)
    let rows = $("#chapters tr.chapter-row");
    if (rows.length === 0) rows = $("tr.chapter-row");
    if (rows.length === 0) {
      throw new SourceError(
        `Royal Road: chapter list not found for "${mangaId}"`,
        SID,
        502,
      );
    }

    const chapters: SourceChapter[] = [];
    const seen = new Set<string>();
    rows.each((_, el) => {
      const row = $(el);
      const raw =
        row.attr("data-url") ??
        row.find("td a[href]").first().attr("href") ??
        "";
      const href = raw.split(/[?#]/)[0].replace(/^\/+/, "");
      // Expect `fiction/{fid}/{slug}/chapter/{cid}/{slug}`.
      if (!/^fiction\/\d+\/[^/]+\/chapter\/\d+\//.test(href)) return;
      if (seen.has(href)) return;
      seen.add(href);

      const title =
        squash(row.find("td").first().find("a").first().text()) || undefined;
      const publishedAt = isoTimestamp(
        row.find("time[datetime]").first().attr("datetime"),
      );
      chapters.push({
        id: href,
        number: chapterNumber(title, href),
        title,
        publishedAt,
      });
    });

    if (chapters.length === 0) {
      throw new SourceError(
        `Royal Road: chapter list not found for "${mangaId}"`,
        SID,
        502,
      );
    }

    return chapters;
  },

  /**
   * Novels have no image pages — reading goes through getTextPages().
   * The interface only requires this method to exist; Royal Road
   * chapters are pure prose, so image-page requests are rejected loudly
   * instead of silently returning an empty chapter.
   */
  async getPages(_chapterId): Promise<SourcePage[]> {
    throw new SourceError(
      "Royal Road serves text novels, not image pages",
      SID,
    );
  },

  async getTextPages(chapterId): Promise<string[]> {
    const path = chapterId.startsWith("/") ? chapterId : `/${chapterId}`;
    const $ = await fetchHtml(path);

    // The prose container (verified live: div.chapter-inner.chapter-content).
    let container = $(".chapter-inner.chapter-content").first();
    if (container.length === 0) container = $(".chapter-content").first();
    if (container.length === 0) {
      throw new SourceError(
        `Royal Road: chapter text container not found in "${chapterId}" ` +
          "(markup changed or page blocked)",
        SID,
        502,
      );
    }

    // Ads and embedded widgets live in sibling portlets, but strip them
    // from inside the container too in case an edition injects them …
    container
      .find(
        "script, style, noscript, ins, iframe, form, " +
          "[class*='nitropay'], [id*='nitro'], .advertisement, .ad-container",
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

    // Live markup: clean <p> paragraphs (entities already decoded by cheerio).
    let paragraphs = container
      .find("p")
      .map((_, p) => squash($(p).text()))
      .get()
      .filter(Boolean);

    // Authors often repeat the chapter heading as a short first paragraph
    // (e.g. centered bold "Chapter 001<br>Good Morning Brother"). The
    // reader already shows the chapter title, so drop a heading-shaped
    // opener: among the first two paragraphs, ≤120 chars, starting with
    // a heading keyword, and not ending like a prose sentence.
    const headingRe =
      /^(?:chapter|side\s?story|prologue|epilogue|interlude|afterword)\b/i;
    for (let i = 0; i < Math.min(2, paragraphs.length); i++) {
      const text = paragraphs[i];
      if (text.length > 120 || !headingRe.test(text)) break;
      if (/[.!?]$/.test(text)) break; // prose sentence, keep it
      paragraphs.splice(i, 1);
      break;
    }

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
        `Royal Road: no readable text in "${chapterId}"`,
        SID,
        502,
      );
    }

    return paragraphs;
  },
};
