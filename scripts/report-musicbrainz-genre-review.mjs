import fs from 'node:fs';
import path from 'node:path';
import { parse } from 'csv-parse/sync';
import { stringify } from 'csv-stringify/sync';

const root = process.cwd();
const playlist = parse(fs.readFileSync(path.join(root, 'data', 'songs-for-self.enriched.csv'), 'utf8'), {
  columns: true,
  skip_empty_lines: true,
});
const profileCache = readJson(path.join(root, 'data', 'musicbrainz-artist-cache.json'), { artists: {} });
const genreCache = readJson(path.join(root, 'data', 'musicbrainz-artist-genre-cache.json'), { artists: {} });
const outputPath = path.join(root, 'data', 'musicbrainz-genre-review.csv');

const byArtist = new Map();
for (const row of playlist.filter((item) => item.spotify_track_id)) {
  const artist = row.artist_names.split(';')[0].trim();
  const group = byArtist.get(artist) ?? [];
  group.push(row);
  byArtist.set(artist, group);
}

const report = Object.values(genreCache.artists ?? {}).map((evidence) => {
  const rows = byArtist.get(evidence.artist) ?? [];
  const classified = rows.filter((row) => row.genre_source === `musicbrainz:artist-genres/${evidence.musicbrainzArtistId}`);
  const overridden = rows.filter((row) => row.genre_source.startsWith('editorial:genre-overrides/'));
  const profile = profileCache.artists?.[evidence.artist] ?? {};
  return {
    artist: evidence.artist,
    playlist_tracks: rows.length,
    musicbrainz_classified_tracks: classified.length,
    editorially_overridden_tracks: overridden.length,
    current_family: mostCommon(classified.map((row) => row.genre_family)),
    current_primary: mostCommon(classified.map((row) => row.genre_primary)),
    matched_name: evidence.matchedName ?? profile.matchedName ?? '',
    match_score: evidence.matchScore ?? profile.score ?? '',
    identity_review_priority: identityReviewPriority(evidence, profile),
    artist_type: profile.type ?? '',
    country: profile.country ?? '',
    area: profile.area ?? '',
    begin_area: profile.beginArea ?? '',
    direct_genres: labels(evidence.genres),
    community_tags: labels(evidence.tags),
    musicbrainz_artist_id: evidence.musicbrainzArtistId ?? '',
    source_url: evidence.sourceUrl ?? '',
    retryable: Boolean(evidence.retryable),
    error: evidence.error ?? '',
  };
}).sort((left, right) =>
  right.musicbrainz_classified_tracks - left.musicbrainz_classified_tracks
  || right.playlist_tracks - left.playlist_tracks
  || left.artist.localeCompare(right.artist),
);

fs.writeFileSync(outputPath, stringify(report, { header: true }));
console.log(JSON.stringify({
  output: outputPath,
  cachedArtists: report.length,
  classifiedArtists: report.filter((row) => row.musicbrainz_classified_tracks > 0).length,
  classifiedTracks: report.reduce((total, row) => total + row.musicbrainz_classified_tracks, 0),
  overriddenArtists: report.filter((row) => row.editorially_overridden_tracks > 0).length,
}, null, 2));

function labels(values = []) {
  return values.map((value) => `${value.name} (${value.count})`).join('; ');
}

function mostCommon(values) {
  const counts = new Map();
  for (const value of values.filter(Boolean)) counts.set(value, (counts.get(value) ?? 0) + 1);
  return [...counts].sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))[0]?.[0] ?? '';
}

function identityReviewPriority(evidence, profile) {
  const score = Number(evidence.matchScore ?? profile.score ?? 0);
  const requested = normalize(evidence.artist);
  const matched = normalize(evidence.matchedName ?? profile.matchedName);
  if (requested && matched && requested !== matched) return 'high: alias or different canonical name';
  if (score < 80) return 'high: low search score';
  if (score < 95 || !(profile.country || profile.area || profile.beginArea)) return 'medium: verify exact-name identity';
  return 'low';
}

function normalize(value) {
  return String(value ?? '').replace(/&/g, ' and ').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function readJson(filePath, fallback) {
  return fs.existsSync(filePath) ? JSON.parse(fs.readFileSync(filePath, 'utf8')) : fallback;
}
