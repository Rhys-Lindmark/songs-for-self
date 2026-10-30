import fs from 'node:fs';
import { parse } from 'csv-parse/sync';
import { classifyGenres } from './music-taxonomy.mjs';

const rules = JSON.parse(fs.readFileSync('data/music-map-rules.json', 'utf8'));
const reference = JSON.parse(fs.readFileSync('data/every-noise-reference-2023.json', 'utf8'));
const atlas = JSON.parse(fs.readFileSync('public/genre-space-data.json', 'utf8'));
const artistIndex = JSON.parse(fs.readFileSync('public/artist-genre-index.json', 'utf8'));
const rows = parse(fs.readFileSync('data/songs-for-self.enriched.csv', 'utf8'), { columns: true, skip_empty_lines: true });
const norm = (value) => String(value ?? '').normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase().replace(/&/g, ' and ').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
const slug = (value) => norm(value).replace(/ /g, '-');
const aliases = Object.fromEntries(Object.entries(rules.aliases).map(([a, b]) => [norm(a), norm(b)]));
const canonical = (label) => aliases[norm(label)] || norm(label);
const sourceUrls = [reference.originalUrl, reference.publicMirrorUrl, 'https://musicbrainz.org/doc/Genre', 'https://azearlymusic.org/baroque/', 'https://www.loc.gov/collections/songs-of-america/articles-and-essays/musical-styles/popular-songs-of-the-day/blues/'];
const bluesSource = 'https://blogs.loc.gov/nls-music-notes/2021/09/american-music-from-a-to-z-in-the-nls-music-collection-d-delta-blues/';
const votes = new Map();
const frequency = new Map();
for (const artist of artistIndex.artists) {
  if (artist.method.includes('description')) continue;
  for (const raw of new Set(artist.genres.map(canonical))) {
    frequency.set(raw, (frequency.get(raw) || 0) + 1);
    const families = votes.get(raw) || new Map();
    families.set(artist.family, (families.get(artist.family) || 0) + 1);
    votes.set(raw, families);
  }
}
const artistIdsByName = new Map();
for (const artist of artistIndex.artists) {
  const key = norm(artist.name);
  if (!key) continue;
  const ids = artistIdsByName.get(key) || []; ids.push(artist.id); artistIdsByName.set(key, ids);
}
const idsForNames = (names) => [...new Set(names.flatMap((name) => artistIdsByName.get(norm(name)) || []))];
const refByKey = new Map(reference.genres.map((genre) => [norm(genre.genre), genre]));
function familyFor(genre) {
  const key = norm(genre.genre);
  if (/\bblues\b/.test(key)) return 'R&B, Soul & Blues';
  const observed = votes.get(canonical(genre.genre));
  if (observed) return [...observed].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0][0];
  const classified = classifyGenres([genre.genre]).family;
  if (classified !== 'Other') return classified;
  // Display grouping only. This never supplies a coverage match.
  return [...atlas.families].sort((a, b) => ((a.x - genre.x) ** 2 + (a.y - genre.y) ** 2) - ((b.x - genre.x) ** 2 + (b.y - genre.y) ** 2))[0].family;
}
function regionFor(label) {
  const regions = [['brazil','Brazil'],['bossa nova','Brazil'],['samba','Brazil'],['mpb','Brazil'],['forro','Brazil'],['sertanejo','Brazil'],['cuban','Cuba'],['cubano','Cuba'],['mexican','Mexico'],['mariachi','Mexico'],['ranchera','Mexico'],['corrido','Mexico'],['colombian','Colombia'],['peruvian','Peru'],['argentine','Argentina'],['tango','Argentina'],['chilean','Chile'],['puerto rican','Puerto Rico'],['dominican','Dominican Republic'],['jamaican','Jamaica'],['japanese','Japan'],['j pop','Japan'],['j rock','Japan'],['korean','South Korea'],['k pop','South Korea'],['chinese','China'],['mandopop','China'],['cantopop','Hong Kong'],['indonesian','Indonesia'],['dangdut','Indonesia'],['gamelan','Indonesia'],['filipino','Philippines'],['opm','Philippines'],['thai','Thailand'],['vietnamese','Vietnam'],['v pop','Vietnam'],['indian','India'],['hindustani','India'],['carnatic','India'],['filmi','India'],['bollywood','India'],['pakistani','Pakistan'],['bhangra','Punjab'],['nepali','Nepal'],['turkish','Turkey'],['arab','Middle East and North Africa'],['egyptian','Egypt'],['moroccan','Morocco'],['gnawa','Morocco'],['rai','Algeria'],['nigerian','Nigeria'],['ghanaian','Ghana'],['highlife','Ghana'],['south african','South Africa'],['amapiano','South Africa'],['senegalese','Senegal'],['mbalax','Senegal'],['ethiopian','Ethiopia'],['ethio jazz','Ethiopia'],['congolese','Democratic Republic of the Congo'],['soukous','Democratic Republic of the Congo'],['tanzanian','Tanzania'],['bongo flava','Tanzania'],['french','France'],['chanson','France'],['german','Germany'],['italian','Italy'],['spanish','Spain'],['flamenco','Spain'],['portuguese','Portugal'],['fado','Portugal'],['irish','Ireland'],['scottish','Scotland'],['greek','Greece'],['rebetiko','Greece'],['balkan','Balkans'],['russian','Russia'],['polish','Poland'],['swedish','Sweden'],['norwegian','Norway'],['finnish','Finland'],['icelandic','Iceland'],['australian','Australia'],['maori','New Zealand'],['hawaiian','Hawaii'],['navajo','Southwestern United States']];
  const key = norm(label);
  return regions.find(([token]) => (` ${key} `).includes(` ${token} `))?.[1] || null;
}
const composerCategory = { 'Hildegard von Bingen': 'Hildegard', 'Pérotin': 'Pérotin', 'Guillaume de Machaut': 'Machaut,_Guillaume_de', 'Guillaume Dufay': 'Du_Fay,_Guillaume', 'Josquin des Prez': 'Josquin_Desprez', 'Giovanni Pierluigi da Palestrina': 'Palestrina,_Giovanni_Pierluigi_da', 'Ludwig van Beethoven': 'Beethoven,_Ludwig_van', 'Pyotr Ilyich Tchaikovsky': 'Tchaikovsky,_Pyotr' };
const periodPage = { medieval: 'Medieval_music', renaissance: 'Renaissance_music', baroque: 'Baroque_music', classical: 'Classical_period_(music)', romantic: 'Romantic_music', modern: '20th-century_classical_music', contemporary: 'Contemporary_classical_music' };
const periodSource = (period) => `https://en.wikipedia.org/wiki/${periodPage[period.id]}`;
const periodById = new Map(rules.periods.map((period) => [period.id, period]));
const areas = [];
const classicalCenter = atlas.families.find((family) => family.family === 'Classical');
for (const composer of rules.composers) {
  const period = periodById.get(composer.period);
  const parts = composer.name.split(' ');
  const category = composerCategory[composer.name] || `${parts.at(-1)},_${parts.slice(0, -1).join('_')}`;
  areas.push({ id: `composer-${slug(composer.name)}`, label: `${period.label} · ${composer.name}`, family: 'Classical', kind: 'composer', era: period.label, startYear: period.startYear, endYear: period.endYear, x: classicalCenter.x, y: classicalCenter.y, region: null, genreKeys: period.aliases.map(norm), composerNames: composer.aliases, composerIds: idsForNames(composer.aliases), sourceUrls: [periodSource(period), `https://imslp.org/wiki/Category:${encodeURI(category)}`], editorial: true });
}
for (const period of rules.periods) areas.push({ id: `classical-${period.id}-other`, label: `${period.label} · Other composers`, family: 'Classical', kind: 'classical-period', era: period.label, startYear: period.startYear, endYear: period.endYear, x: classicalCenter.x, y: classicalCenter.y, region: null, genreKeys: period.aliases.map(norm), sourceUrls: [periodSource(period)], editorial: true });
for (const rule of rules.earlyRecorded) {
  const sourceGenre = rule.aliases.map((label) => refByKey.get(norm(label))).find(Boolean);
  const family = /blues|gospel|spiritual/i.test(rule.genre) ? 'R&B, Soul & Blues' : sourceGenre ? familyFor(sourceGenre) : /blues/i.test(rule.genre) ? 'R&B, Soul & Blues' : /jazz|ragtime|swing|bebop|dixieland/i.test(rule.genre) ? 'Jazz' : /country|bluegrass/i.test(rule.genre) ? 'Country' : 'World';
  const center = sourceGenre || atlas.families.find((entry) => entry.family === family);
  const era = rule.startYear % 10 === 0 && rule.endYear === rule.startYear + 9 ? `${rule.startYear}s` : `${rule.startYear}–${rule.endYear}`;
  areas.push({ id: `early-${slug(rule.genre)}-${rule.startYear}-${rule.endYear}`, label: `${era} · ${rule.genre}`, family, kind: 'early-recorded', era, startYear: rule.startYear, endYear: rule.endYear, x: center.x, y: center.y, region: rule.region, genreKeys: rule.aliases.map(norm), sourceUrls: /blues/i.test(rule.genre) ? [sourceUrls[0], sourceUrls[4], bluesSource] : [sourceUrls[0], 'https://musicbrainz.org/genres'], editorial: true });
}
const splitExtra = Object.values(rules.modernSplits).reduce((sum, bins) => sum + bins.length - 1, 0);
const modernGenreQuota = rules.targetAreas - areas.length - splitExtra;
const excluded = new Set(['classical', 'baroque', 'renaissance', 'medieval', 'early music', 'classical era', 'romantic', 'romantic music']);
const candidates = reference.genres.filter((genre) => !excluded.has(norm(genre.genre)));
const ranked = [...candidates].sort((a, b) => (frequency.get(canonical(b.genre)) || 0) - (frequency.get(canonical(a.genre)) || 0) || a.genre.localeCompare(b.genre));
const mandatory = [...new Set([...Object.keys(rules.modernSplits), ...rules.mandatoryModern])].map((key) => refByKey.get(norm(key))).filter(Boolean);
const selected = new Map(mandatory.map((genre) => [genre.key, genre]));
for (const genre of ranked) { if (selected.size >= modernGenreQuota) break; selected.set(genre.key, genre); }
for (const genre of [...selected.values()].sort((a, b) => a.genre.localeCompare(b.genre))) {
  const bins = rules.modernSplits[norm(genre.genre)] || [[1946, 2026]];
  for (const [startYear, endYear] of bins) {
    const era = `${startYear}–${endYear}`;
    areas.push({ id: `modern-${slug(genre.genre)}${bins.length > 1 ? `-${startYear}-${endYear}` : ''}`, label: bins.length > 1 ? `${era} · ${genre.genre}` : genre.genre, family: familyFor(genre), kind: 'modern', era, startYear, endYear, x: genre.x, y: genre.y, region: regionFor(genre.genre), genreKeys: [norm(genre.genre)], requiresYear: bins.length > 1 || rules.earlyRecorded.some((rule) => rule.aliases.some((label) => canonical(label) === canonical(genre.genre))), sourceUrls: [sourceUrls[0], sourceUrls[1]], editorial: bins.length > 1 });
  }
}
if (areas.length !== rules.targetAreas || new Set(areas.map((area) => area.id)).size !== areas.length) throw new Error(`Expected ${rules.targetAreas} unique areas, found ${areas.length}`);
const points = new Map(atlas.points.map((point) => [point.id, point]));
const trackEvidence = {};
const albumGroups = new Map();
for (const row of rows) {
  const id = row.spotify_track_id;
  if (!id) continue;
  const point = points.get(id);
  const isFamilyFallback = !point || point.method.includes('family-reference') || point.method.includes('family-centroid');
  const labels = [...new Set([...(isFamilyFallback ? [] : point.referenceGenres || []), ...(['high','medium'].includes(row.genre_confidence) ? [row.genre_primary, ...String(row.genre_secondary || '').split(/[;,|]/), ...(row.genre_family === 'Classical' && row.historical_period ? [row.historical_period] : [])] : [])].map((value) => String(value || '').trim()).filter(Boolean))];
  const year = Number(row.timeline_year) || null;
  const reliableYear = Boolean(year && row.timeline_year_source && !row.timeline_year_source.startsWith('estimate:'));
  trackEvidence[id] = { genres: labels, year, reliableYear, source: row.genre_source || point?.source || 'Archive enrichment', artist: row.artist_names, title: row.track_name, albumId: row.spotify_album_id || null };
  if (row.spotify_album_id && labels.length) {
    const group = albumGroups.get(row.spotify_album_id) || [];
    group.push(trackEvidence[id]); albumGroups.set(row.spotify_album_id, group);
  }
}
const albumEvidence = {};
for (const [id, entries] of albumGroups) {
  const artist = entries[0].artist.split(';')[0].trim();
  if (!entries.every((entry) => norm(entry.artist.split(';')[0]) === norm(artist))) continue;
  const common = entries[0].genres.filter((genre) => entries.every((entry) => entry.genres.some((other) => canonical(other) === canonical(genre))));
  if (common.length) albumEvidence[id] = { genres: common, artist, source: 'Shared sourced genre evidence across this archive album; artist identity checked' };
}
const historicalProfile = (name) => `https://en.wikipedia.org/wiki/${({ 'Jimmie Rodgers': 'Jimmie_Rodgers_(country_singer)', 'Tommy Johnson': 'Tommy_Johnson_(musician)' })[name] || name.replace(/ /g, '_')}`;
const catalog = { version: rules.version, title: 'Music map', description: 'A fixed 1,000-area discovery map, not a census of all music. One primary evidence-backed area per track; repeated tracks never add areas.', total: areas.length, sourceUrls: [...sourceUrls, bluesSource], referenceVersion: reference.referenceVersion, selection: { classicalAreas: areas.filter((a) => a.kind === 'composer' || a.kind === 'classical-period').length, earlyRecordedAreas: areas.filter((a) => a.kind === 'early-recorded').length, modernAreas: areas.filter((a) => a.kind === 'modern').length, modernNamedGenres: selected.size, method: 'Pinned Every Noise named genres ranked by independent global artist memberships, with a fixed worldwide inclusion list; explicit composer/period and early-recorded areas; a small set of mutually exclusive modern era splits. Frozen for version 1.0.0.' }, aliases, historicalArtists: rules.historicalArtists.map((artist) => ({ ...artist, sourceUrls: [historicalProfile(artist.name), ...(/blues/i.test(artist.genre) ? [bluesSource, sourceUrls[4]] : [])], spotifyIds: idsForNames(artist.aliases) })), areas, trackEvidence, albumEvidence };
fs.writeFileSync('public/music-map.json', `${JSON.stringify(catalog)}\n`);
console.log(JSON.stringify({ areas: areas.length, ...catalog.selection, trackEvidence: Object.keys(trackEvidence).length, albumEvidence: Object.keys(albumEvidence).length, bytes: fs.statSync('public/music-map.json').size }, null, 2));
