# Spotify playlist import contract

## Product boundary

Songs for Self accepts a Spotify playlist link as the primary invitation and keeps copied-track links, CSV, and Spotify account-data playlist JSON as no-account fallbacks. With no Spotify application configured, the site fetches Spotify's official public embed and analyzes its bounded preview (currently up to 100 tracks) immediately. It labels the result as a preview whenever the public page advertises a larger total. A visitor who can open the full playlist in Spotify Desktop can select all, copy the resulting public track links, and paste them into the site; Songs for Self resolves each unique official track card, then reconstructs the original order and duplicate positions. Complete one-click Spotify import uses Authorization Code with PKCE in the browser. No client secret exists in the site, the access token is held only in memory while playlist pages are fetched, and playlist results are not sent to a Songs for Self server.

Spotify's February 2026 development-mode rules materially constrain the feature:

- `GET /playlists/{playlist_id}/items` returns playlist contents only when the authenticated visitor owns the playlist or collaborates on it; other playlists return 403.
- Development-mode applications are limited to five allowlisted authenticated users and require the application owner to have Premium.
- Extended quota is not a near-term route for a personal project: Spotify currently accepts applications only from established organizations meeting its published eligibility requirements.
- Spotify content may not be used to train an AI or machine-learning model.

The interface states these limits instead of implying that any public playlist URL can be imported. Sources: [playlist items](https://developer.spotify.com/documentation/web-api/reference/get-playlists-items), [February 2026 migration guide](https://developer.spotify.com/documentation/web-api/tutorials/february-2026-migration-guide), [quota modes](https://developer.spotify.com/documentation/web-api/concepts/quota-modes), and [PKCE](https://developer.spotify.com/documentation/web-api/tutorials/code-pkce-flow).

## Registration and deployment

1. Create a Spotify Web API application in the developer dashboard. This external account action must be completed by the owner.
2. Register these exact redirect URIs:
   - `https://ai.rhyslindmark.com/music`
   - the current Sites origin URL if origin testing is required;
   - a loopback IP URL for local development, such as `http://127.0.0.1:4335`—Spotify does not accept `localhost`.
3. Add only the owner and explicit testers to the development-mode allowlist.
4. Set `SPOTIFY_CLIENT_ID` locally and in Sites. The server passes this public identifier to the browser; it is not a secret. The legacy `NEXT_PUBLIC_SPOTIFY_CLIENT_ID` name remains accepted during migration.
   - Until the deployed value exists, the owner can paste that same public Client ID into the on-page one-time setup. It is stored only in that browser and carried through the PKCE round trip; this removes the previous non-actionable “limited beta” dead end without exposing a client secret.
5. Never configure or expose the Spotify client secret in this browser application.

The site requests only `playlist-read-private` and `playlist-read-collaborative`. It does not request profile, email, library-write, playlist-write, or playback permissions.

Do not automate Spotify's first-party web-player token or private GraphQL pagination as a substitute. A public playlist page currently exposes a bounded preview, while the complete first-party pagination surface rejects unauthorized use and is not part of the supported developer contract. The public-preview route parses only Spotify's server-rendered official embed, strips audio-preview URLs and artwork, returns track identity metadata, and must never present a bounded preview as a complete import.

The supported immediate workaround is explicit user copy/paste from Spotify Desktop: click a track, select all, copy, and paste the resulting `open.spotify.com/track/...` links. The copied-track route validates one 22-character ID at a time, parses only Spotify's official public track embed, returns title, artists, release date, IDs, and original artwork URL, and applies a long-lived public cache. The browser requests at most six unique track cards concurrently, preserves duplicate playlist positions after resolution, and reports unavailable tracks instead of silently claiming complete coverage. Any displayed Spotify artwork must remain uncropped and linked back to the applicable Spotify item.

Evidence check on 2026-08-31: the public page for Rhys's `6SX8vdBpH9zDSF3N5pNlzP` Songlines playlist declared 2,111 total items. Its ordinary public page server-rendered 30 rows and its official embed server-rendered 100 rows. Spotify's own signed-in player can continue fetching through first-party services, but an unaffiliated browser app cannot obtain a complete, supported export from the public URL alone.

The embed also carries an anonymous first-party access token, but the playlist-items endpoint returned `429 QUOTA_EXCEEDED` for that shared token during the same acceptance check. URL query parameters such as `offset=100`, `start=100`, and `limit=100&offset=100` all returned the identical first 100 rows. The site must not treat that shared token as a complete-import workaround: it is quota-exhausted, outside the documented third-party authorization flow, and cannot reliably page a visitor's playlist. A project-owned PKCE Client ID remains the supported immediate fix.

Spotify's official account-data download remains the complete archival no-token fallback when desktop copy/paste is unavailable. Its playlist JSON is parsed only in the browser; the user chooses among included playlists, and only track/local-track title, artist, album, and URI fields enter the existing local enrichment pipeline. Episodes and unrelated account-data files are rejected. Source: [Spotify's account-data documentation](https://support.spotify.com/us/article/understanding-your-data/).

## Import pipeline

1. Parse and validate a Spotify playlist URL, URI, or ID.
2. Generate a 64-character verifier, SHA-256 PKCE challenge, and CSRF state in the browser.
3. Save only the pending verifier, state, playlist ID, and redirect URI in `sessionStorage` for the authorization round trip.
4. Exchange the returned authorization code directly with Spotify.
5. Fetch the first current `/items` page, then overlap up to three known remaining 50-item pages at a time. Preserve playlist order after responses return, retain track/artist/album identities and recording release date, skip local files, unavailable items, and podcast episodes, and honor `Retry-After` per page with a bounded retry policy. Unknown-total responses keep the conservative sequential fallback.
6. Discard the access token after the import and run the existing enrichment cascade locally.
7. Show the lightweight timeline as soon as the lookup is parsed; lazy-load and cache the larger geography and genre-space layers.

## Benchmark contract

`npm run benchmark:playlist-import` measures ten deterministic 100–1,000-position canonical slices through the current Spotify response adapter and enrichment cascade. The checked-in result records pagination requests and estimated payload bytes, cold lookup parse time, warm/cold analysis time, and placement coverage. It intentionally excludes network and authorization latency and is labeled accordingly. A separate fixed-latency simulation compares one-at-a-time and three-at-a-time pagination; it is clearly labeled synthetic and must not be reported as observed Spotify production latency.

The real acceptance benchmark remains ten consented playlists owned by or collaborative with allowlisted testers. For each one, record playlist size, cold and warm authorization-to-first-view latency, total import time, requests, 429/403 behavior, exact track and artist cache-hit rates, genre/time/map/genre-space coverage, skipped items, browser/device, and tested date. Do not substitute scraped public playlists.
