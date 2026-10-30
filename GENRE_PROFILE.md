# Playlist genre profile

`buildGenreProfile(tracks, benchmark, placements?)` reports up to ten observed broad genre families and ten metadata-derived primary genres. It counts playlist rows, so repeated rows affect composition. It does not estimate listening frequency, listening time, distinct artists, or actual plays.

Every share uses **all input rows** as its denominator, including unknown and unaligned rows. Lists contain only observed labels, without zero padding. Ties use a stable normalized key. If more than ten labels occur, the displayed list is truncated; its counts need not sum to the whole playlist.

## Metadata and counts

The broad family comes from the analyzed track, a usable genre placement, or a narrow recognized fine-genre rule. `classified` and `unclassified` describe resolution in the project's broad taxonomy. Detailed labels use at most one primary genre per row with genre evidence: precise exact-track placement, explicit supplied genre order, usable placement labels, or retained primary artist-genre metadata. Specific supplied styles remain visible in the detailed list even when they have no broad-family assignment. A known broad family supplies the fallback when fine evidence is absent.

Family-centroid decoration, unresolved labels, artist-neighborhood text, and description-only musician roles do not become detailed genres. Explicit multi-tag metadata contributes one primary label, rather than counting the row repeatedly. Genre names, artist-level inferences, and existing broad classifications remain fallible metadata; the profile does not infer sound from audio.

## Listening context source

`data/genre-listening-benchmark.json` transcribes the **On-Demand Audio Streams** column from the [Luminate 2025 U.S. chart](https://media.ceros.com/luminate-data/images/2026/01/12/0b7ed16bc520348258ba20fbcc5b8bc9/us-share-of-total-volume-by-format-and-g.png), within its [2025 year-end report](https://view.ceros.com/luminate-data/luminate-year-end-music-report-2025-1/p/1). The table was checked on 2026-10-30.

| Published cohort | U.S. on-demand audio share |
| --- | ---: |
| R&B/Hip-Hop | 24.9% |
| Rock | 18.6% |
| Pop | 11.9% |
| Country | 8.7% |
| Latin | 8.6% |
| Dance/Electronic | 3.7% |
| World Music | 2.2% |
| Christian/Gospel | 2.1% |
| Children's | 1.1% |
| Jazz | 0.8% |
| Classical | 0.8% |

These selected published shares total **83.4%**. Their rounded **16.6%** remainder covers genres not listed in the chart. The code preserves the published values and never scales these categories back to 100% or assigns an unlisted genre a zero baseline.

This is a streaming market-share comparison for the United States in full-year 2025. It describes a distribution of plays, not a distribution of individual people. Comparing playlist-row share with source play share is an approximate composition index. It cannot establish a listener percentile, a personality trait, or what a typical individual listens to.

## Editorial crosswalk

The [Luminate genres documentation](https://support.luminatedata.com/portal/en/kb/articles/luminate-genres) contains separate taxonomies. This feature follows the year-end report's categories and its World context, rather than substituting Luminate CONNECT categories. The project's crosswalk is explicit and editorial; it is not a certified Luminate assignment of these tracks.

Fine evidence takes priority over broad labels:

- K-pop, Afrobeats, and explicit reggae-related styles map to World Music. Latin pop and recognized Latin styles map to Latin. Dance-pop maps to Pop.
- Hip-hop maps to the combined R&B/Hip-Hop cohort. Explicit R&B, rhythm-and-blues, or soul labels can join it. The project's broad **R&B, Soul & Blues** family remains ambiguous without fine evidence, since Blues is separately classified and absent from the selected chart.
- Broad World is ambiguous across Latin, reggae, and many other traditions. It remains unaligned without a supported specific style.
- Jazz, Classical, Country, Electronic, Pop, Rock, and Hip-hop can use their broad families when no contradictory fine evidence exists. Rock includes explicit alternative/metal styles. Specific child or gospel labels use their own published cohorts.
- Explicit Folk or Bluegrass may use Country under the documented Billboard taxonomy. Broad Modern Folk, Traditional Folk, and Experimental alone remain unaligned. Folk rock maps to Rock. Uncertain cross-cohort hybrids remain unaligned.
- Explicit Blues, soundtrack, film-score, new-age, spoken-word, and other unsupported categories do not inherit a convenient broad-category baseline.

`aligned` and `unaligned` count comparison availability independently of broad-family classification. A row counts as aligned only when the crosswalk identifies a cohort with an explicitly published finite baseline. Every row remains in the percentage denominator. Only observed comparison cohorts are returned. A missing baseline produces no comparison, while an explicitly published zero produces `ratio: null` rather than infinity.

For example, eight Jazz rows in a twenty-row playlist yield **40%**. Against the published **0.8%** Jazz share, that is a **50× composition index** and **+39.2 percentage points**. It does not mean the person is in a particular listener percentile.

## Summary guardrails

The optional `standout` is the largest positive percentage-point difference, with at least three rows, a 5% playlist share, at least ten total rows, and at least half of all rows aligned. Smaller or poorly aligned playlists retain descriptive counts without a standout summary. A UI may choose a stricter minimum difference.

Tests cover source values and the 83.4% sum, the twenty-row Jazz example, repeated rows, stable ties, short and truncated lists, unknown data, broad-family ambiguity, K-pop/Latin-pop/dance-pop distinctions, explicit fine evidence, fallbacks, missing and zero baselines, and small-sample behavior. Run the lightweight checks with Node 24:

```sh
node --test scripts/genre-profile.test.mjs
```
