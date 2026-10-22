import "server-only";
import vm from "node:vm";
import * as cheerio from "cheerio";
import type {
  SourceAdapter,
  SourceChapter,
  SourceManga,
  SourcePage,
  SourceSearchResult,
} from "./types";
import { SourceError, type SourceKind } from "./types";

/**
 * MangaFire (mangafire.to) — huge manga/manhwa/manhua catalog.
 *
 * Since late 2025 MangaFire is a fully client-rendered SPA: every HTML
 * route serves the same empty shell, so there is nothing to cheerio-scrape
 * except the boot page. All content flows through a JSON API under `/api`:
 *
 *   GET /api/titles?keyword=…&order[relevance]=desc&page=1&limit=24&vrf=…
 *   GET /api/titles/{id}?vrf=…
 *   GET /api/titles/{id}/chapters?language=en&sort=number&order=asc&limit=200&page=N&vrf=…
 *   GET /api/chapters/{chapterId}?vrf=…
 *
 * Every call must carry a `vrf` query parameter: an anti-scraping token
 * produced by the site's obfuscated JS "polyfill" bundle
 * (https://s.mfcdn.nl/build/mf/assets/polyfill-*.js). The bundle is a
 * VM-obfuscated script whose decryption key is derived from the JS engine
 * fingerprint (lengths of builtins) plus `navigator.appCodeName` — values
 * that are identical in real browsers and in Node, so we can execute the
 * bundle unmodified inside an isolated `node:vm` context with light DOM
 * shims and ask it to sign our requests exactly like the real SPA does
 * (it registers an axios request interceptor via `extendClient`). The
 * token is deterministic per site build; if the site ships a new build
 * the engine re-bootstraps itself automatically on the first 403.
 *
 * Adapter-local ids:
 *   manga id    = the site's public "hid" — the short slug prefix from the
 *                 title URL, e.g. `lrmyz` in /title/lrmyz-solo-leveling.
 *   chapter id  = the numeric chapter id as a decimal string, e.g. "4409471"
 *                 (same id the reader URL /title/{manga}/chapter/{id} uses).
 */

const BASE = "https://mangafire.to";

/** Browser UA — the API and image CDN check it. */
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

/** Be polite: serialize requests with a ~1s gap (personal-use reader). */
const REQUEST_GAP_MS = 1100;

/* ------------------------------------------------------------------ */
/* API payload shapes (as observed live on mangafire.to, Oct 2026)      */
/* ------------------------------------------------------------------ */

interface MfPoster {
  small?: string;
  medium?: string;
  large?: string;
}

/** `{ id, title }` refs are used for genres/authors/etc. */
interface MfNamedRef {
  id?: number;
  title?: string;
}

interface MfSearchItem {
  hid: string;
  slug: string;
  title: string;
  type: string;
  status?: string;
  poster?: MfPoster;
  latestChapter?: number;
  url: string;
}

interface MfTitleDetail extends MfSearchItem {
  synopsisHtml?: string;
  altTitles?: string[];
  year?: number;
  genres?: MfNamedRef[];
  themes?: MfNamedRef[];
  demographics?: MfNamedRef[];
  authors?: MfNamedRef[];
  artists?: MfNamedRef[];
}

interface MfChapterItem {
  id: number;
  number: number;
  name?: string;
  language?: string;
  /** "official" | "unofficial" — both may exist for the same number. */
  type?: string;
  /** Unix seconds. */
  createdAt?: number;
}

interface MfChaptersResponse {
  items: MfChapterItem[];
  meta?: { total?: number; lastPage?: number };
}

interface MfChapterDetail {
  pages?: { url: string; width?: number; height?: number }[];
  title?: { hid?: string };
}

/* ------------------------------------------------------------------ */
/* Token engine — runs the site's own polyfill in a node:vm sandbox     */
/* ------------------------------------------------------------------ */

interface SignedRequestConfig {
  params: Record<string, unknown>;
}

type RequestInterceptor = (config: {
  baseURL: string;
  method: string;
  url: string;
  headers: Record<string, string>;
  params: Record<string, unknown>;
}) => SignedRequestConfig | Promise<SignedRequestConfig>;

interface TokenEngine {
  /** The site build the token was computed for (changes on deploys). */
  build: string;
  /** Returns request params including `vrf` for GET `url` with `params`. */
  sign(url: string, params: Record<string, unknown>): Promise<Record<string, unknown>>;
}

let enginePromise: Promise<TokenEngine> | null = null;

function getEngine(): Promise<TokenEngine> {
  if (!enginePromise) {
    enginePromise = createEngine().catch((err) => {
      enginePromise = null; // allow retry on next call
      throw err;
    });
  }
  return enginePromise;
}

/** Force a fresh polyfill boot (used when the site ships a new build). */
function resetEngine(): void {
  enginePromise = null;
}

async function fetchText(url: string): Promise<string> {
  let res: Response;
  try {
    res = await fetch(url, {
      headers: { "User-Agent": UA, Accept: "*/*" },
      cache: "no-store",
    });
  } catch (err) {
    throw new SourceError(`MangaFire unreachable: ${err}`, "mangafire", 503);
  }
  if (!res.ok) {
    throw new SourceError(`MangaFire responded ${res.status} for ${url}`, "mangafire", 502);
  }
  return res.text();
}

/**
 * Minimal DOM shims so the polyfill's anti-devtool boilerplate is inert.
 * The token math itself only needs the engine fingerprint (standard
 * builtin `.length`s), `navigator.appCodeName` and `window.__config`.
 */
function buildSandbox(config: string, build: string): vm.Context {
  const element = () => ({
    style: {},
    setAttribute() {},
    getAttribute() {
      return null;
    },
    appendChild() {},
    remove() {},
    addEventListener() {},
    getBoundingClientRect() {
      return {};
    },
  });
  const storage = () => ({
    getItem: () => null,
    setItem() {},
    removeItem() {},
    clear() {},
    key: () => null,
    length: 0,
  });

  const sandbox: Record<string, unknown> = {
    // Web APIs the VM's string decoder uses (absent from node:vm contexts).
    TextEncoder,
    TextDecoder,
    atob,
    btoa,
    URL,
    URLSearchParams,
    crypto: globalThis.crypto,
    performance: { now: () => Date.now() },
    // Real timers for one-shot callbacks; interval stub keeps the process
    // alive-free (DisableDevtool starts interval watchers we don't need).
    setTimeout,
    clearTimeout,
    setInterval: () => 0,
    clearInterval: () => {},
    queueMicrotask: (fn: () => void) => queueMicrotask(fn),
    console: { log() {}, info() {}, warn() {}, error() {}, debug() {}, trace() {} },
    navigator: {
      userAgent: UA,
      appCodeName: "Mozilla", // part of the decrypt key — must match browsers
      language: "en-US",
      languages: ["en-US"],
      platform: "Win32",
      maxTouchPoints: 0,
      webdriver: false,
      cookieEnabled: true,
    },
    document: {
      readyState: "complete",
      visibilityState: "visible",
      hidden: false,
      createElement: element,
      head: { appendChild() {}, removeChild() {} },
      body: { appendChild() {}, removeChild() {} },
      cookie: "",
      querySelector: () => null,
      querySelectorAll: () => [],
      getElementsByTagName: () => [],
      addEventListener() {},
      removeEventListener() {},
      write() {},
    },
    localStorage: storage(),
    sessionStorage: storage(),
    matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {}, media: "" }),
    requestAnimationFrame: (cb: (t: number) => void) => setTimeout(() => cb(Date.now()), 16),
    cancelAnimationFrame: (id: ReturnType<typeof setTimeout>) => clearTimeout(id),
    MutationObserver: class { observe() {} disconnect() {} takeRecords() { return []; } },
    IntersectionObserver: class { observe() {} disconnect() {} unobserve() {} takeRecords() { return []; } },
    ResizeObserver: class { observe() {} disconnect() {} unobserve() {} },
    CustomEvent: class { type: string; constructor(type: string, init?: object) { this.type = type; Object.assign(this, init); } },
    Event: class { type: string; constructor(type: string) { this.type = type; } },
    addEventListener() {},
    removeEventListener() {},
    innerWidth: 1280,
    innerHeight: 800,
    isSecureContext: true,
    // Boot values the polyfill reads (window.__config / window.__build).
    __config: config,
    __build: build,
    __theme: {},
  };
  sandbox.window = sandbox;
  sandbox.self = sandbox;
  return vm.createContext(sandbox);
}

async function createEngine(): Promise<TokenEngine> {
  // 1) Boot page carries the config token, build hash and polyfill URL.
  const html = await fetchText(`${BASE}/`);
  const $ = cheerio.load(html);
  let config: string | undefined;
  let build: string | undefined;
  $("script").each((_, el) => {
    const src = $(el).html() ?? "";
    config ??= src.match(/window\.__config\s*=\s*"([^"]+)"/)?.[1];
    build ??= src.match(/window\.__build\s*=\s*"([^"]+)"/)?.[1];
  });
  const polyfillUrl =
    $('link[rel="modulepreload"]')
      .toArray()
      .map((el) => $(el).attr("href"))
      .find((href) => !!href && href.includes("/polyfill-")) ??
    html.match(/https:\/\/[^"']+\/polyfill-[^"']+\.js/)?.[0];
  if (!config || !build || !polyfillUrl) {
    throw new SourceError(
      "MangaFire boot page changed — could not locate config/build/polyfill",
      "mangafire",
      502,
    );
  }

  // 2) Download the polyfill bundle and execute it in an isolated context.
  const code = (await fetchText(polyfillUrl)).replace(/export\s*\{[^}]*\}\s*;?\s*$/, "");
  const ctx = buildSandbox(config, build);
  try {
    vm.runInContext(code, ctx, { filename: "mangafire-polyfill.js", timeout: 15_000 });
  } catch (err) {
    throw new SourceError(`MangaFire polyfill failed to boot: ${err}`, "mangafire", 502);
  }

  // 3) The polyfill exposes `extendClient`, which installs an axios request
  //    interceptor that appends the `vrf` token. Feed it a stub client and
  //    keep the interceptor for signing our own requests.
  const install = vm.runInContext(
    "typeof extendClient === 'function' ? extendClient : null",
    ctx,
  ) as ((client: unknown) => void) | null;
  if (!install) {
    throw new SourceError("MangaFire polyfill did not expose extendClient", "mangafire", 502);
  }
  let interceptor: RequestInterceptor | null = null;
  install({
    interceptors: {
      request: {
        use: (fn: RequestInterceptor) => {
          interceptor = fn;
        },
      },
    },
  });
  if (!interceptor) {
    throw new SourceError("MangaFire token interceptor missing", "mangafire", 502);
  }
  const sign: TokenEngine["sign"] = async (url, params) => {
    const signed = await interceptor!({
      baseURL: "/api",
      method: "get",
      url,
      headers: {},
      params: { ...params },
    });
    return signed.params;
  };
  return { build, sign };
}

/* ------------------------------------------------------------------ */
/* Request plumbing: throttle + sign + fetch                           */
/* ------------------------------------------------------------------ */

/** Serialize all outgoing requests with a minimum gap between them. */
let lastRequestAt = 0;
let throttleChain: Promise<void> = Promise.resolve();
function throttle(): Promise<void> {
  throttleChain = throttleChain.then(async () => {
    const wait = lastRequestAt + REQUEST_GAP_MS - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    lastRequestAt = Date.now();
  });
  return throttleChain;
}

/** Axios-compatible serializer: arrays -> `k[]=v`, objects -> `k[sub]=v`. */
function serializeParams(params: Record<string, unknown>): string {
  const qs = new URLSearchParams();
  const add = (key: string, value: unknown): void => {
    if (Array.isArray(value)) {
      value.forEach((v) => qs.append(`${key}[]`, String(v)));
    } else if (value !== null && typeof value === "object") {
      Object.entries(value as Record<string, unknown>).forEach(([k2, v2]) =>
        qs.append(`${key}[${k2}]`, String(v2)),
      );
    } else if (value !== undefined && value !== null) {
      qs.append(key, String(value));
    }
  };
  Object.entries(params).forEach(([k, v]) => add(k, v));
  return qs.toString();
}

async function apiGet<T>(path: string, params: Record<string, unknown> = {}): Promise<T> {
  // On a 403 the site probably shipped a new build — reboot the token
  // engine once and retry with freshly signed params.
  for (let attempt = 0; attempt < 2; attempt++) {
    await throttle();
    const engine = await getEngine();
    const signed = await engine.sign(path, params);
    const url = `${BASE}/api${path}?${serializeParams(signed)}`;

    let res: Response;
    try {
      res = await fetch(url, {
        headers: {
          "User-Agent": UA,
          Accept: "application/json, text/plain, */*",
          // The API checks these two, same as the SPA's axios instance.
          "X-Requested-With": "XMLHttpRequest",
          Referer: `${BASE}/`,
        },
        cache: "no-store",
      });
    } catch (err) {
      throw new SourceError(`MangaFire unreachable: ${err}`, "mangafire", 503);
    }

    if (res.status === 403 && attempt === 0) {
      resetEngine(); // stale build token — re-bootstrap and retry once
      continue;
    }
    if (res.status === 404) {
      throw new SourceError(`MangaFire: not found (${path})`, "mangafire", 404);
    }
    if (!res.ok) {
      throw new SourceError(`MangaFire responded ${res.status} for ${path}`, "mangafire", 502);
    }
    try {
      return (await res.json()) as T;
    } catch {
      throw new SourceError(`MangaFire returned invalid JSON for ${path}`, "mangafire", 502);
    }
  }
  throw new SourceError(`MangaFire request failed after retry (${path})`, "mangafire", 502);
}

/* ------------------------------------------------------------------ */
/* Field mapping helpers                                               */
/* ------------------------------------------------------------------ */

const STATUS_MAP: Record<string, SourceManga["status"]> = {
  releasing: "ongoing",
  ongoing: "ongoing",
  finished: "completed",
  completed: "completed",
  hiatus: "hiatus",
  cancelled: "cancelled",
};

function mapKind(type: string | undefined): SourceKind {
  if (type === "manhwa" || type === "manhua") return "manhwa";
  if (type === "novel") return "novel";
  return "manga";
}

function refNames(refs?: MfNamedRef[]): string[] {
  return (refs ?? [])
    .map((r) => r?.title?.trim() ?? "")
    .filter(Boolean);
}

/** Plain text from the API's `synopsisHtml` (cheerio, collapsing whitespace). */
function htmlToText(html?: string): string {
  if (!html) return "";
  const $ = cheerio.load(`<div>${html}</div>`);
  return $("div").text().replace(/\s+/g, " ").trim();
}

/* ------------------------------------------------------------------ */
/* Adapter                                                             */
/* ------------------------------------------------------------------ */

export const mangafire: SourceAdapter = {
  id: "mangafire",
  name: "MangaFire",
  kind: "manga",
  description: "MangaFire (mangafire.to) — manga, manhwa & manhua via the SPA JSON API",

  async search(query, limit = 24): Promise<SourceSearchResult[]> {
    const perPage = Math.min(Math.max(limit, 1), 50);
    const body = await apiGet<{ items?: MfSearchItem[] }>("/titles", {
      keyword: query,
      order: { relevance: "desc" },
      page: 1,
      limit: perPage,
    });
    return (body.items ?? []).slice(0, limit).map((item) => ({
      id: item.hid,
      title: item.title,
      coverImage: item.poster?.medium ?? item.poster?.small,
      latestChapter: item.latestChapter != null ? `Ch. ${item.latestChapter}` : undefined,
      subtitle: item.type || undefined,
    }));
  },

  async getManga(id): Promise<SourceManga> {
    const body = await apiGet<{ data?: MfTitleDetail }>(`/titles/${encodeURIComponent(id)}`);
    const t = body.data;
    if (!t) throw new SourceError(`MangaFire: title "${id}" not found`, "mangafire", 404);

    const authors = [...refNames(t.authors), ...refNames(t.artists)];
    return {
      id: t.hid,
      title: t.title,
      description: htmlToText(t.synopsisHtml),
      coverImage: t.poster?.large ?? t.poster?.medium,
      genres: [...new Set([...refNames(t.genres), ...refNames(t.themes), ...refNames(t.demographics)])],
      status: t.status ? (STATUS_MAP[t.status] ?? t.status) : undefined,
      authors: [...new Set(authors)],
      year: t.year,
      kind: mapKind(t.type),
    };
  },

  async getChapters(mangaId): Promise<SourceChapter[]> {
    const chapters: SourceChapter[] = [];
    // English is the API default; numbers sort ascending with pagination
    // (limit is capped at 200 server-side).
    let page = 1;
    let lastPage = 1;
    do {
      const body = await apiGet<MfChaptersResponse>(
        `/titles/${encodeURIComponent(mangaId)}/chapters`,
        { language: "en", sort: "number", order: "asc", limit: 200, page },
      );
      for (const c of body.items ?? []) {
        chapters.push({
          id: String(c.id),
          number: String(c.number),
          // Official and fan translations share a number — both are kept
          // (the site badges them; name is often empty for official ones).
          title: c.name?.trim() || undefined,
          publishedAt: c.createdAt
            ? new Date(c.createdAt * 1000).toISOString()
            : undefined,
        });
      }
      lastPage = body.meta?.lastPage ?? page;
      page++;
    } while (page <= lastPage && page <= 50);

    return chapters;
  },

  async getPages(chapterId): Promise<SourcePage[]> {
    const body = await apiGet<{ data?: MfChapterDetail }>(
      `/chapters/${encodeURIComponent(chapterId)}`,
    );
    const pages = body.data?.pages ?? [];
    if (pages.length === 0) {
      throw new SourceError(
        `MangaFire: no pages for chapter "${chapterId}"`,
        "mangafire",
        404,
      );
    }
    // The image CDN (mfcdn*.xyz) hotlink-blocks requests without a
    // mangafire.to Referer — pages carry it explicitly.
    return pages.map((p) => ({ url: p.url, headers: { Referer: `${BASE}/` } }));
  },
};
