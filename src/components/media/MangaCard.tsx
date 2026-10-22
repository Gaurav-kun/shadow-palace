import Link from "next/link";
import { CoverImage } from "@/components/media/CoverImage";
import { cn } from "@/lib/utils";

interface MangaCardProps {
  source: string;
  id: string;
  title: string;
  coverImage?: string;
  /** Optional small badge, e.g. "Ch. 143" */
  badge?: string;
  className?: string;
}

/**
 * Poster card for grids and shelves. Server component — motion handled
 * with plain CSS transitions to keep the client bundle light.
 */
export function MangaCard({
  source,
  id,
  title,
  coverImage,
  badge,
  className,
}: MangaCardProps) {
  return (
    <Link
      href={`/title/${encodeURIComponent(source)}/${encodeURIComponent(id)}`}
      className={cn("group block outline-none", className)}
    >
      <div className="relative aspect-2/3 overflow-hidden rounded-xl ring-1 ring-veil/50 transition-all duration-300 group-hover:ring-flame/50 group-focus-visible:ring-flame/70">
        <CoverImage
          src={coverImage}
          alt={title}
          className="h-full w-full transition-transform duration-500 group-hover:scale-[1.06]"
        />
        {/* Hover sheen */}
        <div className="pointer-events-none absolute inset-0 bg-linear-to-t from-void/80 via-transparent to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
        {badge && (
          <span className="absolute top-2 left-2 rounded-md bg-void/80 px-1.5 py-0.5 text-[10px] font-semibold text-flame backdrop-blur-sm">
            {badge}
          </span>
        )}
      </div>
      <h3 className="mt-2 line-clamp-2 text-[13px] leading-snug font-medium text-moon/90 transition-colors group-hover:text-flame">
        {title}
      </h3>
    </Link>
  );
}
