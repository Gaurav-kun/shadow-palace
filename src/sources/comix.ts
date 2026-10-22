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
 * The API is the same one the site's own frontend uses, but every GET to a
 * /manga or /chapters route must carry a `_` request token: the site's
 * obfuscated bundle (apicore-*.js) ships a static 1088-byte key and signs
 * each request as
 *
 *   _ = "85c." + base64url(HMAC-ish SHA-256(key, "/<path>?<raw query>")).slice(0, 16)
 *
 * where the SHA-256 is standard HMAC-SHA256 with block size 64, re-implemented
 * here directly (see signToken). Chapter-list and reader responses come back
 * encrypted as {"e": base64url} and are decrypted with an XOR keystream built
 * from key bytes 64..1088 (see decryptPayload). Both schemes were verified
 * byte-for-byte against the live site in Oct 2026.
 *
 * Adapter-local id formats:
 *   - manga id  = comix "hid", the short hash at the head of every title URL,
 *                 e.g. "z0l20" from /title/z0l20-god-level-assassin-...
 *   - chapter id = numeric chapter id, e.g. "11537036" from
 *                 /title/.../11537036-chapter-151
 */

const API = "https://comix.to/api/v1";
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

/** All GETs send these; they emulate a clean (devtools-closed) browser. */
const CLEAN_QUERY = { v: "0", w: "0" } as const;

/** comix.to's request-token key id (token = KEY_ID + "." + digest). */
const KEY_ID = "85c";

/** Static signing/decryption key shipped in comix.to's frontend bundle (1088 bytes). */
const KEY_B64 =
  "XpOShWwheTHIkGXidFSTL1oYMgvi2hpjl1PmEYPEjPNTLjF9jRFsQ5Jg+Cdd45T89AiXh68Q+5vLUMDXw4Ux0OdmeMnc4vHwQu11IpyErPIEU3shaUrMIdeL+PNPMWewy6Lt6iteudqvU2Nfy2hzXXKvY6JZZ2NGvyAeVu1RbyHP9kUpvQ61cKR5dhn3abmAucrq2ajCzueN7PyZjOkpwK3Chf24u56USGDjFBnyar/QJFJ11PryI8funXGc0xlaBYVDF2WSWgFr2zD8cwlk72ksb1mj/oNqeEb5aUnfRe1dAwCLC2Z+QnpnqafT7x5M6rAyZo6FE7+q8gazMsyvfQn/FoBCCoNhewm8Uk+w3Ek5gQ+2yCD739lNnuUc6XiYryZAq1YuPEzpfLixikUjlnFRAR4mcL5AAUAXHrVaiIgQKPhBkC2SR1pcuTxcWLFSAogQT+pbKJadJVfISDf/Uh+zxSzfeHH/NaJSHNnY1HqpCGTPILoPzdf9aWFrYZsBUgRKawfRcp4SpNIgVEkoPqFc0KgcuDOS+FuU7pkvx7/SOS3JQgSKygHNr0YjM7pPwUWKPu57zdA+Deoi4ihu24R9kuiEOYoGwZwQbeOedKkDyCaRKY9hnWNBoo+vzOSV5Sa+melsSSmHWt6INmk7hUMptAZUGe/FhO/RW2jdJAXQM6R1FTX8MN2zE0JJlXs8wlhdRu36YtlvwKkQOUVnX1vUJYlmh8Xn9zKZ7jSWrpCNwlMBl0Cl6vgSDo7FZEsgCvkhIkQ2VxvmS51gRCjZVm2O0buoUt8Xco2mMdBRLcpwBxQ58Uq+v/EZMtDof8fV5EH3wYn+VcdskO7KArnmi99kYvweLfyKsjlIw/PI0yh/aYIrZSJp2Ati2MjsqInLjSXc8LRuOO37i8DWVrs6Jet+/k8oxDK/BbgUmFFGfdPHmEgx2eXV3XDrkNXupUpsQo2reFvKHldU11aPlhkgGxcm5cAP6O7ohThAGgTB3FHbOadcJpw4Dpw+e5gEKIOBXIdEaZm/7XjwQqBcK8g+BKOQEMaB+FtQc7s2SxUilnh/HRYP9OMiuf5TE5JboAw9WXYoNHlvaMpv0rOYwRI04YsaWLvGJg9Lg3s2zJa22p1HTV5EjKsXf8dZamM/IcHWN+pVPbFh9GVVilAUoCF9pRP+xPuLg08eSzaM/JwDBz4eXFZRc6cg3cJBA/jB0BX0S9y2sl0bPlGJJNgvte0DWsKsb+Ae3IM6QCyf+n29TjNuqJWfzkLjPi8G3DqhVlQR6n7cuu6ljR0jaC/qR70KzPHAiqtmjcqHekLucowiOkknHLl630AybcGjixdxpYlBr22UFnl8Ac3vfN7ncNZ5ek7X4QXyovT3im9B0i1ltpfGeap6hOPtHCUdxCvQdqrTGqSuK+fdgLgIoc8fgW0YOZ2z4eyG6IdzEXjtKAzF7kM=";

let keyBytes: Uint8Array | null = null;
function key(): Uint8Array {
  // Buffer is available in the Next.js server runtime (this module is server-only).
  return (keyBytes ??= new Uint8Array(Buffer.from(KEY_B64, "base64")));
}

// ---------------------------------------------------------------------------
// Request signing: HMAC-SHA256(key, input) using the site's construction —
// SHA-256 compression started directly from the key's first 64 bytes as the
// inner/outer states (equivalent to HMAC with pre-hashed ipad/opad blocks).
// ---------------------------------------------------------------------------

const SHA_K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

const rotr = (x: number, n: number): number => (x >>> n) | (x << (32 - n));

/** SHA-256 compression continued from a preloaded 8-word state; lenOffset = bytes already "hashed". */
function sha256Continue(state: Uint32Array, data: Uint8Array, lenOffset: number): Uint32Array {
  const st = Uint32Array.from(state);
  const total = lenOffset + data.length;
  let padded = data.length + 1;
  while (padded % 64 !== 56) padded++;
  const buf = new Uint8Array(padded + 8);
  buf.set(data);
  buf[data.length] = 0x80;
  const bits = 8 * total;
  const hi = Math.floor(bits / 4294967296);
  const lo = bits >>> 0;
  const s = buf.length - 8;
  buf[s] = hi >>> 24 & 255; buf[s + 1] = hi >>> 16 & 255; buf[s + 2] = hi >>> 8 & 255; buf[s + 3] = hi & 255;
  buf[s + 4] = lo >>> 24 & 255; buf[s + 5] = lo >>> 16 & 255; buf[s + 6] = lo >>> 8 & 255; buf[s + 7] = lo & 255;

  const w = new Uint32Array(64);
  for (let off = 0; off < buf.length; off += 64) {
    for (let t = 0; t < 16; t++) {
      const p = off + 4 * t;
      w[t] = buf[p] << 24 | buf[p + 1] << 16 | buf[p + 2] << 8 | buf[p + 3];
    }
    for (let t = 16; t < 64; t++) {
      const s0 = rotr(w[t - 15], 7) ^ rotr(w[t - 15], 18) ^ (w[t - 15] >>> 3);
      const s1 = rotr(w[t - 2], 17) ^ rotr(w[t - 2], 19) ^ (w[t - 2] >>> 10);
      w[t] = (w[t - 16] + s0 + w[t - 7] + s1) | 0;
    }
    let [a, b, c, d, e, f, g, h] = st;
    for (let t = 0; t < 64; t++) {
      const s1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const ch = (e & f) ^ (~e & g);
      const t1 = (h + s1 + ch + SHA_K[t] + w[t]) | 0;
      const s0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const t2 = (s0 + maj) | 0;
      h = g; g = f; f = e; e = (d + t1) | 0; d = c; c = b; b = a; a = (t1 + t2) | 0;
    }
    st[0] = (st[0] + a) | 0; st[1] = (st[1] + b) | 0; st[2] = (st[2] + c) | 0; st[3] = (st[3] + d) | 0;
    st[4] = (st[4] + e) | 0; st[5] = (st[5] + f) | 0; st[6] = (st[6] + g) | 0; st[7] = (st[7] + h) | 0;
  }
  return st;
}

function stateFrom(bytes: Uint8Array): Uint32Array {
  const st = new Uint32Array(8);
  for (let i = 0; i < 8; i++) {
    st[i] = bytes[4 * i] << 24 | bytes[4 * i + 1] << 16 | bytes[4 * i + 2] << 8 | bytes[4 * i + 3];
  }
  return st;
}

function stateToBytes(st: Uint32Array): Uint8Array {
  const out = new Uint8Array(32);
  for (let i = 0; i < 8; i++) {
    out[4 * i] = st[i] >>> 24 & 255;
    out[4 * i + 1] = st[i] >>> 16 & 255;
    out[4 * i + 2] = st[i] >>> 8 & 255;
    out[4 * i + 3] = st[i] & 255;
  }
  return out;
}

const B64URL = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
function base64url(bytes: Uint8Array): string {
  let out = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const l = bytes[i];
    const m = bytes[i + 1];
    const r = bytes[i + 2];
    out += B64URL[l >> 2] + B64URL[((3 & l) << 4) | (m >> 4)];
    if (i + 1 < bytes.length) out += B64URL[((15 & m) << 2) | (r >> 6)];
    if (i + 2 < bytes.length) out += B64URL[63 & r];
  }
  return out;
}

/** "<keyId>.<16 chars of base64url HMAC>" — the `_` query param /manga and /chapters GETs require. */
function signToken(input: string): string {
  const k = key();
  const inner = sha256Continue(stateFrom(k.subarray(0, 32)), new TextEncoder().encode(input), 64);
  const outer = sha256Continue(stateFrom(k.subarray(32, 64)), stateToBytes(inner), 64);
  return `${KEY_ID}.${base64url(stateToBytes(outer)).slice(0, 16)}`;
}

// ---------------------------------------------------------------------------
// Response decryption: chapter list / reader endpoints answer {"e": "<b64url>"}.
// Keystream = key bytes 64..1088 rotated by the seed in the first two cipher
// bytes; JSON starts at plaintext byte 2.
// ---------------------------------------------------------------------------

function decryptPayload(e: string): unknown {
  const data = new Uint8Array(Buffer.from(e, "base64url"));
  if (data.length < 4) throw new SourceError("comix.to returned a truncated payload", "comix");
  const seed = (data[0] << 8 | data[1]) % 1024;
  const k = key();
  for (let u = 2; u < data.length; u++) {
    data[u] = data[u] ^ k[64 + ((u - 2 + seed) % 1024)];
  }
  const text = new TextDecoder().decode(data.subarray(2));
  try {
    return JSON.parse(text);
  } catch {
    // Their parser stops at the end of the JSON document; tolerate trailing bytes.
    const end = text.lastIndexOf("}");
    if (end !== -1) return JSON.parse(text.slice(0, end + 1));
    throw new SourceError("comix.to response could not be decrypted (site may have changed)", "comix");
  }
}

// ---------------------------------------------------------------------------
// API plumbing
// ---------------------------------------------------------------------------

interface ComixResult<T> {
  status?: string;
  result?: T;
  message?: string;
}

async function apiGet<T>(path: string, query: Record<string, string | number> = {}): Promise<T> {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) params.set(k, String(v));

  // The signature covers the query with raw (decoded) values, in send order,
  // exactly like the site's own serializer. `_` itself is never signed.
  const raw = [...params.entries()].map(([k, v]) => `${k}=${v}`).join("&");
  const token = signToken(raw ? `${path}?${raw}` : path);
  params.append("_", token);

  let res: Response;
  try {
    res = await fetch(`${API}${path}?${params}`, {
      headers: {
        "User-Agent": UA,
        Accept: "application/json",
        "Accept-Language": "en-US,en;q=0.5",
      },
      cache: "no-store",
    });
  } catch (err) {
    throw new SourceError(`Comix unreachable: ${err}`, "comix", 503);
  }

  const bodyText = await res.text();
  if (!res.ok) {
    let message = `HTTP ${res.status}`;
    try {
      const err = JSON.parse(bodyText) as { message?: string; code?: string };
      if (err.code === "missing_token" || err.code === "invalid_token") {
        message =
          "comix.to rejected its request token — the site frontend may have rotated its signing key";
      } else if (err.message) {
        message = err.message;
      }
    } catch { /* keep generic message */ }
    throw new SourceError(`Comix responded ${res.status}: ${message}`, "comix", res.status === 404 ? 404 : 502);
  }

  let parsed: ComixResult<T>;
  try {
    const json = JSON.parse(bodyText) as ComixResult<T> & { e?: string };
    parsed = typeof json.e === "string" ? (decryptPayload(json.e) as ComixResult<T>) : json;
  } catch (err) {
    if (err instanceof SourceError) throw err;
    throw new SourceError("Comix returned an unexpected payload", "comix");
  }
  if (!parsed.result) {
    throw new SourceError(`Comix API missing result: ${parsed.message ?? "unknown error"}`, "comix");
  }
  return parsed.result;
}

// --- API shapes (fields we use) -------------------------------------------

interface ComixPoster { medium?: string; large?: string }
interface ComixManga {
  hid: string;
  title: string;
  synopsis?: string;
  type?: string;
  status?: string;
  year?: number;
  poster?: ComixPoster;
  latestChapter?: number;
  genres?: { title: string }[];
  authors?: { title: string }[];
  artists?: { title: string }[];
}
interface ComixSearch { items: ComixManga[] }
interface ComixChapter {
  id: number;
  number: number;
  name?: string;
  language?: string;
}
interface ComixChapters {
  items: ComixChapter[];
  meta?: { last_page?: number };
  pagination?: { last_page?: number };
}
interface ComixChapterDetail {
  pages?: { items?: { url: string }[] };
}

// --- mappings --------------------------------------------------------------

function coverUrl(poster?: ComixPoster): string | undefined {
  return poster?.large ?? poster?.medium;
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

export const comix: SourceAdapter = {
  id: "comix",
  name: "Comix",
  kind: "manga",
  description: "Fast aggregator catalog — manhwa, manhua, manga & novels",

  async search(query, limit = 24): Promise<SourceSearchResult[]> {
    const data = await apiGet<ComixSearch>("/manga", { keyword: query });
    return (data.items ?? []).slice(0, limit).map((m) => ({
      id: m.hid,
      title: m.title,
      coverImage: coverUrl(m.poster),
      latestChapter: m.latestChapter ? `Ch. ${m.latestChapter}` : undefined,
    }));
  },

  async getManga(id): Promise<SourceManga> {
    const m = await apiGet<ComixManga>(`/manga/${encodeURIComponent(id)}`);
    const authors = [...new Set((m.authors ?? []).map((a) => a.title).filter(Boolean))];
    // fall back to artists when no authors are listed
    const credits = authors.length
      ? authors
      : [...new Set((m.artists ?? []).map((a) => a.title).filter(Boolean))];

    return {
      id: m.hid,
      title: m.title,
      description: m.synopsis ?? "",
      coverImage: coverUrl(m.poster),
      genres: (m.genres ?? []).map((g) => g.title).filter(Boolean),
      status: mapStatus(m.status),
      authors: credits,
      year: m.year,
      kind: mapKind(m.type),
    };
  },

  async getChapters(mangaId): Promise<SourceChapter[]> {
    const hid = encodeURIComponent(mangaId);
    const chapters: ComixChapter[] = [];
    const maxPages = 60;

    for (let page = 1; page <= maxPages; page++) {
      const data = await apiGet<ComixChapters>(
        `/manga/${hid}/chapters`,
        { page, ...CLEAN_QUERY },
      );
      const items = data.items ?? [];
      chapters.push(...items);

      const lastPage = data.meta?.last_page ?? data.pagination?.last_page;
      if (lastPage ? page >= lastPage : items.length === 0) break;
    }

    // Multiple groups/languages can upload the same chapter; prefer English
    // when any exists, and one entry per chapter number (lowest id = earliest).
    const english = chapters.filter((c) => (c.language ?? "en") === "en");
    const pool = english.length ? english : chapters;
    const best = new Map<number, ComixChapter>();
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
    const detail = await apiGet<ComixChapterDetail>(
      `/chapters/${encodeURIComponent(chapterId)}`,
      CLEAN_QUERY,
    );
    const items = detail.pages?.items ?? [];
    if (items.length === 0) {
      throw new SourceError(`Comix returned no pages for chapter ${chapterId}`, "comix");
    }
    // items are in reading order; urls are absolute on comix's image mirrors.
    return items.map((p) => ({ url: p.url }));
  },
};
