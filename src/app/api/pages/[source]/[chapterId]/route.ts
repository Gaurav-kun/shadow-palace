import { getAdapter } from "@/sources/registry";
import { SourceError, type SourcePage } from "@/sources/types";
import { decodeParam } from "@/lib/utils";

/**
 * GET /api/pages/[source]/[chapterId]?mode=images|text
 *
 * Returns ordered page image URLs, or paragraph strings for novel
 * chapters. Page responses are always uncached — CDNs are touchy.
 */

/**
 * Wrap a page's image URL in our `/api/img` proxy. Some CDNs reject
 * hotlinks without a matching `Referer`/UA, and `<img>` tags can't send
 * custom headers — so all page images route through the proxy, which
 * fetches server-side with the adapter's required headers and caches
 * the result. This is what makes MangaFire (and similar) actually
 * render instead of showing a broken-image alt.
 */
function proxify(page: SourcePage): string {
  const u = new URL("/api/img", "http://local");
  u.searchParams.set("u", page.url);
  if (page.headers && Object.keys(page.headers).length > 0) {
    u.searchParams.set("h", Buffer.from(JSON.stringify(page.headers)).toString("base64url"));
  }
  return `${u.pathname}${u.search}`;
}
export async function GET(
  request: Request,
  ctx: { params: Promise<{ source: string; chapterId: string }> },
) {
  const { source, chapterId: rawId } = await ctx.params;
  // Next.js leaves encoded slashes (%2F) in params undecoded —
  // decode once so adapters fetch the real chapter path.
  const chapterId = decodeParam(rawId);
  const mode = new URL(request.url).searchParams.get("mode") ?? "images";

  try {
    const adapter = getAdapter(source);

    if (mode === "text") {
      if (!adapter.getTextPages) {
        return Response.json(
          { error: `"${adapter.name}" does not serve text chapters` },
          { status: 400 },
        );
      }
      const paragraphs = await adapter.getTextPages(chapterId);
      return Response.json(
        { paragraphs },
        { headers: { "Cache-Control": "private, max-age=3600" } },
      );
    }

    const pages = (await adapter.getPages(chapterId)).map((p) => ({
      ...p,
      url: proxify(p),
    }));
    return Response.json(
      { pages },
      { headers: { "Cache-Control": "private, max-age=3600" } },
    );
  } catch (err) {
    const status = err instanceof SourceError ? err.status : 500;
    return Response.json(
      { error: err instanceof Error ? err.message : "Failed to load pages" },
      { status },
    );
  }
}
