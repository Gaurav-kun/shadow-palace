/**
 * GET /api/img?u=<encoded page url>&h=<base64url JSON headers>
 *
 * Image proxy for reader pages. Some CDNs (MangaFire) reject hotlinks
 * without a `Referer`, and `<img>` tags can't send custom headers — so
 * pages route through here and we fetch server-side with whatever
 * headers the adapter specified. Responses are cached for a week so
 * repeat reads don't re-fetch.
 */

const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

function decodeHeaders(b64: string | null): Record<string, string> {
  if (!b64) return {};
  try {
    const json = Buffer.from(b64, "base64url").toString("utf8");
    const parsed = JSON.parse(json) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, string>;
    }
  } catch {
    /* fall through */
  }
  return {};
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const raw = searchParams.get("u");
  if (!raw) {
    return Response.json({ error: "u required" }, { status: 400 });
  }

  let target: URL;
  try {
    target = new URL(raw);
  } catch {
    return Response.json({ error: "bad url" }, { status: 400 });
  }
  if (target.protocol !== "http:" && target.protocol !== "https:") {
    return Response.json({ error: "unsupported protocol" }, { status: 400 });
  }

  const extra = decodeHeaders(searchParams.get("h"));
  const headers: Record<string, string> = {
    "User-Agent": BROWSER_UA,
    Accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
    ...extra,
  };

  try {
    const upstream = await fetch(target, {
      headers,
      // Route handlers can cache the upstream body across requests.
      next: { revalidate: 60 * 60 * 24 * 7 },
    });

    if (!upstream.ok) {
      return new Response(null, {
        status: upstream.status,
        headers: { "Cache-Control": "no-store" },
      });
    }

    const body = await upstream.arrayBuffer();
    const type =
      upstream.headers.get("content-type")?.split(";")[0].trim() ??
      "image/jpeg";

    return new Response(body, {
      headers: {
        "Content-Type": type,
        "Cache-Control": "public, max-age=604800, immutable",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return Response.json({ error: "upstream fetch failed" }, { status: 502 });
  }
}
