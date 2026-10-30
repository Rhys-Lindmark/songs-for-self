# Listening history

The music explorer can analyze Spotify listening history across an account, using the visitor's own export. In the import area choose **Listening history**, select every music JSON file from the extracted download, and wait for matching to finish. A single history JSON is also detected through the ordinary file chooser. A new import replaces the saved analysis; it does not silently append to an older export.

## Getting the data

1. Open [Spotify Account Privacy](https://www.spotify.com/account/privacy/) and request **Extended Streaming History**.
2. Download and extract Spotify's archive when it is ready.
3. Select all the music history JSON files together, such as `Streaming_History_Audio_*.json`. Do not select the ZIP archive or unrelated account files.

Spotify describes its extended export as covering the [lifetime of an account](https://support.spotify.com/us/article/understanding-your-data/). Only selected files enter this analysis; the app cannot verify that the selection is complete. Standard `StreamingHistory*.json` files are supported too, but normally cover the past year and omit album names and track IDs. Standard and extended exports cannot be mixed in one import because the same plays could otherwise be counted twice.

Spotify's [recently played API](https://developer.spotify.com/documentation/web-api/reference/get-recently-played) exposes a bounded recent view. Connecting a Spotify account does not provide its full historical export. This feature imports history files; it does not enable background account sync, collect another person's listening, or claim access to every streaming service. Future live sync would need a separate explicit connection and a durable event store, with transparent gaps; it cannot reconstruct older events unavailable from an API.

## Counts and matching

Each positive-duration music record is counted, including short skips. Zero-duration, malformed, and identifiable non-music records are excluded with visible counts. Listening hours use the exported milliseconds; a counted record does not imply that a whole song or album was heard. Overlapping files are compared using normalized track identity, end timestamp, and duration, preserving the greatest per-file multiplicity so repeated rows inside one file remain distinct plays. Source timestamps are not unique event IDs; standard minute-resolution timestamps can make overlap matching less precise.

One aggregated row per unique track enters the existing metadata matching pipeline. A valid Spotify track URI is the primary identity; otherwise the exact normalized song, artist, and album are used. Different artists or releases are kept distinct when no shared URI identifies them. Recording dates on the timeline come from music metadata, never the dates a person played a song. Unknown artist, album, genre, date, or origin information stays unresolved unless the existing catalog supplies evidence.

All music-map and acclaimed-album coverage scores use these unique song rows. The top-genre profile defaults to **Plays**, with a **Unique tracks** option to compare breadth. Unknown rows retain their weight in the denominator. Repeated plays can change the genre mix but cannot repeatedly increase coverage. The U.S. FY2025 streaming benchmark remains an approximate reference, with different dates, population and stream-counting rules; having one person's history does not create a representative set of listener percentiles.

## Privacy and bounds

Files are read locally, sequentially. No file bytes, account identifiers, IP addresses, device details, listening-country fields, or technical logs are uploaded. Raw events are discarded after aggregation; IndexedDB stores only song metadata, play/time totals, first/last play dates, the import summary, and existing music enrichment. Public metadata/artwork may be fetched by the existing explorer. **Clear playlist** removes the saved analysis. No refresh token, server-side listener database, or new OAuth scope is introduced.

Imports reject oversize or unsupported input rather than silently truncating: at most 200 files, 50 MiB per file, 250 MiB total, one million source records and 100,000 unique tracks. Files are processed one at a time and repeat plays are never expanded into map markers. Album covers are displayed in pages of 240, with filtering across the complete collection. Aggregate history fields survive enriched CSV export/reimport; the summary and counts survive the existing browser checkpoint. Old playlist checkpoints remain compatible.

Run `node --test scripts/spotify-listening-history.test.mjs` for parser contracts and `npm run test:listening-history-browser` for desktop/mobile integration, privacy, weights, scores, resume and clear. Set `SFS_BASE_URL` for preview or production.
