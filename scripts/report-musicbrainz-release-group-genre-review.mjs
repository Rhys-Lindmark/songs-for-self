import fs from 'node:fs';
import path from 'node:path';
import { parse } from 'csv-parse/sync';
import { stringify } from 'csv-stringify/sync';
import { classifyRankedGenres } from './music-taxonomy.mjs';

const root = process.cwd();
const rows = parse(fs.readFileSync(path.join(root, 'data', 'songs-for-self.enriched.csv'), 'utf8'), { columns: true, skip_empty_lines: true });
const albumCache = JSON.parse(fs.readFileSync(path.join(root, 'data', 'musicbrainz-cache.json'), 'utf8'));
const genreCache = JSON.parse(fs.readFileSync(path.join(root, 'data', 'musicbrainz-release-group-genre-cache.json'), 'utf8'));
const reportPath = path.join(root, 'data', 'musicbrainz-release-group-genre-review.csv');
const report = [];

for (const evidence of Object.values(genreCache.releaseGroups ?? {})) {
  const directGenres = (evidence.genres ?? []).filter((item) => item.count > 0);
  const tags = (evidence.tags ?? []).filter((item) => item.count > 0);
  const classification = classifyRankedGenres([
    ...directGenres.map((item) => ({ ...item, kind: 'genre' })),
    ...tags.map((item) => ({ ...item, kind: 'tag' })),
  ]);
  const albumIds = Object.values(albumCache.albums ?? {})
    .filter((album) => album.musicbrainzReleaseGroupId === evidence.musicbrainzReleaseGroupId)
    .map((album) => album.spotifyAlbumId);
  const matchingRows = rows.filter((row) => albumIds.includes(row.spotify_album_id));
  report.push({
    track_count: matchingRows.length,
    artist: evidence.matchedArtist,
    album: evidence.matchedTitle,
    resulting_family: classification.family,
    direct_genres: labels(directGenres),
    community_tags: labels(tags),
    match_score: evidence.matchScore ?? '',
    musicbrainz_release_group_id: evidence.musicbrainzReleaseGroupId,
    source_url: evidence.sourceUrl ?? '',
    playlist_examples: matchingRows.slice(0, 4).map((row) => row.track_name).join(' | '),
  });
}

report.sort((left, right) => right.track_count - left.track_count || left.artist.localeCompare(right.artist) || left.album.localeCompare(right.album));
fs.writeFileSync(reportPath, stringify(report, { header: true }));
console.log(JSON.stringify({ rows: report.length, classifiable: report.filter((row) => row.resulting_family !== 'Other').length, reportPath }, null, 2));

function labels(values) {
  return values.map((item) => `${item.name} (${item.count})`).join('; ');
}
