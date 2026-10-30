# Checks, data, and deployment

## Routine changes

Pull current `main`, make a focused change, then run:

```sh
npm run check
npx oxlint <changed-source-files>
git diff --check
npm run build
```

For UI/import changes, reuse one local server and run the relevant responsive, accessibility, album-explorer, and Spotify browser checks. See `RESPONSIVE_TESTING.md`. Stop the server afterwards.

Commit and push directly to `main`. PRs and approvals are optional. Cloudflare Workers Builds checks and builds the commit before deploying; a failure leaves the previous successful version live. GitHub Actions provides a separate visible check.

Cloudflare production settings:

- Repository: `Rhys-Lindmark/songs-for-self`
- Branch: `main`
- Worker: `songs-for-self`
- Root: `/`
- Build command: `npm run check && npm run build`
- Deploy command: `npm run deploy`
- Node version: `24`

## Verify a release

Open the successful build in Cloudflare, then run:

```sh
npm run test:production
```

Check the public `/music` page, uploaded album collection and timeline, geography, cover selection, and CSV download. For browser scripts, set `SFS_BASE_URL=https://ai.rhyslindmark.com/music` when checking production.

The music app runs on Cloudflare Workers, with `/music` proxied by the main website repository. The old ChatGPT Sites deployment is retained only as a migration fallback and is no longer the publishing path.

## Rollback

Prefer `git revert <bad-commit>` and push the revert to `main`; the same checks and deployment run. For an urgent runtime issue, roll back to the last working version in Cloudflare, then commit the matching source fix so the next push preserves it. Do not force-push shared history.

## Reviewed data corrections

The canonical source is `data/songs-for-self.enriched.csv`; generated runtime data is in `public/`. Maintain evidence in `data/genre-overrides.json`, `data/geography-overrides.json`, or the relevant versioned registry. Do not hand-edit generated rows or hashes.

After a correction, use the existing scripts appropriate to the changed evidence:

```sh
npm run data:genre-overrides
npm run data:geography-overrides
npm run data:viz
npm run data:genre-space
npm run data:upload
npm run data:manifest
```

Read `DATA_VERSIONING.md` before a dataset release. Preserve all four coverage denominators at 7,582 available tracks, 7,733 total playlist positions, and 151 unavailable positions unless an explicit data-model change is intended. Check all generated hashes and run the full tests.

Avoid `npm run data:enrich` for routine fixes: it rebuilds from raw data and can replace later reviewed fields until the complete enrichment chain is reapplied. Preserve private visitor files and OAuth tokens outside the repository.
