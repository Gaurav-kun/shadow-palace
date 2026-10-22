import { openDB, type IDBPDatabase } from "idb";
import { create } from "zustand";
import type { SourceKind } from "@/sources/types";

/**
 * Local library + reading progress, stored in IndexedDB.
 *
 * Everything is device-local for now. The store surface is deliberately
 * small so an AniList sync layer can be dropped in later without
 * touching call sites.
 */

export interface ChapterProgress {
  page?: number;
  pct?: number;
  done?: boolean;
  updatedAt: number;
}

export interface LibraryEntry {
  /** `${source}:${mangaId}` */
  key: string;
  source: string;
  mangaId: string;
  title: string;
  coverImage?: string;
  kind: SourceKind;
  lastChapterId?: string;
  lastChapterNumber?: string;
  /** Resume hint for paged reader. */
  lastPage?: number;
  pagesCount?: number;
  /** Resume hint for scroll/novel readers (0..1). */
  progressPct?: number;
  updatedAt: number;
  /** chapterId -> progress */
  chapters: Record<string, ChapterProgress>;

  /* Follow + update tracking (populated by the update checker) */
  followed?: boolean;
  followedAt?: number;
  /** Newest chapter number we've seen from the source. */
  latestChapterNumber?: string;
  latestChapterId?: string;
  /** Chapters newer than what the user last read. */
  newChapterCount?: number;
  /** Estimated next-chapter time (epoch ms), from release cadence. */
  nextEstimateAt?: number;
  /** Average days between recent chapters. */
  updateIntervalDays?: number;
  lastCheckedAt?: number;
}

const DB_NAME = "shadow-palace";
const STORE = "library";

let dbPromise: Promise<IDBPDatabase> | null = null;

function db() {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, 1, {
      upgrade(d) {
        if (!d.objectStoreNames.contains(STORE)) {
          d.createObjectStore(STORE, { keyPath: "key" });
        }
      },
    });
  }
  return dbPromise;
}

export function entryKey(source: string, mangaId: string) {
  return `${source}:${mangaId}`;
}

interface LibraryState {
  entries: Record<string, LibraryEntry>;
  hydrated: boolean;
  hydrate: () => Promise<void>;
  /** Ensure an entry exists (e.g. when a chapter is opened). */
  ensure: (meta: {
    source: string;
    mangaId: string;
    title: string;
    coverImage?: string;
    kind: SourceKind;
  }) => Promise<LibraryEntry>;
  setProgress: (
    key: string,
    chapterId: string,
    update: {
      page?: number;
      pagesCount?: number;
      pct?: number;
      chapterNumber?: string;
    },
  ) => Promise<void>;
  markChapterDone: (key: string, chapterId: string) => Promise<void>;
  /** Toggle follow state; creates an entry if following a title you haven't opened. */
  toggleFollow: (
    key: string,
    meta: {
      source: string;
      mangaId: string;
      title: string;
      coverImage?: string;
      kind: SourceKind;
    },
  ) => Promise<boolean>;
  /** Store the result of an update check (newest chapter, cadence, estimate). */
  setUpdateInfo: (
    key: string,
    info: {
      latestChapterNumber?: string;
      latestChapterId?: string;
      newChapterCount?: number;
      nextEstimateAt?: number;
      updateIntervalDays?: number;
    },
  ) => Promise<void>;
  remove: (key: string) => Promise<void>;
}

async function persist(entry: LibraryEntry) {
  const d = await db();
  await d.put(STORE, entry);
}

export const useLibrary = create<LibraryState>((set, get) => ({
  entries: {},
  hydrated: false,

  hydrate: async () => {
    if (get().hydrated) return;
    const d = await db();
    const all = (await d.getAll(STORE)) as LibraryEntry[];
    const entries: Record<string, LibraryEntry> = {};
    for (const e of all) entries[e.key] = e;
    set({ entries, hydrated: true });
  },

  ensure: async (meta) => {
    const key = entryKey(meta.source, meta.mangaId);
    const existing = get().entries[key];
    if (existing) return existing;

    const entry: LibraryEntry = {
      key,
      source: meta.source,
      mangaId: meta.mangaId,
      title: meta.title,
      coverImage: meta.coverImage,
      kind: meta.kind,
      updatedAt: Date.now(),
      chapters: {},
    };
    set((s) => ({ entries: { ...s.entries, [key]: entry } }));
    await persist(entry);
    return entry;
  },

  setProgress: async (key, chapterId, update) => {
    const current = get().entries[key];
    if (!current) return;

    const prevCh = current.chapters[chapterId] ?? { updatedAt: 0 };
    const next: LibraryEntry = {
      ...current,
      lastChapterId: chapterId,
      lastChapterNumber: update.chapterNumber ?? current.lastChapterNumber,
      lastPage: update.page ?? current.lastPage,
      pagesCount: update.pagesCount ?? current.pagesCount,
      progressPct: update.pct ?? current.progressPct,
      updatedAt: Date.now(),
      chapters: {
        ...current.chapters,
        [chapterId]: {
          ...prevCh,
          ...(update.page !== undefined ? { page: update.page } : {}),
          ...(update.pct !== undefined ? { pct: update.pct } : {}),
          updatedAt: Date.now(),
        },
      },
    };

    set((s) => ({ entries: { ...s.entries, [key]: next } }));
    await persist(next);
  },

  markChapterDone: async (key, chapterId) => {
    const current = get().entries[key];
    if (!current) return;

    const next: LibraryEntry = {
      ...current,
      updatedAt: Date.now(),
      chapters: {
        ...current.chapters,
        [chapterId]: { ...(current.chapters[chapterId] ?? {}), done: true, pct: 1, updatedAt: Date.now() },
      },
    };

    set((s) => ({ entries: { ...s.entries, [key]: next } }));
    await persist(next);
  },

  toggleFollow: async (key, meta) => {
    const existing = get().entries[key];
    const now = Date.now();
    const nowFollowing = !existing?.followed;

    const next: LibraryEntry = {
      ...(existing ?? {
        key,
        source: meta.source,
        mangaId: meta.mangaId,
        title: meta.title,
        coverImage: meta.coverImage,
        kind: meta.kind,
        chapters: {},
      }),
      followed: nowFollowing,
      followedAt: nowFollowing ? now : undefined,
      updatedAt: now,
    };

    set((s) => ({ entries: { ...s.entries, [key]: next } }));
    await persist(next);
    return nowFollowing;
  },

  setUpdateInfo: async (key, info) => {
    const current = get().entries[key];
    if (!current) return;

    const next: LibraryEntry = {
      ...current,
      ...info,
      lastCheckedAt: Date.now(),
    };

    set((s) => ({ entries: { ...s.entries, [key]: next } }));
    await persist(next);
  },

  remove: async (key) => {
    set((s) => {
      const entries = { ...s.entries };
      delete entries[key];
      return { entries };
    });
    const d = await db();
    await d.delete(STORE, key);
  },
}));

/** Convenience selectors */
export function isChapterRead(entry: LibraryEntry | undefined, chapterId: string) {
  return entry?.chapters[chapterId]?.done === true;
}
