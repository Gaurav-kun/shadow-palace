/** Cover-rescue kind: which provider chain a title belongs to. */
export type CoverKind = "manga" | "novel";

const NOVEL_SOURCES = new Set(["novelfull", "freewebnovel", "royalroad"]);

/** Map a source id to its cover kind (used to avoid cross-kind cover swaps). */
export function kindForSource(source: string): CoverKind {
  return NOVEL_SOURCES.has(source) ? "novel" : "manga";
}
