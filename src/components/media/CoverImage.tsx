"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { kindForSource } from "@/lib/kind";

interface CoverImageProps {
  src?: string;
  alt: string;
  className?: string;
  /** Larger first letter fallback tile when no image exists. */
  eager?: boolean;
  /** Source id — lets a failed cover be rescued from the right kind of site. */
  source?: string;
}

/**
 * Cover art with shimmer placeholder, fade-in, and a graceful
 * gradient fallback tile when the source has no image.
 *
 * When the image itself fails to load (e.g. MangaDex's verification wall
 * rejects this IP for every cover request), it asks /api/cover to locate the
 * same title on a source whose image CDN is open, and swaps to that cover.
 * All state is derived against the current `src` prop, so a changed prop
 * automatically discards any stale rescue for a previous title.
 */
export function CoverImage({ src, alt, className, eager, source }: CoverImageProps) {
  const [loaded, setLoaded] = useState(false);
  /** Rescue state for one specific `src`; url undefined = pending, null = none found. */
  const [rescue, setRescue] = useState<{ from: string; url?: string | null; dead?: boolean } | null>(null);

  const kind = source ? kindForSource(source) : "manga";
  const forThis = rescue !== null && rescue.from === src;
  const rescueUrl = forThis && rescue.url ? rescue.url : null;
  const current = rescueUrl ?? src;
  const failed = !current || (forThis && !rescueUrl && !rescue.dead) || (forThis && rescue.dead === true);

  function handleError() {
    const original = src;
    if (!original) return;
    if (!forThis) {
      // The original cover (or a fresh prop) failed — ask for an alternative.
      setRescue({ from: original });
      void fetch(`/api/cover?q=${encodeURIComponent(alt)}&kind=${kind}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((j) => setRescue({ from: original, url: j?.url ?? null }))
        .catch(() => setRescue({ from: original, url: null }));
    } else if (rescueUrl) {
      // The rescued cover failed too — stop, show the tile.
      setRescue({ from: original, url: rescueUrl, dead: true });
    }
  }

  return (
    <div
      className={cn(
        "relative overflow-hidden bg-palace",
        !loaded && !failed && "animate-shimmer",
        className,
      )}
    >
      {/* Fallback tile */}
      {(failed || !current) && (
        <div className="absolute inset-0 grid place-items-center bg-gradient-to-br from-hall via-palace to-abyss">
          <span className="font-display text-3xl font-bold text-veil select-none">
            {alt.trim().charAt(0).toUpperCase() || "?"}
          </span>
        </div>
      )}

      {current && !failed && (
        // eslint-disable-next-line @next/next/no-img-element -- sources serve arbitrary hosts
        <img
          src={current}
          alt={alt}
          loading={eager ? "eager" : "lazy"}
          decoding="async"
          draggable={false}
          // Some cover CDNs 403 any request carrying a Referer (novelfull),
          // and browsers auto-send the page origin cross-origin. None of our
          // sources require one.
          referrerPolicy="no-referrer"
          onLoad={() => setLoaded(true)}
          onError={handleError}
          className={cn(
            "h-full w-full object-cover transition-opacity duration-500",
            loaded ? "opacity-100" : "opacity-0",
          )}
        />
      )}

      {/* Soft bottom vignette for text overlay legibility */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-void/70 to-transparent opacity-0 transition-opacity duration-300 [div:hover>&]:opacity-100" />
    </div>
  );
}
