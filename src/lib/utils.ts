import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/** Merge Tailwind classes with conflict resolution. */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Next.js route params arrive with special characters STILL ENCODED —
 * encoded slashes stay `%2F` (vercel/next.js#48058). Adapters need the
 * real value, so decode exactly once, defensively: anything without a
 * `%` passes through untouched, and malformed sequences fall back to
 * the raw string instead of throwing.
 */
export function decodeParam(s: string): string {
  if (!s.includes("%")) return s;
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

/** Format a timestamp as a short relative time ("3h ago", "2d ago"). */
export function timeAgo(iso: string | number | undefined): string {
  if (!iso) return "";
  const then = typeof iso === "number" ? iso : Date.parse(iso);
  if (Number.isNaN(then)) return "";
  const diff = Date.now() - then;
  const min = Math.floor(diff / 60_000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const hours = Math.floor(min / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  const weeks = Math.floor(days / 7);
  if (weeks < 5) return `${weeks}w ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.floor(days / 365)}y ago`;
}

/** Pretty chapter label: 12.5 -> "Ch. 12.5", missing -> "Ch. ?" */
export function chapterLabel(number?: string | number | null): string {
  if (number === undefined || number === null || number === "") return "Ch. ?";
  return `Ch. ${number}`;
}

/** Get the best available title from a MangaDex-style localized title object. */
export function pickLocalized(
  titles: Record<string, string> | undefined,
): string {
  if (!titles) return "Unknown";
  return (
    titles.en ??
    titles["en-us"] ??
    titles["ja-ro"] ??
    titles.ja ??
    Object.values(titles)[0] ??
    "Unknown"
  );
}
