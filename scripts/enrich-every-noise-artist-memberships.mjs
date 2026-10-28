import fs from 'node:fs';
import path from 'node:path';
import { parse } from 'csv-parse/sync';
import { buildReferenceIndex, normalizeGenre } from '../lib/every-noise-placement.mjs';

const root = process.cwd();
const cacheDir = path.resolve(process.argv[2] ?? '/tmp/songs-for-self-notevery-cache');
const sourceRoot = 'https://noteverynoise.com/';
const reference = JSON.parse(fs.readFileSync(path.join(root, 'data', 'every-noise-reference-2023.json'), 'utf8'));
const referenceIndex = buildReferenceIndex(reference);
const rows = parse(fs.readFileSync(path.join(root, 'data', 'songs-for-self.enriched.csv'), 'utf8'), { columns: true, skip_empty_lines: true })
  .filter((row) => row.spotify_track_id);
const targetArtistIds = new Set(rows.flatMap((row) => String(row.spotify_artist_ids ?? '').split(';').map((value) => value.trim()).filter(Boolean)));

fs.mkdirSync(cacheDir, { recursive: true });
const rootHtml = await cachedFetch(sourceRoot, path.join(cacheDir, 'index.html'));
const pages = unique([...rootHtml.matchAll(/<a href="([a-z0-9]+\.html)" style="[^"]*">([^<]+)<\/a>/g)].map((match) => ({
  href: match[1],
  genre: decodeHtml(match[2]).trim(),
})));

const artistMap = new Map();
let cursor = 0;
const workers = Array.from({ length: 4 }, async () => {
  while (cursor < pages.length) {
    const page = pages[cursor++];
    const html = await cachedFetch(new URL(page.href, sourceRoot).href, path.join(cacheDir, page.href));
    for (const item of html.matchAll(/<li><a href="https:\/\/open\.spotify\.com\/artist\/([A-Za-z0-9]{22})">([^<]+)<\/a>[^<]*(.*?)<\/li>/g)) {
      const artistId = item[1];
      if (!targetArtistIds.has(artistId)) continue;
      const membershipGenres = [...item[3].matchAll(/<a href="[^"]+\.html">([^<]+)<\/a>/g)]
        .map((match) => decodeHtml(match[1]).trim())
        .filter((genre) => referenceIndex.has(normalizeGenre(genre)));
      if (membershipGenres.length === 0) continue;
      const artist = artistMap.get(artistId) ?? { spotifyArtistId: artistId, name: decodeHtml(item[2]).trim(), genres: new Set(), sourcePages: new Set() };
      for (const genre of membershipGenres) artist.genres.add(genre);
      artist.sourcePages.add(new URL(page.href, sourceRoot).href);
      artistMap.set(artistId, artist);
    }
    await new Promise((resolve) => setTimeout(resolve, 125));
  }
});
await Promise.all(workers);

const artists = Object.fromEntries([...artistMap.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([artistId, artist]) => [artistId, {
  spotifyArtistId: artist.spotifyArtistId,
  name: artist.name,
  genres: [...artist.genres].sort((left, right) => left.localeCompare(right)),
  sourcePages: [...artist.sourcePages].sort((left, right) => left.localeCompare(right)),
}]));
const retrievedAt = new Date(Math.max(fs.statSync(path.join(cacheDir, 'index.html')).mtimeMs, ...pages.map((page) => fs.statSync(path.join(cacheDir, page.href)).mtimeMs))).toISOString();
const payload = {
  schemaVersion: 1,
  sourceName: 'Not Every Noise at Once',
  sourceUrl: sourceRoot,
  sourceModel: 'Spotify artist genre co-occurrence Word2Vec with cosine-kernel PCA, linearly fitted to Every Noise dimensions',
  sourceUpdatedAt: '2026-08-18',
  retrievedAt,
  usageNote: 'Artist-to-genre membership bridge only. Coordinates always come from the separately pinned 2023-12-04 Every Noise reference; this source is not represented as official Every Noise data.',
  pagesScanned: pages.length,
  targetArtists: targetArtistIds.size,
  matchedArtists: Object.keys(artists).length,
  artists,
};
const output = path.join(root, 'data', 'every-noise-artist-memberships.json');
fs.writeFileSync(output, `${JSON.stringify(payload)}\n`);
console.log(JSON.stringify({ output, pagesScanned: pages.length, targetArtists: targetArtistIds.size, matchedArtists: payload.matchedArtists }));

async function cachedFetch(url, destination) {
  if (fs.existsSync(destination)) return fs.readFileSync(destination, 'utf8');
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await fetch(url, { headers: { 'user-agent': 'SongsForSelfResearch/1.0 (+https://ai.rhyslindmark.com/music)' } });
      if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
      const text = await response.text();
      fs.writeFileSync(destination, text);
      return text;
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, attempt * 750));
    }
  }
  throw new Error(`Failed to fetch ${url}: ${lastError instanceof Error ? lastError.message : String(lastError)}`);
}

function unique(items) {
  return [...new Map(items.map((item) => [item.href, item])).values()];
}

function decodeHtml(value) {
  return value.replaceAll('&amp;', '&').replaceAll('&quot;', '"').replaceAll('&#39;', "'").replaceAll('&#x27;', "'").replaceAll('&lt;', '<').replaceAll('&gt;', '>');
}
