# Enrichment and deployment runbook

This is the operational contract for turning playlist evidence into the exact state published at <https://ai.rhyslindmark.com/music>. `PLAN.md` defines the product; `BACKLOG.md` selects the next slice; this file defines how to execute and verify a slice without losing reviewed work.

## 1. Start safely

1. Inspect `git status`, the current main commit, `PLAN.md`, `BACKLOG.md`, `.openai/hosting.json`, and the live manifest.
2. Inspect the configured Sites source branch before branching. Do not overwrite unrelated or uncommitted work.
3. Create one focused Git worktree and branch from the latest clean main commit. Keep one milestone per worktree.
4. Install dependencies with `npm install` when `node_modules` is absent. The project requires Node 22.13 or newer.
5. Record the baseline dataset version and all coverage values from `public/dataset-manifest.json`.

The non-negotiable first-party coverage contract is:

```text
availableTracks = genrePlacements = timelinePlacements = mapPlacements = 7,582
```

`playlistPositions` remains 7,733 because unavailable Spotify entries are preserved. A change to either denominator is a reviewed data-model migration, not an incidental regeneration result.

## 2. Choose the smallest applicable data workflow

### A. Reviewed evidence or editorial correction

Use this for a new genre evidence batch, a geography correction, or a narrow source-backed fix. Add evidence to a versioned registry or the relevant override document; do not hand-edit generated CSV rows.

Run, in order:

```sh
npm run data:genre-overrides
npm run data:geography-overrides
npm run data:viz
npm run data:genre-space
npm run data:upload
npm run data:other-audit
npm run data:singleton-queue
npm run data:genre-evidence-gaps
```

Inspect the reported before/after count, the generated CSV diff, provenance fields, family totals, and evidence-gap tiers before proceeding.

### B. Browser artifact or visualization-only change

When canonical track rows did not change, rebuild only the consumers affected by the code change:

```sh
npm run data:viz
npm run data:genre-space   # when the genre-space projection or inputs changed
npm run data:upload   # only when the visitor lookup contract changed
```

`data:viz` writes the canonical `data/viz-data.json` plus the browser artifacts `data/viz-summary.json`, `public/timeline-data.json`, `public/geography-data.json`, and `public/world-outline.json`. `data:genre-space` writes the independently lazy `public/genre-space-data.json`; `data:upload` writes `public/upload-lookup.json`. The site intentionally loads timeline, geography, and genre space separately; do not import the 2 MB canonical visualization JSON into client code.

For a reviewed U.S. state-boundary refresh, run `npm run data:us-state-cache` against the documented Census KML and inspect `data/us-state-coordinate-cache.json` before `npm run data:us-state-regions`. The cache is a published, checksum-locked evidence artifact; do not hand-edit its assignments or source hash.

### C. Full external enrichment refresh

Use this only when the raw playlist or upstream evidence caches genuinely need rebuilding. `npm run data:enrich` reads `data/songs-for-self.raw.csv` and rewrites `data/songs-for-self.enriched.csv`; stopping after this command leaves later reviewed and inferred fields unapplied.

External cache stages are resumable and rate-limited. Run the applicable stages, inspect retryable and unmatched counts after each one, and respect the scripts' built-in minimum delays:

```sh
npm run data:enrich
npm run data:musicbrainz
npm run data:artist-names
npm run data:recordings
npm run data:artists
npm run data:areas
npm run data:artist-genres
npm run data:wikidata-name-genres
npm run data:release-group-genres
npm run data:discogs-release-genres
npm run data:v2
```

Then run workflow A in full. Most lookup scripts accept bounded flags such as `--limit`, `--batch-size`, `--limit-batches`, `--delay-ms`, or `--retry-unmatched`; read the target script before using a flag. Never lower provider-specific minimum delays, fabricate a match to clear a retry, or convert nationality into genre evidence.

## 3. Evidence review rules

- Preserve exact source URLs or identifiers, method, confidence, and sourced/estimated status.
- Track evidence outranks album evidence; album evidence outranks artist-wide propagation.
- Narrow decisions stay track- or album-scoped and cannot seed unrelated artist catalog propagation.
- `World` requires positive named regional, repertoire, editorial, or genre evidence. American indie folk, Americana, country, and ordinary US rock/pop stay out by default.
- Classical compositions may use a documented work/composition-era year while retaining the modern recording release separately.
- Missing identity, no authoritative hit, catalog conflict, and low-confidence lead are different research states; do not collapse them into confident guesses.
- Visitor uploads remain browser-local by default.

## 4. Version and manifest

Choose the version before final validation:

- patch: evidence or record correction with unchanged schema/taxonomy;
- minor: backward-compatible field or published-artifact addition;
- major: incompatible schema, taxonomy, or placement-meaning change.

Update the literal `datasetVersion` in `scripts/build-dataset-manifest.mjs`, add a concise migration note to `DATA_VERSIONING.md` when compatibility meaning changes, then generate the manifest last:

```sh
npm run data:manifest
```

Never hand-edit hashes. `data/dataset-manifest.json` and `public/dataset-manifest.json` must be byte-identical, and every declared artifact hash must match its file.

## 5. Required validation

For every publishable slice:

```sh
npm test
npx oxlint <changed source and script files>
git diff --check
npm run build
```

Also:

1. Parse every changed CSV/JSON file.
2. Confirm the four coverage denominators and canonical family-count sum.
3. Run mathematical timeline/geography invariants when either system changed.
4. Start the local site and test the affected interaction in a real browser.
5. For mobile or layout work, follow `RESPONSIVE_TESTING.md` and test at 320, 375, and 430 px.
6. Inspect the final diff and update `BACKLOG.md` with shipped behavior, verification evidence, caveats, and the next actionable slice.

Full-repository lint can expose pre-existing errors in unused generated UI components. That does not excuse errors in changed files: scoped lint must be clean, and any unrelated full-lint blocker should be documented rather than silently ignored.

## 6. Commit, integrate, and publish the exact state

1. Commit the validated worktree.
2. Confirm the shared main checkout is clean and conflict-free.
3. Fast-forward main to the reviewed commit. If this is not possible without overlapping edits, stop and preserve both states.
4. Push the exact main commit to the source repository configured for the Sites project in `.openai/hosting.json` using a short-lived repository credential. Never persist the token.
5. Rebuild from the exact merged main checkout.
6. Package the successful build output, not the source tree, with the `scripts/package-site.sh` helper from the installed Sites hosting skill. Resolve its current installed path rather than copying a stale plugin version.
7. Save a Sites version whose `commit_sha` exactly equals `git rev-parse HEAD` and whose archive came from that commit.
8. Deploy that saved version to the existing Songs for Self project. Preserve the public custom domain and routing; do not create a second site or change access, billing, credentials, or domain settings.
9. Wait for terminal deployment success, then run:

```sh
npm run test:production
curl -sS https://ai.rhyslindmark.com/music/dataset-manifest.json
```

10. In a browser at the custom domain, verify the changed interaction and check for console errors. For split-data changes, verify the timeline appears, the geography tab loads its artifact, and browser-local upload assets resolve below `/music`.

## 7. Finish the slice

Record the commit, dataset version, tests, build, deployment, live manifest, browser QA, remaining caveats, and next priority in `BACKLOG.md`. Remove the completed worktree only when it is clean and its commit is safely integrated. A completed sub-step is not a reason to end a sustained run early; select the next highest-priority ready backlog slice.
