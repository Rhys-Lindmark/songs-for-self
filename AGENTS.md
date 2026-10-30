# Working on Songs for Self

## Collaboration

- GitHub `Rhys-Lindmark/songs-for-self` is the source of truth.
- Both maintainers may commit and push directly to `main`; PRs, reviews, and issues are optional.
- Fetch and read new commits before editing and before pushing. Never force-push `main`.
- Re-read each file immediately before editing it. Preserve concurrent work; do not overwrite a file from an old copy.
- Keep commits focused. If a push is rejected, read the incoming diff before rebasing and preserve both sets of changes.

## Product

Preserve the existing Rhys Site design: concise functional copy, restrained styling, no invented slogans or decorative arrows. Preserve responsive layouts, keyboard access, and reduced-motion behavior.

## Checks and deployment

- Run `npm run check` and `npm run build` for application changes, plus scoped lint for changed source.
- For layout/import changes, run the relevant browser checks from `RESPONSIVE_TESTING.md` and `npm run test:album-explorer-browser` using a single local server. Stop test servers when finished.
- Pushes to `main` are checked, built, and deployed by Cloudflare Workers Builds. Do not publish through ChatGPT Sites or create a second production site.
- Configuration lives in `wrangler.jsonc` and `vite.config.ts`. Deploy the framework-generated `dist/server/wrangler.json` through `npm run deploy`.
- Keep `/music` URLs and the root Worker origin working. API calls from the custom domain target the music Worker.

## Data and privacy

Keep manual corrections in versioned genre/geography override files with evidence. Preserve the canonical data and dataset hashes; regenerate only what the change requires. Do not rerun the raw enrichment pipeline for UI work.

Never commit credentials, `.env` files, visitor playlists, account-data exports, or private logs. Public Spotify Client IDs are identifiers, not client secrets; OAuth tokens must remain browser-local.

## Resource use

Reuse compatible checkouts and dependencies, avoid copying generated directories, and run one heavy build/browser workload at a time. Clean up task-created temporary files and servers without deleting source or other work. When the Space Saver skill is installed, read and apply it for sustained work.
