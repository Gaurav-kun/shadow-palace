import Link from "next/link";
import { notFound } from "next/navigation";
import { getAdapter } from "@/sources/registry";
import { SourceError } from "@/sources/types";
import { cached, TTL_CHAPTERS } from "@/lib/cache";
import { CoverImage } from "@/components/media/CoverImage";
import { TitleActions } from "@/components/title/TitleActions";
import { TitleChapters } from "@/components/title/TitleChapters";
import { AnimeAdaptationPanel } from "@/components/title/AnimeAdaptation";
import { ArrowLeftIcon } from "@/components/icons";
import { cn } from "@/lib/utils";

export default async function TitlePage({
  params,
}: {
  params: Promise<{ source: string; id: string }>;
}) {
  const { source, id } = await params;

  let adapter;
  try {
    adapter = getAdapter(source);
  } catch {
    notFound();
  }

  let manga;
  let chapters;
  try {
    const data = await cached(
      `title:${source}:${id}`,
      TTL_CHAPTERS,
      async () => {
        const [m, c] = await Promise.all([
          adapter.getManga(id),
          adapter.getChapters(id),
        ]);
        return { manga: m, chapters: c };
      },
    );
    manga = data.manga;
    chapters = data.chapters;
  } catch (err) {
    const message =
      err instanceof SourceError ? err.message : "Failed to load this title";
    return (
      <div className="grid min-h-[60vh] place-items-center px-6">
        <div className="max-w-sm text-center">
          <h2 className="font-display text-xl font-semibold">Couldn’t load it</h2>
          <p className="mt-2 text-sm text-mist">{message}</p>
          <Link
            href="/search"
            className="mt-5 inline-block rounded-xl border border-veil/70 px-5 py-2.5 text-sm text-moon/90 hover:border-flame/50 hover:text-flame"
          >
            ← Back to search
          </Link>
        </div>
      </div>
    );
  }

  const statusStyle: Record<string, string> = {
    ongoing: "text-flame border-flame/40 bg-flame/10",
    completed: "text-moon border-moon/30 bg-moon/5",
    hiatus: "text-ember border-ember/40 bg-ember/10",
  };

  return (
    <div className="pb-12">
      {/* Blurred banner from the cover */}
      <div className="relative h-48 overflow-hidden sm:h-60">
        {manga.coverImage && (
          // eslint-disable-next-line @next/next/no-img-element -- blurred backdrop
          <img
            src={manga.coverImage}
            alt=""
            aria-hidden
            className="absolute inset-0 h-full w-full scale-110 object-cover opacity-30 blur-2xl saturate-150"
          />
        )}
        <div className="absolute inset-0 bg-linear-to-b from-void/40 via-void/70 to-void" />
        <Link
          href="/search"
          className="safe-pt absolute top-4 left-4 flex items-center gap-1.5 rounded-full bg-void/60 px-3 py-1.5 text-xs text-moon/90 backdrop-blur-md transition-colors hover:text-flame"
        >
          <ArrowLeftIcon className="h-3.5 w-3.5" width={14} height={14} />
          Back
        </Link>
      </div>

      <div className="relative -mt-32 px-5 lg:px-10">
        {/* Header */}
        <div className="flex flex-col gap-5 sm:flex-row sm:items-end">
          <div className="w-36 shrink-0 sm:w-44">
            <CoverImage
              src={manga.coverImage}
              alt={manga.title}
              eager
              className="aspect-2/3 w-full rounded-2xl ring-1 ring-flame/25 shadow-2xl shadow-flame-deep/10"
            />
          </div>

          <div className="min-w-0 flex-1 pb-1">
            <h1 className="font-display text-2xl leading-tight font-bold sm:text-3xl">
              {manga.title}
            </h1>

            {manga.authors.length > 0 && (
              <p className="mt-1.5 text-sm text-mist">
                {manga.authors.join(", ")}
              </p>
            )}

            <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px]">
              {manga.status && (
                <span
                  className={cn(
                    "rounded-full border px-2.5 py-0.5 font-semibold capitalize",
                    statusStyle[manga.status] ?? "border-veil text-mist",
                  )}
                >
                  {manga.status}
                </span>
              )}
              <span className="rounded-full border border-veil px-2.5 py-0.5 font-medium capitalize text-mist">
                {manga.kind}
              </span>
              {manga.year && (
                <span className="text-mist/70">{manga.year}</span>
              )}
              <span className="text-mist/70">
                {chapters.length} chapter{chapters.length === 1 ? "" : "s"}
              </span>
              <span className="text-mist/40">·</span>
              <span className="text-mist/70">via {adapter.name}</span>
            </div>

            {manga.genres.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {manga.genres.slice(0, 8).map((g) => (
                  <span
                    key={g}
                    className="rounded-md bg-hall/80 px-2 py-0.5 text-[11px] text-mist"
                  >
                    {g}
                  </span>
                ))}
              </div>
            )}

            <div className="mt-5">
              <TitleActions source={source} manga={manga} chapters={chapters} />
            </div>
          </div>
        </div>

        {/* Description */}
        {manga.description && (
          <details className="group mt-7 max-w-3xl">
            <summary className="cursor-pointer list-none text-sm font-semibold text-moon/90 select-none">
              Synopsis
              <span className="ml-2 text-xs text-mist group-open:hidden">
                (expand)
              </span>
              <span className="ml-2 text-xs text-mist hidden group-open:inline">
                (collapse)
              </span>
            </summary>
            <p className="mt-2 text-sm leading-relaxed whitespace-pre-line text-mist">
              {manga.description}
            </p>
          </details>
        )}

        {/* Anime adaptation */}
        <section className="mt-8 max-w-3xl">
          <AnimeAdaptationPanel title={manga.title} />
        </section>

        {/* Chapters */}
        <section className="mt-9">
          <h2 className="mb-3 font-display text-lg font-semibold">Chapters</h2>
          <TitleChapters source={source} mangaId={manga.id} chapters={chapters} />
        </section>
      </div>
    </div>
  );
}
