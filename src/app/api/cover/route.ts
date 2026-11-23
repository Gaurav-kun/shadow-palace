import { getAdapter } from "@/sources/registry";
import type { SourceSearchResult } from "@/sources/types";
import type { CoverKind } from "@/lib/kind";

/**
 * GET /api/cover?q=<title>&kind=manga|novel
 *
 * Cover rescue endpoint. Some cover CDNs refuse our traffic outright
 * (MangaDex's POWBlock browser-verification wall challenges this IP for every
 * image request, browsers included), so when a cover <img> errors the client
 * asks here to locate the same title's cover from a source whose image host
 * is known to be open.
 *
 * AniList (public GraphQL, no auth) leads the manga chain: its covers are
 * official, its CDN is open, and its search is relevance-sorted. Format
 * filters keep the chains strict — manga queries never receive a light
 * novel's cover and vice versa — and each chain only consults sources of
 * that kind, so a novel can't get a same-titled manhua's art.
 *
 * Matching is deliberately strict — an exact normalized title always wins,
 * and the loose tier only accepts one title as the other plus a tiny suffix
 * ("X manga"/"X novel"). Sequels ("X: Ragnarok") and lookalikes ("Narutaru"
 * vs "Naruto") are rejected rather than risk a mismatched cover.
 *
 * Returns { url: string } or { url: null } — never an error status: a failed
 * rescue just keeps the letter-tile fallback.
 */

const ANILIST_QUERY = `query ($s: String, $f: [MediaFormat]) {
  Page(page: 1, perPage: 8) {
    media(search: $s, type: MANGA, sort: SEARCH_MATCH, format_in: $f) {
      id
      title { romaji english native }
      coverImage { extraLarge large }
    }
  }
}`;

async function anilistSearch(
  q: string,
  kind: CoverKind,
): Promise<SourceSearchResult[]> {
  const formats = kind === "novel" ? ["NOVEL"] : ["MANGA", "ONE_SHOT"];
  const res = await fetch("https://graphql.anilist.co", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36",
    },
    body: JSON.stringify({ query: ANILIST_QUERY, variables: { s: q, f: formats } }),
    signal: AbortSignal.timeout(12_000),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`anilist ${res.status}`);
  const json = (await res.json()) as {
    data?: { Page?: { media?: Array<{
      id: number;
      title?: { romaji?: string; english?: string; native?: string };
      coverImage?: { extraLarge?: string; large?: string };
    }> } };
  };
  const media = json.data?.Page?.media ?? [];
  return media
    .map((m) => ({
      id: String(m.id),
      title: m.title?.english || m.title?.romaji || m.title?.native || "",
      coverImage: m.coverImage?.extraLarge || m.coverImage?.large || undefined,
    }))
    .filter((r) => r.title && r.coverImage);
}

type CoverProvider = (q: string) => Promise<SourceSearchResult[]>;

const site = (id: string): CoverProvider => (q) => getAdapter(id).search(q, 8);

/** Per-kind provider chains; first chain with an exact-enough match wins. */
const CHAINS: Record<CoverKind, CoverProvider[]> = {
  manga: [(q) => anilistSearch(q, "manga"), site("mangadot"), site("mangafire")],
  novel: [site("freewebnovel"), site("novelfull"), (q) => anilistSearch(q, "novel")],
};

/** kind + title -> cover url (or null when no provider had one) */
const cache = new Map<string, string | null>();

const norm = (s: string) =>
  s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();

/** Exact match first, then a prefix match with a tiny suffix only. */
function pick(results: SourceSearchResult[], query: string): string | undefined {
  const nq = norm(query);
  const covered = results.filter((r) => r.coverImage);
  const exact = covered.find((r) => norm(r.title) === nq);
  if (exact?.coverImage) return exact.coverImage;
  if (nq.length < 6) return undefined;
  const loose = covered.find((r) => {
    const t = norm(r.title);
    const [shorter, longer] = t.length <= nq.length ? [t, nq] : [nq, t];
    if (shorter.length < 6 || !longer.startsWith(shorter)) return false;
    const tail = longer.slice(shorter.length);
    // tail must be a small, separate suffix — no glued-on letters (rejects
    // "Narutaru" for "Naruto") and no long words (rejects sequel titles).
    if (/^[a-z0-9]/.test(tail)) return false;
    return tail.trim().length <= 6;
  });
  return loose?.coverImage;
}

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const q = params.get("q")?.trim() ?? "";
  if (q.length < 2) return Response.json({ url: null });
  const kind: CoverKind = params.get("kind") === "novel" ? "novel" : "manga";

  const key = `${kind}:${norm(q)}`;
  const cached = cache.get(key);
  if (cached !== undefined) return Response.json({ url: cached });

  let url: string | undefined;
  for (const provider of CHAINS[kind]) {
    try {
      const results = await provider(q);
      url = pick(results, q);
      if (url) break;
    } catch (e) {
      /* provider unreachable — fall through to the next one */
      console.error(
        `[cover] provider failed for "${q}":`,
        e instanceof Error ? e.message : e,
      );
    }
  }

  if (cache.size > 500) cache.clear();
  cache.set(key, url ?? null);
  return Response.json({ url: url ?? null });
}
