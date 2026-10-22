import { create } from "zustand";
import { persist } from "zustand/middleware";

/**
 * Reader preferences — persisted to localStorage, device-local.
 */

export type FitMode = "width" | "screen";
export type Direction = "ltr" | "rtl";

interface ReaderPrefs {
  /** How paged (manga) chapters are displayed. "screen" shows the whole page at once. */
  fitMode: FitMode;
  /** Page turn direction; rtl = manga-style right-to-left. */
  direction: Direction;
  /** Default reader per content kind; can be overridden per session. */
  useScrollForManhwa: boolean;
  /** Novel typography. */
  novelFontSize: number; // px
  novelLineHeight: number;
  /** Reading dimmer (0..0.6) — darkens the screen for night reading. */
  dimmer: number;

  set: (patch: Partial<Omit<ReaderPrefs, "set">>) => void;
}

export const useReaderPrefs = create<ReaderPrefs>()(
  persist(
    (set) => ({
      fitMode: "screen",
      direction: "ltr",
      useScrollForManhwa: true,
      novelFontSize: 18,
      novelLineHeight: 1.8,
      dimmer: 0,
      set: (patch) => set(patch),
    }),
    { name: "shadow-palace:reader:v2" },
  ),
);
