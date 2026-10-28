import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const input = process.argv[2];
if (!input) {
  throw new Error('Usage: node scripts/import-every-noise-reference.mjs /path/to/engenremap.html');
}

const html = fs.readFileSync(path.resolve(input), 'utf8');
const elementPattern = /<div id=item\d+[^>]*class="genre(?: scanme)?"[^>]*style="[^"]*top:\s*(\d+)px;\s*left:\s*(\d+)px;[^"]*"[^>]*>([^<]+)/g;
const extracted = [];
let match;
while ((match = elementPattern.exec(html))) {
  extracted.push({
    genre: decodeHtml(match[3]).trim(),
    left: Number(match[2]),
    top: Number(match[1]),
  });
}

if (extracted.length < 6_000) {
  throw new Error(`Expected at least 6,000 Every Noise genres, found ${extracted.length}`);
}

const bounds = {
  minLeft: Math.min(...extracted.map((item) => item.left)),
  maxLeft: Math.max(...extracted.map((item) => item.left)),
  minTop: Math.min(...extracted.map((item) => item.top)),
  maxTop: Math.max(...extracted.map((item) => item.top)),
};
const genres = extracted.map((item) => ({
  genre: item.genre,
  key: normalizeGenre(item.genre),
  left: item.left,
  top: item.top,
  x: round((item.left - bounds.minLeft) / (bounds.maxLeft - bounds.minLeft)),
  y: round((item.top - bounds.minTop) / (bounds.maxTop - bounds.minTop)),
}));

if (new Set(genres.map((item) => item.key)).size !== genres.length) {
  throw new Error('Every Noise reference contains duplicate normalized genre labels');
}

const payload = {
  schemaVersion: 1,
  referenceVersion: '2023-12-04',
  referenceName: 'Every Noise at Once',
  originalUrl: 'https://everynoise.com/engenremap.html',
  publicMirrorUrl: 'https://github.com/quint-t/Every-Noise-at-Once',
  publicMirrorCommit: 'e80265defc743b307586ac0a7a5c72d2dacdf409',
  retrievedAt: '2026-08-31T09:20:00-07:00',
  extractionNote: 'Factual genre labels and pixel coordinates extracted from a pinned public mirror of the 2023-12-04 Every Noise map. The source HTML and audio previews are not redistributed.',
  axes: {
    horizontal: 'Every Noise left-to-right reference coordinate; described by the original project as denser/more atmospheric to spikier/bouncier.',
    vertical: 'Every Noise top-to-bottom reference coordinate; described by the original project as more mechanical/electric to more organic.',
  },
  bounds,
  genreCount: genres.length,
  genres,
};

const output = path.join(root, 'data', 'every-noise-reference-2023.json');
fs.writeFileSync(output, `${JSON.stringify(payload)}\n`);
console.log(JSON.stringify({ output, genreCount: genres.length, bounds }));

function decodeHtml(value) {
  return value.replaceAll('&amp;', '&').replaceAll('&quot;', '"').replaceAll('&#39;', "'").replaceAll('&lt;', '<').replaceAll('&gt;', '>');
}

function normalizeGenre(value) {
  return value.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, ' ').trim();
}

function round(value) {
  return Math.round(value * 1_000_000) / 1_000_000;
}
