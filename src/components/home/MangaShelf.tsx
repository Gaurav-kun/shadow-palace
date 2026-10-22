"use client";

import { useQuery } from "@tanstack/react-query";
import { MangaCard } from "@/components/media/MangaCard";
import { CardSkeletonGrid } from "@/components/ui/Skeleton";

// Primary source id (client-safe; must not import the server registry).
const PRIMARY_SOURCE = "mangadex";

interface ShelfResult {
  id: string;
  title: string;
  coverImage?: string;
  latestChapter?: string;
}

/** Client-side shelf — instant paint with skeletons, data fills in. */
export function MangaShelf({
  type,
  count = 18,
}: {
  type: "popular" | "latest";
  count?: number;
}) {
  const { data, isError } = useQuery({
    queryKey: ["shelf", type, count],
    staleTime: 30 * 60 * 1000,
    queryFn: async (): Promise<ShelfResult[]> => {
      const res = await fetch(`/api/shelf?type=${type}&limit=${count}`);
      if (!res.ok) throw new Error("Shelf failed");
      return (await res.json()).results ?? [];
    },
  });

  if (isError) {
    return (
      <p className="py-6 text-sm text-mist">
        The archives are unreachable right now. Try again shortly.
      </p>
    );
  }

  if (!data) return <CardSkeletonGrid count={Math.min(count, 10)} />;

  return (
    <div className="no-scrollbar -mx-1 flex gap-3 overflow-x-auto px-1 pb-2">
      {data.map((r) => (
        <MangaCard
          key={r.id}
          source={PRIMARY_SOURCE}
          id={r.id}
          title={r.title}
          coverImage={r.coverImage}
          badge={r.latestChapter}
          className="w-[136px] shrink-0 sm:w-[152px]"
        />
      ))}
    </div>
  );
}
