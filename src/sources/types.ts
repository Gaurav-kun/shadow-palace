/**
 * The contract every content source must implement.
 *
 * Sources are pluggable adapters — the app never talks to a website
 * directly, only through this interface. Adding a source = adding one
 * file and registering it in `registry.ts`.
 */

export type SourceKind = "manga" | "manhwa" | "novel";

export interface SourceSearchResult {
  /** Adapter-local id (the id you pass back into getManga). */
  id: string;
  title: string;
  coverImage?: string;
  /** e.g. "Ch. 143" if the source knows the latest chapter. */
  latestChapter?: string;
  /** Optional subtitle, e.g. author. */
  subtitle?: string;
}

export interface SourceManga {
  id: string;
  title: string;
  description: string;
  coverImage?: string;
  /** Wide banner, if the source provides one. */
  bannerImage?: string;
  genres: string[];
  status?: "ongoing" | "completed" | "hiatus" | "cancelled" | string;
  authors: string[];
  year?: number;
  kind: SourceKind;
}

export interface SourceChapter {
  /** Adapter-local chapter id. */
  id: string;
  /** Human chapter number, e.g. "12", "12.5". */
  number?: string;
  title?: string;
  /** ISO timestamp, when available. */
  publishedAt?: string;
  /** Total pages, when the source knows it up-front. */
  pagesCount?: number;
}

/** A single readable page. For images: a hotlinkable URL. For novels: HTML/text handled by getTextPages. */
export interface SourcePage {
  url: string;
  /** Optional referer/headers some CDNs require (kept for future sources). */
  headers?: Record<string, string>;
}

export interface SourceAdapter {
  /** Stable machine id, e.g. "mangadex". */
  readonly id: string;
  /** Display name, e.g. "MangaDex". */
  readonly name: string;
  /** What this source primarily serves. */
  readonly kind: SourceKind;
  /** Short note shown in the source picker. */
  readonly description: string;

  search(query: string, limit?: number): Promise<SourceSearchResult[]>;
  getManga(id: string): Promise<SourceManga>;
  /** Home shelf: most followed / top ranked titles. */
  getPopular?(limit?: number): Promise<SourceSearchResult[]>;
  /** Home shelf: recently updated titles. */
  getLatest?(limit?: number): Promise<SourceSearchResult[]>;
  getChapters(mangaId: string): Promise<SourceChapter[]>;
  /** Ordered image URLs for an image chapter. */
  getPages(chapterId: string): Promise<SourcePage[]>;
  /** Ordered text blocks for novel chapters (novel sources only). */
  getTextPages?(chapterId: string): Promise<string[]>;
}

/** Thrown by adapters so the API layer can return clean errors. */
export class SourceError extends Error {
  constructor(
    message: string,
    public readonly sourceId: string,
    public readonly status: number = 502,
  ) {
    super(message);
    this.name = "SourceError";
  }
}
