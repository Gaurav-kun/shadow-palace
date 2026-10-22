"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

interface CoverImageProps {
  src?: string;
  alt: string;
  className?: string;
  /** Larger first letter fallback tile when no image exists. */
  eager?: boolean;
}

/**
 * Cover art with shimmer placeholder, fade-in, and a graceful
 * gradient fallback tile when the source has no image.
 */
export function CoverImage({ src, alt, className, eager }: CoverImageProps) {
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(!src);

  return (
    <div
      className={cn(
        "relative overflow-hidden bg-palace",
        !loaded && !failed && "animate-shimmer",
        className,
      )}
    >
      {/* Fallback tile */}
      {(failed || !src) && (
        <div className="absolute inset-0 grid place-items-center bg-gradient-to-br from-hall via-palace to-abyss">
          <span className="font-display text-3xl font-bold text-veil select-none">
            {alt.trim().charAt(0).toUpperCase() || "?"}
          </span>
        </div>
      )}

      {src && !failed && (
        // eslint-disable-next-line @next/next/no-img-element -- sources serve arbitrary hosts
        <img
          src={src}
          alt={alt}
          loading={eager ? "eager" : "lazy"}
          decoding="async"
          draggable={false}
          onLoad={() => setLoaded(true)}
          onError={() => setFailed(true)}
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
