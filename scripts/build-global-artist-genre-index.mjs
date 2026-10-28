import fs from 'node:fs';
import path from 'node:path';
import { classifyGenres } from './music-taxonomy.mjs';
import { buildReferenceIndex, matchReferenceGenre } from '../lib/every-noise-placement.mjs';

const root = process.cwd();
const cacheDir = path.resolve(process.argv[2] ?? '/tmp/songs-for-self-notevery-cache');
const wikidataTsv = path.resolve(process.argv[3] ?? '/tmp/sfs-wikidata-spotify-genres.tsv');
const wikidataDescriptionTsv = path.resolve(process.argv[4] ?? '/tmp/sfs-wikidata-all-descriptions.tsv');
const wikidataArtistTsv = path.resolve(process.argv[5] ?? '/tmp/sfs-wikidata-all-spotify-artists.tsv');
const sourceRoot = 'https://noteverynoise.com/';
const reference = JSON.parse(fs.readFileSync(path.join(root, 'data', 'every-noise-reference-2023.json'), 'utf8'));
const atlas = JSON.parse(fs.readFileSync(path.join(root, 'public', 'genre-space-data.json'), 'utf8'));
const referenceIndex = buildReferenceIndex(reference);
const trainingGenres = buildTrainingGenres(atlas, referenceIndex);

if (!fs.existsSync(cacheDir)) throw new Error(`Missing Not Every Noise cache: ${cacheDir}`);
const pages = fs.readdirSync(cacheDir).filter((file) => file.endsWith('.html') && file !== 'index.html').sort();
const artistMap = new Map();
for (const page of pages) {
  const html = fs.readFileSync(path.join(cacheDir, page), 'utf8');
  for (const item of html.matchAll(/<li><a href="https:\/\/open\.spotify\.com\/artist\/([A-Za-z0-9]{22})">([^<]+)<\/a>[^<]*(.*?)<\/li>/g)) {
    const artistId = item[1];
    const memberships = [...item[3].matchAll(/<a href="[^"]+\.html">([^<]+)<\/a>/g)]
      .map((match) => decodeHtml(match[1]).trim())
      .filter((genre) => matchReferenceGenre(genre, referenceIndex).length > 0);
    if (memberships.length === 0) continue;
    const artist = artistMap.get(artistId) ?? { id: artistId, name: decodeHtml(item[2]).trim(), genres: new Set(), sourcePages: new Set() };
    memberships.forEach((genre) => artist.genres.add(genre));
    artist.sourcePages.add(new URL(page, sourceRoot).href);
    artistMap.set(artistId, artist);
  }
}

const everyNoiseArtists = [...artistMap.values()].map((artist) => {
  const genres = [...artist.genres].sort((left, right) => left.localeCompare(right));
  const matches = unique(genres.flatMap((genre) => matchReferenceGenre(genre, referenceIndex)));
  const coordinate = centroid(matches);
  const directFamily = classifyGenres(genres).family;
  const learnedFamily = directFamily === 'Other' ? nearestFamily(coordinate, trainingGenres) : directFamily;
  const primary = matches.toSorted((left, right) => distance(left, coordinate) - distance(right, coordinate))[0]?.genre ?? genres[0];
  return {
    id: artist.id,
    key: normalizeName(artist.name),
    name: artist.name,
    family: learnedFamily,
    primary,
    genres,
    x: coordinate.x,
    y: coordinate.y,
    method: directFamily === 'Other' ? 'every-noise-membership + reviewed-family nearest-neighbor' : 'every-noise-membership + taxonomy label',
    sourceUrl: [...artist.sourcePages].sort((left, right) => left.localeCompare(right))[0],
  };
}).filter((artist) => artist.family !== 'Other');

const combined = new Map(everyNoiseArtists.map((artist) => [artist.id, artist]));
let wikidataOnlyArtists = 0;
if (fs.existsSync(wikidataTsv)) {
  for (const artist of readWikidataArtists(wikidataTsv)) {
    if (combined.has(artist.id)) continue;
    const classification = classifyGenres(artist.genres);
    if (classification.family === 'Other') continue;
    const matches = unique(artist.genres.flatMap((genre) => matchReferenceGenre(genre, referenceIndex)));
    const familyCenter = atlas.families.find((family) => family.family === classification.family);
    const coordinate = matches.length > 0 ? centroid(matches) : { x: familyCenter.x, y: familyCenter.y };
    combined.set(artist.id, {
      id: artist.id,
      key: '',
      name: '',
      family: classification.family,
      primary: matches[0]?.genre ?? artist.genres[0],
      genres: artist.genres,
      x: coordinate.x,
      y: coordinate.y,
      method: 'wikidata:P136 + taxonomy label',
      sourceUrl: artist.sourceUrl,
    });
    wikidataOnlyArtists += 1;
  }
}
let wikidataDescriptionArtists = 0;
if (fs.existsSync(wikidataDescriptionTsv)) {
  const artistNames = fs.existsSync(wikidataArtistTsv) ? readWikidataArtistNames(wikidataArtistTsv) : new Map();
  for (const artist of readWikidataDescriptions(wikidataDescriptionTsv)) {
    if (combined.has(artist.id)) continue;
    const family = classifyDescriptionFamily(artist.description);
    if (!family) continue;
    const familyCenter = atlas.families.find((item) => item.family === family);
    combined.set(artist.id, {
      id: artist.id,
      key: normalizeName(artistNames.get(artist.id) ?? ''),
      name: artistNames.get(artist.id) ?? '',
      family,
      primary: artist.description,
      genres: [artist.description],
      x: familyCenter.x,
      y: familyCenter.y,
      method: 'wikidata:description + taxonomy phrase',
      sourceUrl: artist.sourceUrl,
    });
    wikidataDescriptionArtists += 1;
  }
}
const artists = [...combined.values()].sort((left, right) => left.id.localeCompare(right.id));

const payload = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  sourceName: 'Not Every Noise at Once artist memberships plus Wikidata Spotify-ID genre statements and descriptions, fitted to the pinned Every Noise 2023 space',
  sourceUrl: sourceRoot,
  wikidataQueryUrl: 'https://query.wikidata.org/',
  sourceModel: 'Every Noise-compatible artist memberships use Spotify artist genre co-occurrence; Wikidata-only artists use explicit P136 genres or explicit genre phrases in entity descriptions and reviewed family centroids when no exact reference label exists.',
  referenceUrl: reference.publicMirrorUrl,
  classificationNote: 'Direct taxonomy labels win; otherwise seven nearest source-observed reference genres vote on the reviewed top-level family.',
  artists,
};
fs.writeFileSync(path.join(root, 'public', 'artist-genre-index.json'), `${JSON.stringify(payload)}\n`);
console.log(JSON.stringify({ pages: pages.length, everyNoiseArtists: everyNoiseArtists.length, wikidataOnlyArtists, wikidataDescriptionArtists, artists: artists.length, bytes: fs.statSync(path.join(root, 'public', 'artist-genre-index.json')).size }));

function buildTrainingGenres(payload, index) {
  const votes = new Map();
  for (const point of payload.points) for (const label of point.referenceGenres ?? []) {
    const match = matchReferenceGenre(label, index)[0];
    if (!match) continue;
    const bucket = votes.get(match.key) ?? { ...match, families: new Map() };
    bucket.families.set(point.family, (bucket.families.get(point.family) ?? 0) + 1);
    votes.set(match.key, bucket);
  }
  return [...votes.values()].map((genre) => ({
    x: genre.x,
    y: genre.y,
    family: [...genre.families].sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))[0][0],
  }));
}

function nearestFamily(point, training) {
  const votes = new Map();
  for (const [index, neighbor] of training.toSorted((left, right) => distance(left, point) - distance(right, point)).slice(0, 7).entries()) {
    votes.set(neighbor.family, (votes.get(neighbor.family) ?? 0) + 1 / (index + 1));
  }
  return [...votes].sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))[0]?.[0] ?? 'Other';
}

function readWikidataArtists(file) {
  const groups = new Map();
  for (const line of fs.readFileSync(file, 'utf8').split('\n').slice(1)) {
    if (!line.trim()) continue;
    const [spotifyValue, itemValue, , genreValue] = line.split('\t');
    const id = spotifyValue?.match(/[A-Za-z0-9]{22}/)?.[0];
    const itemId = itemValue?.match(/Q\d+/)?.[0];
    const genre = genreValue?.match(/^"(.*)"@en$/)?.[1]?.replaceAll('\\"', '"');
    if (!id || !itemId || !genre) continue;
    const artist = groups.get(id) ?? { id, genres: new Set(), sourceUrl: `https://www.wikidata.org/wiki/${itemId}` };
    artist.genres.add(genre);
    groups.set(id, artist);
  }
  return [...groups.values()].map((artist) => ({ ...artist, genres: [...artist.genres].sort((left, right) => left.localeCompare(right)) }));
}

function readWikidataDescriptions(file) {
  const artists = new Map();
  for (const line of fs.readFileSync(file, 'utf8').split('\n').slice(1)) {
    if (!line.trim()) continue;
    const [spotifyValue, itemValue, descriptionValue] = line.split('\t');
    const id = spotifyValue?.match(/[A-Za-z0-9]{22}/)?.[0];
    const itemId = itemValue?.match(/Q\d+/)?.[0];
    const description = parseWikidataLiteral(descriptionValue);
    if (!id || !itemId || !description) continue;
    const current = artists.get(id) ?? { id, descriptions: [], sourceUrl: `https://www.wikidata.org/wiki/${itemId}` };
    current.descriptions.push(description);
    artists.set(id, current);
  }
  return [...artists.values()].map((artist) => ({
    ...artist,
    description: artist.descriptions.find((description) => classifyDescriptionFamily(description)) ?? '',
  })).filter((artist) => artist.description);
}

function readWikidataArtistNames(file) {
  const names = new Map();
  for (const line of fs.readFileSync(file, 'utf8').split('\n').slice(1)) {
    if (!line.trim()) continue;
    const [spotifyValue, , nameValue] = line.split('\t');
    const id = spotifyValue?.match(/[A-Za-z0-9]{22}/)?.[0];
    const name = parseWikidataLiteral(nameValue);
    if (id && name && !names.has(id)) names.set(id, name);
  }
  return names;
}

function parseWikidataLiteral(value = '') {
  return value.match(/^"(.*)"(?:@[a-z-]+)?$/)?.[1]?.replaceAll('\\"', '"') ?? '';
}

function classifyDescriptionFamily(value) {
  const description = value.toLowerCase();
  const rules = [
    ['Classical', /\b(classical|baroque|renaissance|opera|orchestral|symphony|concert pianist|concert violinist|classical composer|música clássica|música clásica|musica classica|musique classique|klassische musik|música antiga|musique ancienne)\b/],
    ['Experimental', /\b(experimental music|avant[- ]garde|noise music|electroacoustic|sound artist)\b/],
    ['Country', /\b(country (?:music )?(?:singer|musician|artist)|bluegrass|honky[- ]tonk)\b/],
    ['Electronic', /\b(electronic music|música electrónica|música eletrônica|musica elettronica|musique électronique|elektronische musik|electronica|techno|house music|ambient music|trance music|drum and bass|dubstep|disc jockey|dj)\b/],
    ['Modern Folk', /\b(folk (?:music )?(?:singer|musician|artist)|singer[- ]songwriter|folk rock|cantautor|cantautora|cantautore|cantautrice|chanteur-compositeur|chanteuse-compositrice)\b/],
    ['Hip-hop', /\b(hip[- ]hop|rapper|rappeur|rappeuse|rapero|rapera|rap artist|grime artist)\b/],
    ['Jazz', /\b(jazz|bebop|big band)\b/],
    ['Pop', /\b(pop (?:music )?(?:singer|musician|artist|group|band)|a cappella|musical theatre)\b/],
    ['R&B, Soul & Blues', /\b(rhythm and blues|r&b|soul (?:music|singer|musician)|funk (?:music|singer|musician|band)|blues (?:singer|musician|artist)|gospel)\b/],
    ['Rock', /\b(rock (?:music )?(?:singer|musician|artist|group|band)|punk rock|heavy metal|indie rock|alternative rock|post[- ]punk)\b/],
    ['World', /\b(world music|reggae|afrobeat|afrobeats|highlife|qawwali|flamenco|bossa nova|samba|rumba|calypso|gamelan|cumbia|salsa|fado|klezmer|mariachi|tango|soukous|rebetiko|raï|rai music|zouk|hindustani classical|carnatic music)\b/],
    ['Traditional Folk', /\b(traditional (?:folk )?music|música tradicional|musica tradizionale|musique traditionnelle|traditionelle musik|traditional singer|folk tradition|indigenous music|sea shant|cajun music|celtic music)\b/],
  ];
  return rules.find(([, pattern]) => pattern.test(description))?.[0] ?? '';
}

function centroid(points) {
  return {
    x: round(points.reduce((sum, point) => sum + point.x, 0) / points.length),
    y: round(points.reduce((sum, point) => sum + point.y, 0) / points.length),
  };
}
function distance(left, right) { return Math.hypot(left.x - right.x, left.y - right.y); }
function unique(items) { return [...new Map(items.map((item) => [item.key, item])).values()]; }
function normalizeName(value) { return String(value).normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim(); }
function round(value) { return Math.round(value * 1_000_000) / 1_000_000; }
function decodeHtml(value) { return value.replaceAll('&amp;', '&').replaceAll('&quot;', '"').replaceAll('&#39;', "'").replaceAll('&#x27;', "'").replaceAll('&lt;', '<').replaceAll('&gt;', '>'); }
