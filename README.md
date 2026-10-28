# Songs for Self

Songs for Self is a source-traceable atlas of one 7,733-position Spotify playlist. The published dataset keeps all 151 unavailable positions, and gives each of the 7,582 available tracks an explicit genre, musical-time, and geography placement with source, method, confidence, and estimate status.

- Live site: <https://ai.rhyslindmark.com/music>
- Full data and release workflow: [`RUNBOOK.md`](RUNBOOK.md)
- Spotify authorization and import contract: [`SPOTIFY_IMPORT.md`](SPOTIFY_IMPORT.md)
- Dataset compatibility and migration notes: [`DATA_VERSIONING.md`](DATA_VERSIONING.md)
- Responsive checks: [`RESPONSIVE_TESTING.md`](RESPONSIVE_TESTING.md)

## Local start

Use Node 22.13 or newer.

```sh
npm install
npm run dev
```

The canonical source is `data/songs-for-self.enriched.csv`. Browser-local visitor analysis uses generated public lookup data and does not upload playlist contents to a server.

Before proposing a change, run the validation sequence appropriate to it from [`RUNBOOK.md`](RUNBOOK.md). Do not run the raw enrichment chain casually: its first stage rebuilds the canonical enriched CSV from `data/songs-for-self.raw.csv`, so a partial run can temporarily replace later reviewed fields until the complete pipeline is reapplied.

## Public-source release and privacy

This release excludes the private development history, hosting identity, and operational task backlog. The included reference playlist and enrichment metadata are the same dataset intentionally published by the live Music project. Visitor playlists and Spotify tokens are not bundled; imported playlists are processed in the visitor’s browser. Spotify authorization uses PKCE and a public Client ID; no client secret is required or included. Do not commit OAuth tokens, `.env` files, or account exports. Third-party track and artist metadata retain their respective rights.

The checked-in `.openai/hosting.json` is a nonsecret local configuration with no project ID or resource bindings, so the Vite import resolves without exposing the original deployment identity. For a hosted fork, register your own deployment and supply its project ID; never reuse the original site’s credentials.
