import { listSources } from "@/sources/registry";

/** GET /api/sources — list registered content sources. */
export async function GET() {
  return Response.json({
    sources: listSources().map((a) => ({
      id: a.id,
      name: a.name,
      kind: a.kind,
      description: a.description,
    })),
  });
}
