import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const geographyPath = path.join(ROOT, 'public', 'geography-data.json');
const outputPath = path.join(ROOT, 'data', 'wikidata-artist-image-cache.json');
const geography = JSON.parse(fs.readFileSync(geographyPath, 'utf8'));
const existing = fs.existsSync(outputPath) ? JSON.parse(fs.readFileSync(outputPath, 'utf8')) : { version: 1, artists: {} };
const candidates = new Map();

for (const country of geography.countries) {
  for (const bucket of [country, ...country.children]) for (const artist of bucket.topArtists ?? []) {
    if (artist.id) candidates.set(artist.id, artist.name);
  }
}

const pending = [...candidates].filter(([id]) => !existing.artists[id]);
for (let offset = 0; offset < pending.length; offset += 150) {
  const batch = pending.slice(offset, offset + 150);
  const values = batch.map(([id]) => `"${id}"`).join(' ');
  const query = `SELECT ?spotifyId ?item ?image WHERE { VALUES ?spotifyId { ${values} } ?item wdt:P1902 ?spotifyId. OPTIONAL { ?item wdt:P18 ?image. } }`;
  const url = `https://query.wikidata.org/sparql?format=json&query=${encodeURIComponent(query)}`;
  const response = await fetch(url, { headers: { Accept: 'application/sparql-results+json', 'User-Agent': 'SongsForSelf/3.5 geography artist image enrichment (https://ai.rhyslindmark.com/music)' } });
  if (!response.ok) throw new Error(`Wikidata returned ${response.status} for batch ${offset / 150 + 1}`);
  const results = await response.json();
  const matched = new Map(results.results.bindings.filter((binding) => binding.image).map((binding) => [binding.spotifyId.value, binding]));
  for (const [id, name] of batch) {
    const binding = matched.get(id);
    if (!binding) {
      existing.artists[id] = { name, matched: false, source: 'Wikidata P1902/P18', checkedAt: new Date().toISOString() };
      continue;
    }
    const qid = binding.item.value.split('/').at(-1);
    const fileName = decodeURIComponent(binding.image.value.split('/').at(-1)).replaceAll('_', ' ');
    existing.artists[id] = {
      name,
      matched: true,
      qid,
      imageFile: fileName,
      imageUrl: `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(fileName)}?width=320`,
      imageSourceUrl: `https://commons.wikimedia.org/wiki/File:${encodeURIComponent(fileName)}`,
      source: 'Wikidata P1902/P18',
      checkedAt: new Date().toISOString(),
    };
  }
  console.log(`Wikidata artist images: ${Math.min(offset + batch.length, pending.length)}/${pending.length}`);
  if (offset + batch.length < pending.length) await new Promise((resolve) => setTimeout(resolve, 450));
}

existing.version = 1;
existing.updatedAt = new Date().toISOString();
fs.writeFileSync(outputPath, `${JSON.stringify(existing, null, 2)}\n`);
console.log(JSON.stringify({ candidates: candidates.size, queried: pending.length, matched: Object.values(existing.artists).filter((artist) => artist.matched).length, output: outputPath }, null, 2));
