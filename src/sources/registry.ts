import type { SourceAdapter, SourceKind } from "./types";
import { SourceError } from "./types";
import { mangadex } from "./mangadex";
import { comix } from "./comix";
import { mangafire } from "./mangafire";
import { mangadot } from "./mangadot";
import { toonkotsu } from "./toonkotsu";
import { novelfull } from "./novelfull";
import { freewebnovel } from "./freewebnovel";
import { royalroad } from "./royalroad";

/**
 * Source registry — every adapter lives here.
 *
 * `primary` is the default source used for home-page shelves and
 * searches that don't specify a source.
 */

const adapters: SourceAdapter[] = [
  mangadex,
  comix,
  mangafire,
  mangadot,
  toonkotsu,
  novelfull,
  freewebnovel,
  royalroad,
];

export const PRIMARY_SOURCE = "mangadex";

export function listSources(): SourceAdapter[] {
  return adapters;
}

export function listSourcesByKind(kind: SourceKind): SourceAdapter[] {
  return adapters.filter((a) => a.kind === kind);
}

export function getAdapter(id: string): SourceAdapter {
  const found = adapters.find((a) => a.id === id);
  if (!found) throw new SourceError(`Unknown source "${id}"`, id, 404);
  return found;
}
