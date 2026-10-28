# Songs for Self data model

The canonical dataset is one row per playlist entry. Spotify identifiers are preserved so later enrichment is reproducible and auditable.

## Core playlist fields

- `playlist_position`
- `spotify_track_id`
- `spotify_track_url`
- `track_name`
- `artist_names`
- `spotify_artist_ids`
- `album_name`
- `spotify_album_id`
- `date_added`
- `duration_ms`
- `explicit`

## Release-time fields

- `release_date`
- `release_year`
- `release_date_precision`
- `original_release_year`
- `release_year_confidence`
- `release_year_source`
- `release_year_estimated` — `true` when the year is an explicit inference rather than a catalog date
- `timeline_year` — the year used by the visualization
- `timeline_year_kind` — sourced release, estimated release, or estimated composition
- `timeline_year_confidence`
- `timeline_year_source`

Release-time precedence is:

1. Wikidata track publication date from an exact Spotify track-ID match.
2. Wikidata album publication date from an exact Spotify album-ID match.
3. MusicBrainz release-group `first-release-date` from a high-confidence album-title and primary-artist match.
4. MusicBrainz recording `first-release-date` from a high-confidence title, artist, and duration match.
5. A same-album playlist match, artist catalog median, or artist active-period estimate.
6. A low-confidence genre catalog median only when no artist-level evidence is available.

The MusicBrainz fallbacks are marked medium confidence. For classical music, `timeline_year` estimates the work's composition era from the composer's lifespan or historical-period classification while preserving the recording's release date in `release_year`.

## Genre fields

- `genre_family` — Classical, Experimental, Country, Electronic, Modern Folk, Hip-hop, Jazz, Pop, R&B/Soul/Blues, Rock, World, Traditional Folk, or an explicit insufficient-evidence Other
- `genre_primary`
- `genre_secondary`
- `historical_period` — for example Baroque, Romantic, Bebop, or British invasion
- `genre_confidence`
- `genre_source`
- `genre_evidence` — semicolon-delimited evidence identifiers for editorial decisions; otherwise the field-level source
- `genre_estimated` — `true` for inferred or estimated catalog placement, `false` for direct or explicitly reviewed evidence

Genre-family precedence is:

1. A versioned artist decision in `genre-overrides.json`, with rationale and evidence retained in the CSV.
2. Canonical classification of direct external genre labels.
3. The modal family of directly sourced tracks by the same Spotify artist ID or normalized artist name.
4. Conservative metadata classification when a recognized genre label exists.
5. Other / insufficient evidence rather than an unsupported specific claim.

The classifier scores each source label at most once per family so overlapping aliases such as `world` and `world music` cannot overpower a specific Jazz, Hip-hop, Rock, Country, or Folk label. American folk, country, indie, and rock are not treated as World music by default.

## Geography fields

- `origin_city`
- `origin_region`
- `origin_country`
- `origin_latitude`
- `origin_longitude`
- `origin_scope` — artist, composer, ensemble, or recording
- `origin_confidence`
- `origin_source`
- `origin_estimated` — `true` for inferred name matches, country centroids, or genre-level fallbacks

Geography precedence is:

1. Wikidata formation place or birthplace from an exact Spotify artist-ID match.
2. A matching artist already resolved elsewhere in the playlist.
3. An exact Wikidata artist-name or alias match.
4. A high-confidence MusicBrainz artist-name match, joined to Wikidata coordinates through the MusicBrainz area ID.
5. A sourced artist country rendered at a country centroid.
6. A clearly marked low-confidence genre-country fallback only when no artist-level origin evidence is available.

## Provenance and QA

- `data_status` — raw, enriched, reviewed, or needs_review
- `enriched_at`
- `notes`

Release date and geography are intentionally source-specific: a reissue date is not the same as an original recording date, and an artist's birthplace is not always the best musical origin. V3 prioritizes complete visual coverage, but every estimate is labeled with its method and confidence so it can be replaced by better evidence later.
