import "server-only";
import type {
  SourceAdapter,
  SourceChapter,
  SourceManga,
  SourcePage,
  SourceSearchResult,
} from "./types";
import { SourceError, type SourceKind } from "./types";

/**
 * Comix (comix.to) — modern SPA backed by a private JSON API at /api/v1.
 *
 * The API signs every GET with a `_` query token and answers some endpoints
 * encrypted as {"e": "<payload>"}. Both secrets live inside the site's
 * obfuscated apicore-*.js bundle and rotate with each deploy — a hardcoded
 * key extracted in Oct 2026 was retired within weeks ("key_retired").
 *
 * Instead of chasing the scheme, this adapter downloads the bundle the site
 * itself ships and runs it in Node behind a small DOM shim plus a stub
 * XMLHttpRequest whose send() performs the real fetch. Their own request
 * interceptor then signs each call and their response interceptor decrypts
 * payloads — byte-for-byte what the site's own SPA does, and it keeps
 * working across key/build rotations because the current bundle is always
 * the one being executed. If the API rejects a token (403), the bundle is
 * re-downloaded and the call retried once.
 *
 * Their mappers rename response fields (title -> D3, hid -> pn, ...). Those
 * names are literal in their source, so they only change if comix rewrites
 * the mappers themselves.
 *
 * Adapter-local id formats:
 *   - manga id  = comix "hid", the short hash at the head of every title URL,
 *                 e.g. "z0l20" from /title/z0l20-god-level-assassin-...
 *   - chapter id = numeric chapter id, e.g. "11537036" from
 *                 /title/.../11537036-chapter-151
 */

const SITE = "https://comix.to";
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36";

/** All GETs send these; they emulate a clean (devtools-closed) browser. */
const CLEAN_QUERY = { v: "0", w: "0" } as const;

/* ------------------------------------------------------------------ */
/* Mapped response shapes (their mappers' literal output keys)         */
/* ------------------------------------------------------------------ */

/** Raw poster {medium,large} is mapped to {gH: 280px thumb, Qh: full}. */
interface MxPoster {
  gH?: string; // "/images/covers/...@280.jpg"
  Qh?: string; // "/images/covers/....jpg"
}

/** El-mapper output for {id,title}[] lists (genres, authors, ...). */
interface MxNamed {
  Ob?: number | string;
  D3?: string;
}

/** tl() output for the pagination meta block. */
interface MxMeta {
  ub?: number; // total
  Qt?: number; // per_page
  Bz?: number; // current page
  CE?: number; // last_page
}

/** Bl-mapper output for a manga (search item and detail share it). */
interface MxItem {
  WL?: number; // id
  pn?: string; // hid
  D3?: string; // title
  WX?: string; // type ("manga" | "manhwa" | ...)
  sG?: string; // status
  E2?: MxPoster | null; // poster
  S_?: number; // latestChapter
  LT?: string; // synopsis
  Vu?: number; // year
  Fx?: MxNamed[]; // genres
  tr?: MxNamed[]; // authors
  gY?: MxNamed[]; // artists
}

interface MxSearch {
  q7?: MxItem[];
  Bi?: MxMeta;
}

/** ln-mapper output for a chapter row. */
interface MxChapter {
  xu?: number; // id
  XK?: number; // number
  od?: string; // name
  dg?: string; // language
}

interface MxChapters {
  q7?: MxChapter[];
  Bi?: MxMeta;
}

/** Chapter detail = ln row + tM: page list (nn mapper). */
interface MxChapterDetail extends MxChapter {
  tM?: { f6?: string }[]; // f6 = absolute image url
}

/** The two exported services we call; picked dynamically (see pickServices). */
interface ComixEngine {
  f: {
    Cj(query: Record<string, unknown>): Promise<MxSearch>;
    Aq(hid: string): Promise<MxItem>;
    Pr(hid: string, query: Record<string, unknown>): Promise<MxChapters>;
  };
  n: {
    Aq(chapterId: string): Promise<MxChapterDetail>;
  };
}

/* ------------------------------------------------------------------ */
/* DOM shim + stub XHR (installed before importing their bundle)       */
/* ------------------------------------------------------------------ */

const noop = () => {};

function stubElement() {
  return {
    style: {},
    setAttribute: noop,
    getAttribute: () => null,
    appendChild: noop,
    addEventListener: noop,
    removeEventListener: noop,
    click: noop,
    href: "",
    textContent: "",
    innerHTML: "",
    children: [],
    firstChild: null,
  };
}

/**
 * Any unknown property resolves to a callable that returns itself, so their
 * defensive/protection code can call `window.foo()` without exploding.
 */
const universal: unknown = new Proxy(function universalStub() {}, {
  get(_t, p) {
    if (p === Symbol.toPrimitive) return () => "";
    if (p === "toString") return () => "";
    if (p === Symbol.iterator) return function* () {};
    if (p === "then") return undefined;
    return universal;
  },
  apply() {
    return universal;
  },
  construct() {
    return universal as object;
  },
  set() {
    return true;
  },
  has() {
    return true;
  },
});

function installDomStubs() {
  const g = globalThis as Record<string, unknown>;
  if (g.__comixStubs) return;
  g.__comixStubs = true;

  const doc = {
    createElement: stubElement,
    createElementNS: stubElement,
    getElementById: () => null,
    querySelector: () => null,
    querySelectorAll: () => [],
    addEventListener: noop,
    removeEventListener: noop,
    documentElement: stubElement(),
    head: stubElement(),
    body: stubElement(),
    cookie: "",
    visibilityState: "visible",
  };
  const loc = new Proxy(
    {
      href: `${SITE}/`,
      origin: SITE,
      protocol: "https:",
      hostname: "comix.to",
      port: "",
      pathname: "/",
      search: "",
      hash: "",
      assign: noop,
      replace: noop,
      reload: noop,
    },
    { get: (t, p) => (p in t ? (t as Record<string, unknown>)[p as string] : universal) },
  );
  const win = new Proxy(
    { document: doc, location: loc, origin: SITE, self: null, top: null },
    { get: (t, p) => (p in t ? (t as Record<string, unknown>)[p as string] : universal) },
  );

  g.window = win;
  g.self = win;
  g.document = new Proxy(doc, {
    get: (t, p) => (p in t ? (t as Record<string, unknown>)[p as string] : universal),
  });
  g.location = loc;
  g.localStorage = {
    getItem: () => null,
    setItem: noop,
    removeItem: noop,
    clear: noop,
    key: () => null,
    length: 0,
  };
  g.sessionStorage = g.localStorage;
  try {
    Object.defineProperty(g, "navigator", {
      value: { userAgent: UA, language: "en-US", platform: "Win32", languages: ["en-US"] },
      configurable: true,
    });
  } catch {
    /* Node ships a getter-only navigator; leave it if it can't be replaced */
  }
  g.XMLHttpRequest = StubXHR;
}

/**
 * Their axios instance talks to this instead of a browser XHR: open()
 * resolves the (relative) URL, send() does the real fetch, and every
 * response header is forwarded — their decrypt gate reads one of them.
 */
class StubXHR {
  upload = { addEventListener: noop, removeEventListener: noop };
  readyState = 0;
  status = 0;
  response: unknown = null;
  responseText = "";
  responseURL = "";
  timeout = 0;
  withCredentials = false;
  onreadystatechange: (() => void) | null = null;
  onload: (() => void) | null = null;
  onloadend: (() => void) | null = null;
  onerror: ((err: unknown) => void) | null = null;

  private url = "";
  private reqHeaders: Record<string, string> = {};
  private respHeaders: Record<string, string> = {};
  private headerLines = "";

  open(_method: string, url: string) {
    this.url = new URL(url, SITE).href;
  }
  setRequestHeader(key: string, value: string) {
    this.reqHeaders[key] = value;
  }
  getAllResponseHeaders() {
    return this.headerLines;
  }
  getResponseHeader(key: string) {
    return this.respHeaders[key.toLowerCase()] ?? null;
  }
  abort() {}
  addEventListener(event: string, fn: () => void) {
    (this as unknown as Record<string, unknown>)[`on${event}`] = fn;
  }
  removeEventListener() {}

  send() {
    void (async () => {
      const headers: Record<string, string> = {
        "User-Agent": UA,
        Accept: "application/json,*/*",
        Referer: `${SITE}/`,
      };
      for (const [k, v] of Object.entries(this.reqHeaders)) {
        const lk = k.toLowerCase();
        if (lk === "host" || lk === "content-length" || lk === "connection") continue;
        headers[k] = v;
      }
      try {
        const res = await fetch(this.url, {
          headers,
          signal: AbortSignal.timeout(30_000),
        });
        const text = await res.text();
        this.status = res.status;
        this.responseText = text;
        this.response = text;
        this.responseURL = res.url;
        this.respHeaders = {};
        const lines: string[] = [];
        res.headers.forEach((value, key) => {
          this.respHeaders[key.toLowerCase()] = value;
          lines.push(`${key}: ${value}`);
        });
        this.headerLines = lines.join("\r\n") + "\r\n";
      } catch {
        this.status = 0;
        this.responseText = "";
        this.response = "";
      }
      this.readyState = 4;
      this.onreadystatechange?.();
      this.onload?.();
      this.onloadend?.();
    })();
  }
}

/* ------------------------------------------------------------------ */
/* Bundle discovery + loading                                          */
/* ------------------------------------------------------------------ */

async function fetchText(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: { "User-Agent": UA, Accept: "*/*", Referer: `${SITE}/` },
    signal: AbortSignal.timeout(30_000),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.text();
}

/** Relative module specifiers referenced by a chunk (`./x.js`). */
function depSpecs(code: string): string[] {
  const out = new Set<string>();
  for (const m of code.matchAll(/(?:from|import)\s*["'](\.\/[^"']+)["']/g)) out.add(m[1]);
  for (const m of code.matchAll(/import\s*\(\s*["'](\.\/[^"']+)["']\s*\)/g)) out.add(m[1]);
  return [...out];
}

function dataUrl(code: string): string {
  return `data:text/javascript;base64,${Buffer.from(code, "utf8").toString("base64")}`;
}

/** Replace `./name` specifiers with pre-computed data: URLs. */
function rewriteSpecs(code: string, urls: Map<string, string>): string {
  let out = code;
  for (const [name, url] of urls) {
    out = out.split(`"./${name}"`).join(`"${url}"`);
    out = out.split(`'./${name}'`).join(`'${url}'`);
  }
  return out;
}

/**
 * Locate the services by their method sets rather than export names —
 * the export aliases (f, n, ...) are obfuscated and rotate per build.
 * The title service uniquely has Cj+Pr+jr+Aq; the chapter service Aq+gO.
 */
function pickServices(mod: Record<string, unknown>): ComixEngine {
  const objects = Object.values(mod).filter(
    (v): v is Record<string, unknown> => !!v && typeof v === "object",
  );
  const title = objects.find((o) =>
    ["Cj", "Pr", "jr", "Aq"].every((k) => typeof o[k] === "function"),
  );
  const chapter = objects.find((o) =>
    ["Aq", "gO"].every((k) => typeof o[k] === "function"),
  );
  if (!title || !chapter) {
    throw new Error("comix bundle layout changed (services not found)");
  }
  return {
    f: title as unknown as ComixEngine["f"],
    n: chapter as unknown as ComixEngine["n"],
  };
}

interface EngineEntry {
  engine: ComixEngine;
  timers: Array<ReturnType<typeof setInterval>>;
}

/**
 * `new Function` keeps the bundler from trying to analyze the dynamic
 * import of a data: URL.
 */
const dynamicImport = new Function("u", "return import(u)") as (
  u: string,
) => Promise<Record<string, unknown>>;

async function bootstrap(): Promise<EngineEntry> {
  installDomStubs();

  // 1) Homepage → main bundle → apicore chunk name.
  const home = await fetchText(`${SITE}/`);
  const mainSrc =
    home.match(/<script[^>]+src=["']([^"']*main-[^"']+\.js)["']/)?.[1] ??
    home.match(/<script[^>]+src=["']([^"']+\.js)["']/)?.[1];
  if (!mainSrc) throw new Error("comix homepage carries no script bundle");
  const mainUrl = new URL(mainSrc, SITE);
  const main = await fetchText(mainUrl.href);
  const apicoreName =
    main.match(/apicore-[A-Za-z0-9_-]+\.js/)?.[0] ??
    home.match(/apicore-[A-Za-z0-9_-]+\.js/)?.[0];
  if (!apicoreName) throw new Error("could not locate comix apicore chunk");

  // 2) Download the chunk and its dependency closure (usually just a shim).
  const dist = new URL("./", mainUrl);
  const files = new Map<string, string>();
  const queue = [apicoreName];
  while (queue.length) {
    const name = queue.shift()!;
    if (files.has(name)) continue;
    const code = await fetchText(new URL(name, dist).href);
    files.set(name, code);
    for (const spec of depSpecs(code)) {
      const dep = spec.replace(/^\.\//, "");
      if (!files.has(dep)) queue.push(dep);
    }
  }

  // 3) Rewrite relative imports to data: URLs (deepest first) and import.
  const entries = [...files.entries()];
  const urls = new Map<string, string>();
  for (let i = entries.length - 1; i >= 0; i--) {
    const [name, code] = entries[i];
    urls.set(name, dataUrl(rewriteSpecs(code, urls)));
  }
  const entryUrl = urls.get(apicoreName);
  if (!entryUrl) throw new Error("apicore chunk missing after download");

  // Capture their protection intervals so a rebuild can clear them.
  const timers: Array<ReturnType<typeof setInterval>> = [];
  const origSetInterval = globalThis.setInterval;
  globalThis.setInterval = ((...args: Parameters<typeof globalThis.setInterval>) => {
    const id = origSetInterval(...args);
    timers.push(id);
    return id;
  }) as typeof globalThis.setInterval;
  let mod: Record<string, unknown>;
  try {
    mod = await dynamicImport(entryUrl);
  } finally {
    globalThis.setInterval = origSetInterval;
  }

  return { engine: pickServices(mod), timers };
}

const g = globalThis as Record<string, unknown>;
let booting: Promise<EngineEntry> | undefined;

async function getEngine(): Promise<EngineEntry> {
  const cached = g.__comixEngine as EngineEntry | undefined;
  if (cached) return cached;
  if (!booting) {
    booting = bootstrap().then(
      (entry) => {
        g.__comixEngine = entry;
        booting = undefined;
        return entry;
      },
      (err) => {
        booting = undefined;
        throw wrapError(err);
      },
    );
  }
  return booting;
}

async function disposeEngine(): Promise<void> {
  const cached = g.__comixEngine as EngineEntry | undefined;
  if (cached) {
    for (const timer of cached.timers) clearInterval(timer);
    g.__comixEngine = undefined;
  }
  booting = undefined;
}

function wrapError(err: unknown): SourceError {
  if (err instanceof SourceError) return err;
  const msg = err instanceof Error ? err.message : String(err);
  const status = /fetch|unreachable|network|timeout|HTTP 5\d\d/i.test(msg) ? 503 : 502;
  return new SourceError(`Comix failed: ${msg}`, "comix", status);
}

/** Run a service call; on a token rejection (key rotation) rebuild once. */
async function engineCall<T>(fn: (engine: ComixEngine) => Promise<T>): Promise<T> {
  const first = await getEngine();
  try {
    return await fn(first.engine);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (!/status code 403/.test(msg)) throw wrapError(err);
    await disposeEngine(); // bundle's key was retired — fetch the current one
    const reborn = await getEngine();
    try {
      return await fn(reborn.engine);
    } catch (retryErr) {
      throw wrapError(retryErr);
    }
  }
}

/* ------------------------------------------------------------------ */
/* Mappings                                                            */
/* ------------------------------------------------------------------ */

/** Their poster → absolute URL; prefer the 280px thumbnail. */
function cover(poster?: MxPoster | null): string | undefined {
  const path = poster?.gH ?? poster?.Qh;
  return path ? new URL(path, SITE).href : undefined;
}

/** comix status strings -> our vocabulary. */
function mapStatus(status?: string): string | undefined {
  switch (status) {
    case "releasing": return "ongoing";
    case "finished":
    case "completed": return "completed";
    case "on_hiatus": return "hiatus";
    case "cancelled": return "cancelled";
    default: return status;
  }
}

function mapKind(type?: string): SourceKind {
  if (type === "novel") return "novel";
  if (type === "manhwa" || type === "manhua") return "manhwa";
  return "manga";
}

/* ------------------------------------------------------------------ */
/* Adapter                                                             */
/* ------------------------------------------------------------------ */

export const comix: SourceAdapter = {
  id: "comix",
  name: "Comix",
  kind: "manga",
  description: "Fast aggregator catalog — manhwa, manhua, manga & novels",

  async search(query, limit = 24): Promise<SourceSearchResult[]> {
    const data = await engineCall((e) =>
      e.f.Cj({ keyword: query, ...CLEAN_QUERY }),
    );
    return (data.q7 ?? []).slice(0, limit).map((m) => ({
      id: m.pn ?? "",
      title: m.D3 ?? "",
      coverImage: cover(m.E2),
      latestChapter: m.S_ ? `Ch. ${m.S_}` : undefined,
    }));
  },

  async getManga(id): Promise<SourceManga> {
    const m = await engineCall((e) => e.f.Aq(encodeURIComponent(id)));
    const named = (rows?: MxNamed[]) =>
      [...new Set((rows ?? []).map((r) => r.D3).filter((x): x is string => !!x))];
    const authors = named(m.tr);
    // fall back to artists when no authors are listed
    const credits = authors.length ? authors : named(m.gY);

    return {
      id: m.pn ?? id,
      title: m.D3 ?? "",
      description: m.LT ?? "",
      coverImage: cover(m.E2),
      genres: named(m.Fx),
      status: mapStatus(m.sG),
      authors: credits,
      year: m.Vu,
      kind: mapKind(m.WX),
    };
  },

  async getChapters(mangaId): Promise<SourceChapter[]> {
    const hid = encodeURIComponent(mangaId);
    const chapters: MxChapter[] = [];
    const maxPages = 60;

    for (let page = 1; page <= maxPages; page++) {
      const data = await engineCall((e) =>
        e.f.Pr(hid, { page, ...CLEAN_QUERY }),
      );
      const items = data.q7 ?? [];
      chapters.push(...items);

      const lastPage = data.Bi?.CE;
      if (lastPage ? page >= lastPage : items.length === 0) break;
    }

    // Multiple groups/languages can upload the same chapter; prefer English
    // when any exists, and one entry per chapter number (lowest id = earliest).
    const mapped = chapters.map((c) => ({
      id: c.xu ?? 0,
      number: c.XK ?? 0,
      name: c.od,
      language: c.dg,
    }));
    const english = mapped.filter((c) => (c.language ?? "en") === "en");
    const pool = english.length ? english : mapped;
    const best = new Map<number, (typeof pool)[number]>();
    for (const c of pool) {
      const prev = best.get(c.number);
      if (!prev || c.id < prev.id) best.set(c.number, c);
    }

    return [...best.values()]
      .sort((a, b) => a.number - b.number || a.id - b.id)
      .map((c) => ({
        id: String(c.id),
        number: String(c.number),
        title: c.name?.trim() || undefined,
      }));
  },

  async getPages(chapterId): Promise<SourcePage[]> {
    const detail = await engineCall((e) =>
      e.n.Aq(encodeURIComponent(chapterId)),
    );
    const items = (detail.tM ?? [])
      .map((p) => ({ url: p.f6 }))
      .filter((p): p is { url: string } => !!p.url);
    if (items.length === 0) {
      throw new SourceError(`Comix returned no pages for chapter ${chapterId}`, "comix");
    }
    // urls are absolute on comix's image mirrors.
    return items;
  },
};
