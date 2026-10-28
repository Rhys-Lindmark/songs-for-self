import fs from 'node:fs';
import path from 'node:path';
import { parse } from 'csv-parse/sync';
import { buildReferenceIndex, placeTrackInEveryNoise } from '../lib/every-noise-placement.mjs';

const root = process.cwd();
const rows = parse(fs.readFileSync(path.join(root, 'data', 'songs-for-self.enriched.csv'), 'utf8'), { columns: true, skip_empty_lines: true })
  .filter((row) => row.spotify_track_id);
const albumCache = JSON.parse(fs.readFileSync(path.join(root, 'data', 'musicbrainz-cache.json'), 'utf8')).albums;
const reference = JSON.parse(fs.readFileSync(path.join(root, 'data', 'every-noise-reference-2023.json'), 'utf8'));
const referenceIndex = buildReferenceIndex(reference);
const artistMembershipReference = JSON.parse(fs.readFileSync(path.join(root, 'data', 'every-noise-artist-memberships.json'), 'utf8'));
const artistMemberships = new Map(Object.entries(artistMembershipReference.artists));
const musicBrainzArtistGenres = JSON.parse(fs.readFileSync(path.join(root, 'data', 'musicbrainz-artist-genre-cache.json'), 'utf8')).artists;
const wikidataArtistGenres = JSON.parse(fs.readFileSync(path.join(root, 'data', 'wikidata-artist-genre-cache.json'), 'utf8')).artists;
const catalogArtistMemberships = buildCatalogArtistMemberships(musicBrainzArtistGenres, wikidataArtistGenres);

const familyColors = {
  Classical: '#d39a00', Experimental: '#8d5f99', Country: '#ad712f', Electronic: '#168e80',
  'Modern Folk': '#7b8d4a', 'Hip-hop': '#df7625', Jazz: '#d85643', Pop: '#c53b8d',
  'R&B, Soul & Blues': '#a84c63', Rock: '#6c60dc', World: '#548b46', 'Traditional Folk': '#907b45', Other: '#66706b',
};

const points = rows.map((row) => {
  const primary = /^other\b.*insufficient evidence/i.test(row.genre_primary) ? `${row.genre_family} · best-effort placement` : row.genre_primary || row.genre_family;
  const placement = placeTrackInEveryNoise(row, referenceIndex, artistMemberships, catalogArtistMemberships);
  const trackAngle = unitHash(`${row.spotify_track_id}|angle`) * Math.PI * 2;
  const trackRadius = Math.sqrt(unitHash(`${row.spotify_track_id}|radius`)) * 0.0015;
  const x = clamp(placement.x + Math.cos(trackAngle) * trackRadius);
  const y = clamp(placement.y + Math.sin(trackAngle) * trackRadius);
  return {
    id: row.spotify_track_id,
    title: row.track_name || 'Unavailable track',
    artists: row.artist_names || 'Unknown artist',
    spotifyArtistIds: row.spotify_artist_ids ? row.spotify_artist_ids.split(';').map((value) => value.trim()).filter(Boolean) : [],
    album: row.album_name || '',
    spotifyAlbumId: row.spotify_album_id || null,
    family: row.genre_family,
    primary,
    secondary: row.genre_secondary || '',
    x: round(x),
    y: round(y),
    referenceX: placement.x,
    referenceY: placement.y,
    referenceGenres: placement.referenceGenres,
    referenceMatchCount: placement.referenceMatchCount,
    referenceConfidence: placement.referenceConfidence,
    referenceSource: placement.referenceSource,
    confidence: row.genre_confidence,
    source: row.genre_source,
    method: placement.method,
    estimated: row.genre_estimated === 'true' || placement.referenceMatchCount === 0,
  };
});

const clusterMap = new Map();
for (const point of points) {
  const key = `${point.family}|${point.primary}`;
  const cluster = clusterMap.get(key) ?? { id: `${slug(key)}-${fnv1a(key).toString(36)}`, family: point.family, label: point.primary, count: 0, x: 0, y: 0 };
  cluster.count += 1;
  cluster.x += point.x;
  cluster.y += point.y;
  clusterMap.set(key, cluster);
}
const clusters = [...clusterMap.values()].map((cluster) => ({ ...cluster, x: round(cluster.x / cluster.count), y: round(cluster.y / cluster.count) }))
  .sort((left, right) => right.count - left.count || left.label.localeCompare(right.label));
const artistMap = new Map();
for (const point of points) {
  const label = point.artists.split(';')[0].trim() || 'Unknown artist';
  const spotifyArtistId = point.spotifyArtistIds[0] ?? null;
  const key = `${point.family}|${spotifyArtistId || label.toLowerCase()}`;
  const artist = artistMap.get(key) ?? { id: `${slug(key)}-${fnv1a(key).toString(36)}`, family: point.family, label, spotifyArtistId, count: 0, x: 0, y: 0 };
  artist.count += 1;
  artist.x += point.x;
  artist.y += point.y;
  artistMap.set(key, artist);
}
const artists = [...artistMap.values()].map((artist) => ({ ...artist, x: round(artist.x / artist.count), y: round(artist.y / artist.count) }))
  .sort((left, right) => right.count - left.count || left.label.localeCompare(right.label));

const families = [...new Set(points.map((point) => point.family))].map((family) => {
  const members = points.filter((point) => point.family === family);
  return {
    family,
    x: round(members.reduce((sum, point) => sum + point.referenceX, 0) / members.length),
    y: round(members.reduce((sum, point) => sum + point.referenceY, 0) / members.length),
    color: familyColors[family] ?? '#66706b',
    count: members.length,
  };
});
const albums = Object.fromEntries([...new Set(points.map((point) => point.spotifyAlbumId).filter(Boolean))].flatMap((albumId) => {
  const cached = albumCache[albumId];
  if (!cached?.matched || !cached.musicbrainzReleaseGroupId) return [];
  return [[albumId, {
    coverUrl: `https://coverartarchive.org/release-group/${cached.musicbrainzReleaseGroupId}/front-250`,
    coverSource: 'Cover Art Archive',
    coverSourceId: cached.musicbrainzReleaseGroupId,
  }]];
}));

const payload = {
  schemaVersion: 2,
  projection: {
    name: 'Songs for Self on the Every Noise at Once 2023 reference map',
    modelVersion: 'genre-space-v2-every-noise-2023-12-04',
    referenceName: reference.referenceName,
    referenceVersion: reference.referenceVersion,
    referenceUrl: reference.originalUrl,
    referenceMirrorUrl: reference.publicMirrorUrl,
    referenceMirrorCommit: reference.publicMirrorCommit,
    artistMembershipSource: artistMembershipReference.sourceUrl,
    artistMembershipSourceUpdatedAt: artistMembershipReference.sourceUpdatedAt,
    method: 'Sourced primary and secondary labels are normalized and matched to the pinned 2023-12-04 Every Noise genre map. Multiple matches use their coordinate centroid. When a label is unsupported, a source-addressable current artist-membership bridge supplies real genre memberships whose coordinates still come from the pinned Every Noise map. The remaining unsupported tracks use the centroid of named Every Noise reference genres in their reviewed top-level family. A tiny deterministic display-only jitter separates overlapping songs; referenceX/referenceY retain the exact matched or centroid coordinate.',
    axes: [reference.axes.horizontal, reference.axes.vertical],
    reproducibleFrom: ['genre_primary', 'genre_secondary', 'genre_family', 'spotify_track_id', 'every-noise-reference-2023.json'],
  },
  summary: {
    tracks: points.length,
    families: families.length,
    clusters: clusters.length,
    artists: artists.length,
    albumCovers: Object.keys(albums).length,
    referenceGenres: reference.genreCount,
    exactReferenceTracks: points.filter((point) => point.referenceMatchCount > 0).length,
    directLabelTracks: points.filter((point) => point.method === 'every-noise-exact-genre' || point.method === 'every-noise-genre-centroid').length,
    artistMembershipTracks: points.filter((point) => point.method === 'every-noise-artist-membership-centroid').length,
    catalogArtistTracks: points.filter((point) => point.method === 'every-noise-catalog-artist-genre-centroid').length,
    familyReferenceFallbackTracks: points.filter((point) => point.referenceMatchCount === 0).length,
  },
  families,
  clusters,
  artists,
  albums,
  points,
};

const output = path.join(root, 'public', 'genre-space-data.json');
fs.writeFileSync(output, `${JSON.stringify(payload)}\n`);
console.log(JSON.stringify({ output, ...payload.summary }));

function fnv1a(value) {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

function unitHash(value) { return fnv1a(value) / 0xffffffff; }
function clamp(value) { return Math.max(0, Math.min(1, value)); }
function round(value) { return Math.round(value * 1_000_000) / 1_000_000; }
function slug(value) { return value.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''); }

function buildCatalogArtistMemberships(musicBrainz, wikidata) {
  const names = new Set([...Object.keys(musicBrainz), ...Object.keys(wikidata)]);
  return new Map([...names].flatMap((name) => {
    const mb = musicBrainz[name];
    const wd = wikidata[name];
    const genres = [
      ...(mb?.matchScore >= 80 ? (mb.genres ?? []).filter((genre) => genre.count > 0).map((genre) => genre.name) : []),
      ...(wd?.matchMethod === 'exact-name-single-musical-candidate' ? wd.genres ?? [] : []),
    ];
    const sourcePages = [
      ...(mb?.matchScore >= 80 && mb.genres?.length ? [mb.sourceUrl] : []),
      ...(wd?.matchMethod === 'exact-name-single-musical-candidate' && wd.genres?.length ? [wd.sourceUrl] : []),
    ];
    return genres.length ? [[name, { genres: [...new Set(genres)], sourcePages: [...new Set(sourcePages)] }]] : [];
  }));
}
