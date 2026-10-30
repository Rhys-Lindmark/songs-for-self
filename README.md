# Songs for Self

[Music explorer](https://ai.rhyslindmark.com/music) · [GitHub](https://github.com/Rhys-Lindmark/songs-for-self)

A music atlas with album covers, genre timelines, geography, and browser-local Spotify/CSV imports.

Uploaded playlists receive a coverage score across a fixed map of 1,000 genre, era, and composer areas. One supported track covers an area; unmatched tracks stay visible. Browse covered and missing areas from Time, Genre space, or Geography. See [the map and scoring rules](MUSIC_MAP.md).

A separate score tracks how many of a fixed 500 critically acclaimed albums appear in the playlist. One matching song covers an album once; each entry shows its critic/list sources. See [the album list and matching rules](ACCLAIMED_ALBUMS.md).

## Start locally

Use Node 24.

```sh
git clone https://github.com/Rhys-Lindmark/songs-for-self.git
cd songs-for-self
npm ci
npm run dev
```

CSV and Spotify account-data imports work without credentials. Spotify authorization uses a public Client ID and PKCE; no client secret is needed. Optional local configuration is documented in `.env.example`.

## Working together

Rhys and John can commit and push directly to `main`. Pull requests and reviews are optional.

```sh
git pull --rebase
# Make your changes.
git add .
git commit -m "Describe the change"
git push
```

If someone pushed first, run `git pull --rebase`, resolve any conflicts while preserving both changes, then `git push` again. Keep changes small. GitHub Issues are available for ideas or larger work; opening an issue is optional.

## Publishing

Pushing `main` triggers Cloudflare Workers Builds, which runs `npm run check` and `npm run build`, then `npm run deploy`. A failed check or build leaves the previous deployment live. Both collaborators can publish through Git; Cloudflare credentials stay in Cloudflare.

- Worker: `songs-for-self`
- Worker origin: <https://songs-for-self.rhyslindmark.workers.dev>
- Public URL: <https://ai.rhyslindmark.com/music>
- Build/deployment history: Cloudflare → Workers & Pages → songs-for-self → Builds
- GitHub Actions also checks each push; direct pushes remain allowed.

The main website repository routes `/music` to this Worker. Routine music changes only need a push to this repository. See [RUNBOOK.md](RUNBOOK.md) for verification and rollback.

## Data and corrections

The canonical reference playlist is `data/songs-for-self.enriched.csv`. Generated browser files live in `public/`. All 7,582 available tracks retain genre, time, and geography placements; the source preserves 151 unavailable positions separately.

Use `data/genre-overrides.json` and `data/geography-overrides.json` for reviewed corrections, with source evidence. Do not edit generated files or rerun raw enrichment casually. See [DATA_VERSIONING.md](DATA_VERSIONING.md) and the [runbook](RUNBOOK.md).

Visitor playlists and OAuth tokens are never committed. Imports and saved analyses remain in the visitor's browser. The reference playlist and public enrichment metadata are intentionally published; third-party metadata and artwork retain their respective rights.

## Project contracts

- [Shared agent instructions](AGENTS.md)
- [Deployment and data runbook](RUNBOOK.md)
- [Spotify import contract](SPOTIFY_IMPORT.md)
- [Dataset versioning](DATA_VERSIONING.md)
- [Responsive and accessibility checks](RESPONSIVE_TESTING.md)

- [Playlist genre profile and listening benchmark](GENRE_PROFILE.md)
- [Account listening-history import](LISTENING_HISTORY.md)
- [Artwork performance and measurements](PERFORMANCE.md)

The default Songs for Self collection shows its music-map score, acclaimed-album coverage and top genres before any import. Its compact summary is precomputed with `npm run data:reference-exploration`; detailed filters load a public snapshot only when opened. Importing or resuming a personal playlist/history replaces the default summary, and clearing it restores the default.
