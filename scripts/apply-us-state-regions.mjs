import fs from 'node:fs';
import path from 'node:path';
import { parse } from 'csv-parse/sync';
import { stringify } from 'csv-stringify/sync';

const root = process.cwd();
const inputPath = path.join(root, 'data', 'songs-for-self.enriched.csv');
const publicPaths = [path.join(root, 'public', 'songs-for-self-v2.csv'), path.join(root, 'public', 'songs-for-self-v3.csv')];
const cache = JSON.parse(fs.readFileSync(path.join(root, 'data', 'us-state-coordinate-cache.json'), 'utf8'));
const assignments = new Map(cache.assignments.map((assignment) => [assignment.key, assignment]));
const rows = parse(fs.readFileSync(inputPath, 'utf8'), { columns: true, skip_empty_lines: true });
const reviewedAt = '2026-08-31T00:00:00.000Z';
let assignedRows = 0;
let preservedRows = 0;
let replacedLegacyRegionRows = 0;

const output = rows.map((row) => {
  if (!row.spotify_track_id || row.origin_country !== 'United States' || !row.origin_city) return row;
  const key = coordinateKey(Number(row.origin_latitude), Number(row.origin_longitude));
  const assignment = assignments.get(key);
  if (!assignment) return row;
  const replacedRegion = row.origin_region && normalize(row.origin_region) !== normalize(assignment.state) ? row.origin_region : '';
  if (row.origin_region_id === assignment.regionId && row.origin_region === assignment.state) {
    preservedRows += 1;
    return row;
  }
  if (replacedRegion) replacedLegacyRegionRows += 1;
  assignedRows += 1;
  return {
    ...row,
    origin_region: assignment.state,
    origin_region_id: assignment.regionId,
    origin_city_id: `city:united-states/${slug(assignment.state)}/${slug(row.origin_city)}`,
    origin_source: mergeSources(row.origin_source, `census:state-boundary/${assignment.fips}`, cache.source.url, assignment.method === 'named-locality override' ? 'editorial:named-locality-state/2026-08-31' : ''),
    notes: mergeNotes(row.notes, replacedRegion ? `Previous non-state origin_region “${replacedRegion}” normalized to Census state “${assignment.state}”.` : ''),
    enriched_at: reviewedAt,
  };
});

const columns = Object.keys(rows[0]);
const csv = stringify(output, { header: true, columns });
fs.writeFileSync(inputPath, csv);
for (const outputPath of publicPaths) fs.writeFileSync(outputPath, csv);
console.log(JSON.stringify({ assignedRows, preservedRows, replacedLegacyRegionRows, activeRows: output.filter((row) => row.spotify_track_id).length, stateRows: output.filter((row) => row.spotify_track_id && row.origin_country === 'United States' && row.origin_region_id).length }, null, 2));

function coordinateKey(latitude, longitude) {
  return `${latitude.toFixed(6)},${longitude.toFixed(6)}`;
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

function mergeNotes(...values) {
  return [...new Set(values.map((value) => String(value || '').trim()).filter(Boolean))].join(' ');
}
