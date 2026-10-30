# Music map coverage

Map version **1.0.0** contains **1,000 fixed areas**:

- 50 classical composer/period areas: 43 identified composers and seven “Other composers” periods. Bach, Handel, Vivaldi, and other Baroque composers are separate areas.
- 73 early-recorded areas spanning 1900–1945, including 1920s/1930s/1940–1945 Delta blues, ragtime, early jazz, country, gospel, and named traditions beyond the United States.
- 877 modern areas: 850 actual named Every Noise styles, with 27 additional mutually exclusive era subdivisions of established styles such as rock, jazz, hip hop, soul, pop, country, house, techno, reggae, and blues.

This is an editorial discovery map, not an exhaustive classification or a measurable percentage of all music ever made. A playlist is evidence of collection coverage, not proof that its owner has listened to each track. Each area has equal weight. The score is `unique matched area IDs / 1000 × 100`.

## Stable denominator and sources

`data/music-map-rules.json` fixes historical rules, aliases, modern era boundaries, and worldwide inclusions. `public/music-map.json` freezes the release's full area list and matching evidence. Area IDs and the denominator do not change with a visitor's playlist. A future taxonomy change must increment the map version; comparisons across versions need that context.

The named genre source is the repository's pinned [Every Noise reference](https://github.com/quint-t/Every-Noise-at-Once), also described by [Every Noise at Once](https://everynoise.com/engenremap.html). It is a 2023 snapshot rather than a current census. Modern style selection uses the independent global artist index's explicit genre memberships, with a fixed worldwide inclusion list. It does not rank genres from the visitor's or Rhys's playlist. Unselected styles can remain unmatched; no nearest-neighbor substitution earns coverage.

Historical cells and era boundaries are editorial choices. They are not asserted to be exact genre invention dates or precise composition dates. The [Library of Congress Delta Blues history](https://blogs.loc.gov/nls-music-notes/2021/09/american-music-from-a-to-z-in-the-nls-music-collection-d-delta-blues/) and [blues collection essay](https://www.loc.gov/collections/songs-of-america/articles-and-essays/musical-styles/popular-songs-of-the-day/blues/) support the early-recorded blues context. Individual classical areas link to concrete IMSLP composer categories and historical period reference pages. Those sources identify composers/period context; the project's fixed boundaries and granularity remain editorial. [MusicBrainz's genre model](https://musicbrainz.org/doc/Genre) is a reminder that genre labels are community classifications rather than universal ground truth.

Regions are supplied only for explicit regional labels and reviewed historical contexts. Null means no assigned region. They are display groupings, not a claim that a worldwide style belongs exclusively to one place. Every Noise x/y coordinates describe genre space, not geographic longitude/latitude. Nearest broad-family grouping is used only to organize some display labels; it never establishes a matching genre.

## Matching and uncertainty

The pure `scoreMusicCoverage(tracks, catalog, { atlas, artistIndex })` function exports `MusicArea`, `MusicMapCatalog`, `CoverageMatch`, and `CoverageResult` from `lib/music-coverage.ts`.

One track claims **at most one primary area**. Additional tracks in the same area and duplicate playlist rows do not increase coverage. Composer-specific areas and “Other composers” are mutually exclusive. Multiple artist tags do not give one track many areas.

The evidence cascade is:

1. Identified composer by explicit composer metadata, exact complete artist name, known Spotify composer ID, or a strict title prefix such as `Bach:`. Modern recording dates do not relocate Bach into modern music. A surname substring such as `Bacharach` never matches Bach.
2. Reviewed historical artists with representative recording-era rules. These are labeled medium-confidence inferences and override possible reissue dates. Explicit original-year metadata, when supplied, takes precedence for historical genre/date bins.
3. Sourced exact track evidence, exact archive genre-space memberships, explicit supplied genre labels, compatible same-artist album evidence, then explicit global artist genres by Spotify artist ID or unique normalized artist name.

Original-year metadata takes precedence over an ordinary release/reissue year; a reviewed historical artist retains its identified style while that year selects the era. Generic classical labels cannot infer a historical work period from an ordinary modern recording date. Era-specific cells require reliable date evidence. A low-confidence catalog estimate cannot establish a decade. A known style that spans early-recorded and modern cells stays unmatched without date evidence. A modern named style without an early counterpart may be identified without a recording date, with the inferred modern context stated in its evidence.

Every match records track index, area ID, method, evidence, confidence, and source. Every unmatched track records a reason. Description-only family phrases, 12-family centroid fallbacks, fuzzy artist names, and arbitrary map proximity earn no fine-grained coverage. Unicode names remain distinguishable; ID-only artists can still match by Spotify ID. Truly unseen artists without usable genre/album/track evidence remain unmatched. This feature does not promise to classify every arbitrary song correctly and does not call an external service to guess.

The compact exact-track and compatible album evidence in the catalog are generated from the existing reviewed archive. The canonical enriched CSV and its dataset hashes are preserved. The evidence index is a fallible metadata snapshot: original recordings, compilations, reissues, arrangements, and ambiguous composer credits can still require correction.

## Regeneration and validation

Use Node 24 and the existing locked dependencies:

```sh
node scripts/build-music-map.mjs
node --test scripts/music-coverage.test.mjs
```

The generator is deterministic from the checked-in rules and source snapshots. Review a taxonomy diff and increment its version before publishing intentional map changes. Do not regenerate the broader enrichment pipeline for UI edits.

Tests cover the fixed denominator, repeated tracks, independent Baroque composers, unknown composers, exact IDs, ambiguous and Unicode names, unseen supplied metadata, reissues/original dates, real modern era splits, missing-date cases, evidence priority, album identity checks, and rejection of family-centroid guesses.
