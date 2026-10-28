import fs from 'node:fs';
import path from 'node:path';
import { parse } from 'csv-parse/sync';
import { stringify } from 'csv-stringify/sync';

const root = process.cwd();
const rows = parse(fs.readFileSync(path.join(root, 'data', 'songs-for-self.enriched.csv'), 'utf8'), { columns: true, skip_empty_lines: true });
const cache = JSON.parse(fs.readFileSync(path.join(root, 'data', 'wikidata-artist-genre-cache.json'), 'utf8'));
const byArtist = new Map();
for (const row of rows.filter((item) => item.spotify_track_id)) {
  const artist = row.artist_names.split(';')[0].trim();
  const group = byArtist.get(artist) ?? [];
  group.push(row);
  byArtist.set(artist, group);
}

const report = Object.values(cache.artists).map((evidence) => {
  const artistRows = byArtist.get(evidence.artist) ?? [];
  const classified = artistRows.filter((row) => row.genre_source === `wikidata:name/P136/${evidence.wikidataId}`);
  const overridden = artistRows.filter((row) => row.genre_source.startsWith('editorial:genre-overrides/'));
  return {
    artist: evidence.artist,
    playlist_tracks: artistRows.length,
    wikidata_classified_tracks: classified.length,
    editorially_overridden_tracks: overridden.length,
    current_family: mostCommon(classified.map((row) => row.genre_family)),
    current_primary: mostCommon(classified.map((row) => row.genre_primary)),
    wikidata_genres: evidence.genres.join('; '),
    occupations: evidence.occupations.join('; '),
    instances: evidence.instances.join('; '),
    wikidata_id: evidence.wikidataId,
    source_url: evidence.sourceUrl,
    match_method: evidence.matchMethod,
  };
}).sort((left, right) =>
  right.wikidata_classified_tracks - left.wikidata_classified_tracks
  || right.playlist_tracks - left.playlist_tracks
  || left.artist.localeCompare(right.artist),
);

const outputPath = path.join(root, 'data', 'wikidata-genre-review.csv');
fs.writeFileSync(outputPath, stringify(report, { header: true }));
console.log(JSON.stringify({
  output: outputPath,
  cachedArtists: report.length,
  withGenres: report.filter((row) => row.wikidata_genres).length,
  classifiedArtists: report.filter((row) => row.wikidata_classified_tracks > 0).length,
  classifiedTracks: report.reduce((total, row) => total + row.wikidata_classified_tracks, 0),
  overriddenArtists: report.filter((row) => row.editorially_overridden_tracks > 0).length,
}, null, 2));

function mostCommon(values) {
  const counts = new Map();
  for (const value of values.filter(Boolean)) counts.set(value, (counts.get(value) ?? 0) + 1);
  return [...counts].sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))[0]?.[0] ?? '';
}
