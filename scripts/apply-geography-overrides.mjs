import fs from 'node:fs';
import path from 'node:path';
import { parse } from 'csv-parse/sync';
import { stringify } from 'csv-stringify/sync';

const root = process.cwd();
const inputPath = path.join(root, 'data', 'songs-for-self.enriched.csv');
const publicPaths = [path.join(root, 'public', 'songs-for-self-v2.csv'), path.join(root, 'public', 'songs-for-self-v3.csv')];
const rows = parse(fs.readFileSync(inputPath, 'utf8'), { columns: true, skip_empty_lines: true });
const document = JSON.parse(fs.readFileSync(path.join(root, 'data', 'geography-overrides.json'), 'utf8'));
const overrides = new Map(Object.entries(document.artists).map(([artist, decision]) => [normalize(artist), decision]));
const reviewedAt = `${document.updatedAt}T00:00:00.000Z`;
let repairedRows = 0;

const output = rows.map((row) => {
  if (!row.spotify_track_id) return withIds(row);
  const decision = row.artist_names.split(';').map((artist) => overrides.get(normalize(artist))).find(Boolean);
  if (!decision) return withIds(row);
  const updated = withIds({
    ...row,
    origin_city: decision.city ?? '',
    origin_region: decision.region ?? '',
    origin_country: decision.country,
    origin_latitude: String(decision.latitude),
    origin_longitude: String(decision.longitude),
    origin_scope: decision.scope,
    origin_confidence: decision.confidence ?? row.origin_confidence,
    origin_estimated: decision.estimated === undefined ? row.origin_estimated : String(decision.estimated),
    origin_source: mergeSources(row.origin_source, decision.source),
  });
  const changed = Object.keys(updated).some((key) => key !== 'enriched_at' && String(updated[key] ?? '') !== String(row[key] ?? ''));
  if (!changed) return row;
  repairedRows += 1;
  return { ...updated, enriched_at: reviewedAt };
});

const columns = [...Object.keys(rows[0]), 'origin_country_id', 'origin_region_id', 'origin_city_id'];
const csv = stringify(output, { header: true, columns });
fs.writeFileSync(inputPath, csv);
for (const outputPath of publicPaths) fs.writeFileSync(outputPath, csv);
console.log(JSON.stringify({ repairedRows, activeRows: output.filter((row) => row.spotify_track_id).length, columns: columns.slice(-3) }, null, 2));

function withIds(row) {
  const country = slug(row.origin_country);
  const region = slug(row.origin_region);
  const city = slug(row.origin_city);
  return {
    ...row,
    origin_country_id: country ? `country:${country}` : '',
    origin_region_id: country && region ? `region:${country}/${region}` : '',
    origin_city_id: country && city ? `city:${country}/${region ? `${region}/` : ''}${city}` : '',
  };
}

function normalize(value = '') {
  return String(value).normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function slug(value = '') {
  return normalize(value).replaceAll(' ', '-');
}

function mergeSources(...values) {
  return [...new Set(values.flatMap((value) => String(value || '').split(';').map((source) => source.trim()).filter(Boolean)))].join('; ');
}
