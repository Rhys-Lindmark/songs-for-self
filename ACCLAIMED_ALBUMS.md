# Critically acclaimed album coverage

Catalog version **1.0.0** contains **500 unique album identities**. A playlist earns an album when at least one row identifies that album. Repeated songs and additional songs from the same album count once. This measures representation in a playlist; it does not establish that somebody listened to the complete album.

The catalog is an editorial blend of sources, rather than a jointly issued ranking. Each album displays its verified source memberships. Selection and matching are independent of a visitor's playlist, and every album has equal weight.

## Selection recipe

The generator reserves 65 distinct albums selected from the official critic sources below, adds 301 albums shared by the Rolling Stone and book metadata pools, reserves 40 book-only albums in book sequence for older-canon breadth, and fills the remaining 94 slots by Rolling Stone position. It deduplicates complete normalized title/artist identities before counting.

The resulting source counts overlap:

| Source | Albums represented |
| --- | ---: |
| Rolling Stone 500, 2023 edition | 396 |
| 1001 Albums You Must Hear Before You Die, 2005 edition | 341 |
| Metacritic 2023 filtered score table | 15 |
| Metacritic best albums of 2024 | 15 |
| Anthony Fantano top albums of 2024 | 15 |
| Anthony Fantano top albums of 2025 | 15 |
| The Needle Drop 10/10 hub | 8 |
| Metacritic individual Fiona Apple entry | 1 |

The canonical pools use the complete [Rolling Stone 2023 MusicBrainz series](https://musicbrainz.org/series/bb3d9d84-75b8-4e67-8ad7-dcc38f764bf3) and [2005 book MusicBrainz series](https://musicbrainz.org/series/4bc2a338-e1d8-4546-8a61-640da8aaf888). These are explicitly attributed community transcriptions; the publisher rankings were not independently rechecked one by one. Book entry numbers indicate its sequence, not critical scores. The book edition is identified by its [publisher listing](https://www.penguinrandomhouseretail.com/book/?isbn=9780789313713). The nine additions in a different book-edition series are not treated as a complete book.

Primary critic sources were checked on **2026-10-30**:

- [Metacritic 2023 filtered score table](https://www.metacritic.com/browse/albums/score/metascore/year/filtered?year_selected=2023): selected first 15 displayed entries in the retrieved snapshot. This is identified as a filtered table, not an official year-end article.
- [Metacritic best albums of 2024](https://www.metacritic.com/news/best-albums-of-2024/): selected first 15 entries of the official annual list.
- [Anthony Fantano top albums of 2024](https://theneedledrop.com/opinion/top-50-albums-of-2024/) and [top albums of 2025](https://theneedledrop.com/opinion/top-50-albums-of-2025/): selected first 15 entries from each official video transcript.
- [The Needle Drop 10/10 hub](https://theneedledrop.com/1010/): eight explicitly listed albums, including To Be Kind, The Turning Wheel, and Sinner Get Ready. This records what the page lists, rather than claiming to enumerate every 10/10 review.
- [Metacritic's Fetch the Bolt Cutters entry](https://www.metacritic.com/music/fetch-the-bolt-cutters/fiona-apple/): an individually verified critically acclaimed album, without asserting annual-list membership.

These selected memberships are a finite snapshot. An album can have additional acclaim that is not included in the checked-in source ledger. New publisher lists do not silently change this catalog or its denominator.

## Data and regeneration

`data/acclaimed-albums-sources.json` contains the factual source ledger, canonical MusicBrainz core records, selected critic metadata, and reviewed aliases. `scripts/build-acclaimed-albums.mjs` deterministically creates `public/acclaimed-albums.json`. The public catalog is about 234 KB and requires no network request to regenerate.

MusicBrainz release-group titles, artist credits, release dates, series, and relationship metadata are core data covered by its [CC0 data license](https://musicbrainz.org/doc/About/Data_License); see also the [database documentation](https://musicbrainz.org/doc/MusicBrainz_Database). Publisher reviews, book prose, annotations, and MusicBrainz supplementary tags are excluded. Only short factual title/artist/year/source-position selections are retained from the official critic pages. Per-source metadata fact budgets are recorded and recomputed by the generator, all below 150 words per page. There are no copied review excerpts or invented ratings.

MusicBrainz-backed IDs use `mbid-<release-group UUID>`, preserving a durable identity and allowing existing cover-art lookup. Other IDs use stable artist/title slugs. Spotify album IDs are not invented: the matcher may learn an ID from the existing reference atlas only after its album title and artist both match the catalog.

Use Node 24 with the repository's existing dependencies:

```sh
node scripts/build-acclaimed-albums.mjs
node --test scripts/acclaimed-albums.test.mjs
```

Increment the version for intentional catalog membership changes. Review evidence and preserve existing IDs when correcting source metadata. Do not rerun the music enrichment pipeline for this feature.

## Matching

`scoreAcclaimedAlbums(tracks, catalog, { atlas })` returns a stable denominator, unique covered count, percentage, one match at most per input row, and a reason for each unmatched row. It makes no external lookup or genre-based guess.

Matching prefers a catalog Spotify album ID, then an album ID verified against the atlas. Explicit title and artist metadata must agree with that trusted ID. Otherwise both the complete album title and artist identity must match. An explicit album artist takes precedence over the song's performer or guest credits.

Known title/artist aliases are scoped to catalog entries. MusicBrainz joint album-credit components may serve as explicit artist aliases. Reviewed group-credit variants include the Experience's Hendrix credit and Prince's Revolution credit; the White Album nickname is scoped to the Beatles' self-titled album. A matching artist name alone never earns an album, and an artist substring does not identify a different artist.

Recognized remaster, deluxe, expanded, and anniversary suffixes may identify editions of the same album. Live recordings, re-recordings, covers, tributes, remixes, demos, and acoustic versions retain their meaningful qualifiers. Punctuation, accents, and Unicode text normalize conservatively. Same-titled albums by different artists remain distinct.

An exact Spotify track ID may fill absent metadata from the reference atlas, with supplied fields preserved and checked. Conflicting reference metadata does not manufacture a different listed album from text alone. A verified album ID can establish a legitimate different release of the same song, such as a listed compilation. An unlisted compilation never automatically earns the source studio album, and song-title similarity is not album evidence.

Incomplete and unfamiliar metadata remain unmatched with visible reasons. A missing artist cannot be repaired from album title alone, except where an independently verified album ID or compatible exact-track reference supplies the identity. These conservative rules can miss legitimate albums until metadata or aliases are corrected; they avoid awarding albums from unsupported associations.

Tests cover the fixed 500 catalog, source budgets and attribution, duplicates, known and learned IDs, metadata conflicts, valid compilation releases, exact-track enrichment, album artists, joint credits, meaningful versions, aliases, Unicode, and same-title albums.
