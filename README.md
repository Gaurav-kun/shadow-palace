# Shadow Palace 🌑

A self-hosted, dark-mode manga / manhwa / light-novel reader. Installable as
a PWA — own window on desktop, home-screen app on mobile.

## Sources

All sources are pluggable adapters behind a single `SourceAdapter` interface:

| Source     | Kind  | Notes                                      |
| ---------- | ----- | ------------------------------------------ |
| MangaDex   | manga | Primary. Official API.                     |
| comix.to   | manga | Signed JSON API.                           |
| MangaFire  | manga | SPA JSON API; pages need Referer (proxied).|
| MangaDot   | manga | Cloudflare-safe JSON API.                  |
| toonkotsu  | manga | Rankings + series API.                     |
| NovelFull  | novel | Web novels — text reader (Shadow Slave, LOTM). |

### Cross-source chapter merging

MangaDex alone often has holes — dead scanlation groups drop middle chapters.
When you open a title, Shadow Palace finds it on **every** other source and
merges the chapter lists by chapter number, so a chapter "exists" if *any*
source has it. Fallback-source chapters get a badge, and reading falls through
to whichever source actually serves pages.

### Image proxy

Some CDNs reject hotlinks without a matching `Referer`, and `<img>` tags can't
send headers. All page images route through `/api/img`, which fetches
server-side with the adapter's required headers and caches the result.

## Stack

- **Next.js 16** (App Router, Turbopack) + **React 19**
- **Tailwind CSS v4** — design tokens in `src/app/globals.css`
- **Zustand + idb** — library/follow state in IndexedDB (local-first)
- **TanStack Query** — caching for source fetches
- **framer-motion** — reader transitions

## Develop

```bash
npm install
npm run dev        # http://localhost:3000
```

```bash
npm run build      # production build (standalone output)
npm run start
npm run lint
```

## Deploy

Every push to `master` runs CI (build) and publishes a Docker image to GHCR:

```
ghcr.io/<owner>/shadow-palace:latest
```

Pull that image on any host (VPS, Railway, Fly.io, Cloud Run) and it
auto-updates on each push. Locally:

```bash
docker build -t shadow-palace .
docker run -p 3000:3000 shadow-palace
```

## Project layout

```
src/
  app/            Routes (home, search, title, read, library) + API
  components/     UI (home, media, reader, title, ui)
  lib/            library store, reader prefs, cache, merge, anilist
  sources/        SourceAdapter interface + one file per source
```

> Personal-use reader. Respect the terms of the sources you configure.
