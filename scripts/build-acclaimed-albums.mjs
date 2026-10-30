import fs from 'node:fs';
import { normalizeAcclaimedAlbumTitle } from '../lib/acclaimed-albums.ts';

const input = JSON.parse(fs.readFileSync('data/acclaimed-albums-sources.json', 'utf8'));
const sourceById = new Map(input.sources.map((source) => [source.id, source]));
const normalizeArtist = (value) => value.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase().replace(/['’ʼ]/gu, '').replace(/&/gu, ' and ').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
const identity = (title, artist) => `${normalizeAcclaimedAlbumTitle(title)}|${normalizeArtist(artist)}`;
const slug = (value) => normalizeArtist(value).replace(/ /g, '-');
const records = new Map();
const identities = new Map();
function addMemberships(target, memberships) {
  for (const membership of memberships) if (!target.memberships.some((existing) => existing.sourceId === membership.sourceId && existing.position === membership.position)) target.memberships.push(membership);
}
function register(record) {
  const key = identity(record.title, record.artist);
  const existing = identities.get(key);
  if (existing) { addMemberships(existing, record.memberships); return existing; }
  const album = { ...record, memberships: [...record.memberships] };
  records.set(album.id, album); identities.set(key, album);
  return album;
}
for (const item of input.canonicalAlbums) register({ ...item, id: `mbid-${item.musicBrainzReleaseGroupId}` });
for (const album of records.values()) {
  const components = album.artistCreditComponents || [];
  // These are complete MusicBrainz album-credit components, not arbitrary guests on a song.
  if (components.length > 1) album.artistAliases = [...components];
  for (const rule of input.reviewedAliases || []) {
    if (normalizeArtist(rule.artist) !== normalizeArtist(album.artist) || (rule.title && normalizeAcclaimedAlbumTitle(rule.title) !== normalizeAcclaimedAlbumTitle(album.title))) continue;
    album.titleAliases = [...new Set([...(album.titleAliases || []), ...(rule.titleAliases || [])])];
    album.artistAliases = [...new Set([...(album.artistAliases || []), ...(rule.artistAliases || [])])];
  }
}
const criticIds = new Set();
for (const item of input.criticSelections) {
  const existing = identities.get(identity(item.title, item.artist));
  const album = existing || register({ ...item, id: `album-${slug(item.artist)}-${slug(item.title)}` });
  if (existing) addMemberships(album, item.memberships);
  criticIds.add(album.id);
}
const has = (album, sourceId) => album.memberships.some((membership) => membership.sourceId === sourceId);
const position = (album, sourceId) => Math.min(...album.memberships.filter((membership) => membership.sourceId === sourceId).map((membership) => membership.position ?? 99999));
const selected = new Map();
const stages = [];
function include(name, candidates, limit = Infinity) {
  let added = 0;
  for (const album of candidates) {
    if (selected.size >= input.targetAlbums || added >= limit) break;
    if (selected.has(album.id)) continue;
    selected.set(album.id, album); added += 1;
  }
  stages.push({ name, added });
}
include('Reserved official critic selections', [...records.values()].filter((album) => criticIds.has(album.id)).sort((a, b) => (b.year || 0) - (a.year || 0) || a.id.localeCompare(b.id)));
include('Shared Rolling Stone/book canon', [...records.values()].filter((album) => has(album, 'rolling-stone-2023') && has(album, 'book-2005')).sort((a, b) => position(a, 'rolling-stone-2023') - position(b, 'rolling-stone-2023') || a.id.localeCompare(b.id)));
include('Book-only breadth allocation', [...records.values()].filter((album) => has(album, 'book-2005') && !has(album, 'rolling-stone-2023')).sort((a, b) => position(a, 'book-2005') - position(b, 'book-2005') || a.id.localeCompare(b.id)), input.selection.bookOnlyAllocation);
include('Remaining Rolling Stone canon by position', [...records.values()].filter((album) => has(album, 'rolling-stone-2023')).sort((a, b) => position(a, 'rolling-stone-2023') - position(b, 'rolling-stone-2023') || a.id.localeCompare(b.id)));
include('Remaining book canon by sequence', [...records.values()].filter((album) => has(album, 'book-2005')).sort((a, b) => position(a, 'book-2005') - position(b, 'book-2005') || a.id.localeCompare(b.id)));
function sourceDetail(membership) {
  const source = sourceById.get(membership.sourceId);
  if (!source) throw new Error(`Unknown source ${membership.sourceId}`);
  if (membership.sourceId === 'book-2005') return `2005 edition · entry ${membership.position}`;
  if (membership.sourceId === 'rolling-stone-2023') return `2023 list #${membership.position}`;
  if (membership.sourceId === 'metacritic-2023-table') return `2023 score-table row ${membership.position} · snapshot ${input.verifiedOn}`;
  if (membership.sourceId === 'needle-drop-10s') return '10/10 selection';
  if (membership.sourceId === 'metacritic-fetch') return 'Individual album entry';
  return `${source.year} annual list #${membership.position}`;
}
const albums = [...selected.values()].map((album) => ({
  id: album.id, title: album.title, artist: album.artist, year: album.year,
  ...(album.musicBrainzReleaseGroupId ? { musicBrainzReleaseGroupId: album.musicBrainzReleaseGroupId } : {}),
  sources: album.memberships.sort((a, b) => a.sourceId.localeCompare(b.sourceId)).map((membership) => ({ name: sourceById.get(membership.sourceId).name, url: sourceById.get(membership.sourceId).url, detail: sourceDetail(membership) })),
  ...(album.titleAliases?.length ? { titleAliases: album.titleAliases } : {}),
  ...(album.artistAliases?.length ? { artistAliases: album.artistAliases } : {}),
})).sort((a, b) => a.artist.localeCompare(b.artist) || a.title.localeCompare(b.title) || a.id.localeCompare(b.id));
if (albums.length !== 500 || new Set(albums.map((album) => album.id)).size !== 500 || new Set(albums.map((album) => identity(album.title, album.artist))).size !== 500) throw new Error('The acclaimed album catalog must contain exactly 500 unique album identities.');
for (const source of input.sources.filter((source) => source.kind === 'critic')) {
  const entries = input.criticSelections.filter((entry) => entry.memberships.some((membership) => membership.sourceId === source.id));
  const actualWords = entries.reduce((sum, entry) => sum + (`${entry.title} ${entry.artist} ${entry.year || ''} ${entry.memberships.find((membership) => membership.sourceId === source.id)?.position || ''}`.match(/[\p{L}\p{N}_’']+/gu) || []).length, 0);
  if (actualWords > source.maxMetadataWords || actualWords !== source.metadataWordCount || entries.length !== source.selectedCount) throw new Error(`Metadata fact budget or source ledger mismatch for ${source.id}: ${actualWords} words`);
}
if ([...criticIds].some((id) => !selected.has(id))) throw new Error('A reserved critic album was omitted.');
const sourceCounts = Object.fromEntries(input.sources.map((source) => [source.id, albums.filter((album) => album.sources.some((credit) => credit.url === source.url)).length]));
const catalog = { version: input.version, title: '500 critically acclaimed albums', description: 'A fixed 500-album blend of Rolling Stone, 1001 Albums, Metacritic, and The Needle Drop selections. Each entry retains its source.', verifiedOn: input.verifiedOn, total: 500, selection: { recipe: input.selection, stages, sourceCounts }, sources: input.sources.map(({ snapshotSha256: _snapshotSha256, ...source }) => source), albums };
fs.writeFileSync('public/acclaimed-albums.json', `${JSON.stringify(catalog)}\n`);
console.log(JSON.stringify({ albums: albums.length, stages, sourceCounts, bytes: fs.statSync('public/acclaimed-albums.json').size }, null, 2));
