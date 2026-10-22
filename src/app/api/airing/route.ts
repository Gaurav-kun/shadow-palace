import { getAiringInfo } from "@/lib/anilist";

/**
 * GET /api/airing?title=…  (optionally &mangaTitle=… for better match)
 *
 * Returns anime-adaptation + airing info for a manga, from AniList.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const title = searchParams.get("title")?.trim();
  if (!title) {
    return Response.json({ error: "title required" }, { status: 400 });
  }

  try {
    const info = await getAiringInfo(title);
    return Response.json(
      { info },
      { headers: { "Cache-Control": "public, s-maxage=21600" } },
    );
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "AniList failed", info: null },
      { headers: { "Cache-Control": "public, s-maxage=600" } },
    );
  }
}
