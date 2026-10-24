# Shadow Palace

Shadow Palace is a self-hosted reader for manga, manhwa, and light
novels. It runs as a single Node process, stores your library in the
browser, and installs as a PWA — a separate window on desktop, a
home-screen app on mobile. The interface is dark by design.

## Running it

There are two ways to run Shadow Palace. Neither requires money.

### In the browser, nothing to install

[![Open in GitHub Codespaces](https://github.com/codespaces/badge.svg)](https://codespaces.new/Gaurav-kun/shadow-palace)

Click the button above. GitHub builds the project in a cloud container
(a few minutes the first time) and starts it. When the bottom bar shows
a forwarded port **3000**, click **Open in Browser**. That is the whole
procedure.

Codespaces sleeps after inactivity and wakes when the tab is reopened.
A free GitHub account includes enough hours for occasional use. The
repository must be public, or you must be a collaborator.

### On your own computer

You need [Node.js](https://nodejs.org) version 20.9 or newer and, for
these steps, [Git](https://git-scm.com). Run each block in a terminal.

```bash
# 1. Create a folder for the project and move into it
mkdir shadow-palace
cd shadow-palace
```

```bash
# 2. Download the code into the current folder
git clone https://github.com/Gaurav-kun/shadow-palace.git .
```

```bash
# 3. Install dependencies (only the first time — takes a minute)
npm install
```

```bash
# 4. Start the app
npm run dev
```

Then open <http://localhost:3000>. Leave the terminal running; stop the
app with `Ctrl + C`.

<details>
<summary>No Git? Download the files as a ZIP instead</summary>

Click the repository's green <kbd>Code</kbd> button, choose
**Download ZIP**, extract it, then run `npm install` and `npm run dev`
inside the extracted folder.

</details>

| Problem | Solution |
| --- | --- |
| `port 3000 is in use` | Run `npm run dev -- -p 3001` and open port 3001 instead |
| Page reloads forever in development | Run `npm run dev:reset` |
| First load is slow | Expected; the dev server compiles on first request, later loads are fast |

## Install as an app (PWA)

Shadow Palace is a progressive web app. Once it is running and open in
your browser, you can install it so it opens in its own window with a
dock/taskbar icon, instead of a browser tab. The steps depend on the
device.

### Android (Chrome)

1. Open the app in Chrome.
2. Tap the **⋮** menu (top right).
3. Choose **Add to Home screen** or **Install app**.
4. Confirm. It appears in your app drawer and opens full-screen.

### iPhone / iPad (Safari)

1. Open the app in Safari.
2. Tap the **Share** button (square with an arrow).
3. Scroll down and tap **Add to Home Screen**.
4. Tap **Add** (top right). It appears on your home screen.

Safari does not support installing from other browsers on iOS — it must
be Safari.

### Desktop (Chrome, Edge, or Brave)

1. Open the app in the browser.
2. Click the **install icon** in the address bar (a monitor with a down
   arrow), or open the main menu and choose **Install Shadow Palace…**
3. Confirm. It opens in a standalone window and pins to your dock,
   taskbar, or applications folder.

### Notes

- The app is served over `http://localhost` or a plain-HTTP host, which
  some browsers treat as non-secure. If **Install app** / **Add to Home
  screen** is missing or greyed out, the browser wants HTTPS. On your own
  machine, `localhost` is usually exempt; on a remote host, put it behind
  HTTPS (a reverse proxy or your host's TLS) and the option appears.
- Your library, history, and settings live in the browser's local storage
  on each device. They are not shared between devices unless you export
  the library as JSON (from the Library page) and import it elsewhere.

## Sources

Sources are pluggable adapters behind one interface (`SourceAdapter` in
`src/sources/`). Eight are implemented and working:

| Source | Type | Notes |
| --- | --- | --- |
| MangaDex | manga | Primary source. Official API. |
| comix.to | manga | Signed JSON API. |
| MangaFire | manga | SPA JSON API; pages need Referer (proxied). |
| MangaDot | manga | Cloudflare-safe JSON API. |
| Toonkotsu | manga | Rankings + series API. |
| NovelFull | novel | Web novels, text reader. |
| FreeWebNovel | novel | Web novels, text reader. |
| RoyalRoad | novel | Fiction, text reader. |

Search, browse, and home shelves query MangaDex by default; every title
page works with any source.

### Browse

`/browse` queries the MangaDex catalog with sort order (latest update,
popular, top rated, newest), status, origin language, demographic, and
any combination of its 77 genre/theme/format tags. Filters live in the
URL, so any view can be bookmarked or shared.

### Chapter merging

A single source often has holes in a chapter list — dead scanlation
groups drop middle chapters. When you open a title, Shadow Palace finds
the same series on every other source and merges the chapter lists by
chapter number. A chapter exists if any source has it. Fallback-source
chapters get a badge, and reading falls through to whichever source
actually serves the pages.

### Image proxy

Some CDNs reject hotlinks without a matching `Referer`, and `<img>`
tags cannot send headers. All page images route through `/api/img`,
which fetches server-side with the adapter's required headers and
caches the result.

### Series details

Title pages enrich the source data with AniList (score, popularity,
favourites, synopsis fallback, a 24-character roster with a popup) and
Comick (community rating with a full score histogram). Enrichment is
time-boxed and failure-tolerant: a slow or unreachable third party never
blocks the page.

## Reader

- Fit-to-screen by default, with paged, scroll, webtoon, and novel modes
- Touch navigation in paged mode; tap zones, keyboard, and swipe elsewhere
- Reading progress, history, and follows stored in IndexedDB
- JSON export/import of the whole library for backup
- Novel chapters load one endpoint fast instead of walking the full
  chapter list first

## Develop

```bash
npm run build      # production build (standalone output)
npm run start
npm run lint
```

If the dev server ever gets stuck in a reload loop — the page keeps
refreshing and every request shows "compiling…" — its watcher state has
gone bad. Stop it with `npm run dev:reset`, which kills every process of
the project, clears the Turbopack dev cache, and starts a fresh server.
Stopping the terminal tab alone does not always clear it.

## Deploy

Every push to `master` runs CI (build) and publishes a Docker image to
GHCR:

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
  app/            Routes (home, search, browse, title, read, library) + API
  components/     UI (home, media, reader, title, ui)
  lib/            library store, reader prefs, cache, merge, anilist
  sources/        SourceAdapter interface + one file per source
```

## APIs and services

Shadow Palace is a client for third-party services. It hosts no content
of its own.

| Service | Used for | Type |
| --- | --- | --- |
| [MangaDex](https://mangadex.org) | Catalog, search, browse, chapters, pages | Official public API |
| [AniList](https://anilist.co) | Scores, popularity, characters, anime adaptations | Public GraphQL API |
| [Comick](https://comick.io) | Community ratings, score histograms | Public endpoints |
| comix.to, MangaFire, MangaDot, Toonkotsu | Chapters and pages | Unofficial, read via adapters |
| NovelFull, FreeWebNovel, RoyalRoad | Novel chapters and text | Unofficial, read via adapters |

Unofficial sources are accessed through their public web interfaces
without authentication. They can change or break at any time; adapters
are maintained on a best-effort basis.

## Credits

- [Next.js](https://nextjs.org), [React](https://react.dev), and
  [Tailwind CSS](https://tailwindcss.com) for the platform
- [TanStack Query](https://tanstack.com/query) for client caching
- [Zustand](https://zustand.docs.pmnd.rs) with
  [idb](https://github.com/jakearchibald/idb) for the local library
- [cheerio](https://cheerio.js.org) for HTML parsing in source adapters
- [framer-motion](https://www.framer.com/motion/) for transitions
- Cover art, chapter content, and metadata belong to their respective
  authors, scanlation groups, and platforms. This project stores none of
  it permanently.

## Notes

This is a personal-use reader. Respect the terms of service of the
sources you configure.
