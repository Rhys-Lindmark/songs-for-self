import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { chromium } from 'playwright';

const baseUrl = process.env.SFS_BASE_URL || 'http://localhost:4329';
const lookup = JSON.parse(readFileSync(new URL('../public/upload-lookup.json', import.meta.url)));
const atlas = JSON.parse(readFileSync(new URL('../public/genre-space-data.json', import.meta.url)));
const families = ['Rock', 'Jazz', 'Electronic', 'World', 'Hip-hop', 'Pop'];
const chosen = families.map((family) => atlas.points.find((point) => point.family === family && point.spotifyAlbumId));
const rows = chosen.map((point, index) => [point.title, point.artists, point.album, point.spotifyAlbumId, point.id, lookup.tracks.find((track) => track.id === point.id)?.year || 2000, `https://covers.example/album-${index}.svg`]);
rows.push([...rows[0]]);
rows.push(['Unknown recording', 'Unknown performer', 'Missing cover', '', '', '1999', '']);
const csv = ['Track Name,Artist Name(s),Album Name,Album ID,Spotify Track ID,Release Year,Image URL', ...rows.map((row) => row.map((value) => `"${String(value).replaceAll('"', '""')}"`).join(','))].join('\n');
// Explicit fixture artwork isolates UI behavior from third-party image availability.
const image = '<svg xmlns="http://www.w3.org/2000/svg" width="300" height="300"><rect width="300" height="300" fill="#214e43"/><text x="150" y="150" text-anchor="middle" fill="white">Test cover</text></svg>';
const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
try {
  for (const width of [1280, 320]) {
    const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: 'reduce' });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.route('https://covers.example/**', (route) => route.fulfill({ contentType: 'image/svg+xml', body: image }));
    await page.route('https://coverartarchive.org/**', (route) => route.fulfill({ contentType: 'image/svg+xml', body: image }));
    await page.route('https://open.spotify.com/oembed**', (route) => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ thumbnail_url: 'https://i.scdn.co/image/test-cover' }) }));
    await page.route('https://i.scdn.co/image/test-cover', (route) => route.fulfill({ contentType: 'image/svg+xml', body: image }));
    await page.goto(baseUrl, { waitUntil: 'networkidle' });
    await page.locator('input[type="file"]').setInputFiles({ name: 'album-artwork-fixture.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) });
    await page.getByRole('heading', { name: 'Explore your music', exact: true }).waitFor();
    assert.equal(await page.getByRole('button', { name: 'Albums', exact: true }).getAttribute('aria-pressed'), 'true');
    const collection = page.getByRole('region', { name: /Your album collection/ });
    assert.equal(await collection.getByRole('button').count(), 7, 'Albums should group repeated tracks without losing missing covers');
    await page.waitForFunction(() => [...document.querySelectorAll('[aria-label^="Your album collection"] img')].filter((image) => image.complete && image.naturalWidth > 0).length >= 4);
    const named = collection.getByRole('button', { name: new RegExp(rows[0][2].replace(/[.*+?^${}()|[\]\\]/g, '\\$&')) });
    await named.click();
    const detail = page.getByRole('complementary', { name: 'Selected album' });
    await detail.waitFor();
    assert.match(await detail.innerText(), /2 tracks/);
    await page.getByLabel('Filter albums by genre').selectOption('Rock');
    assert.equal(await collection.getByRole('button').count(), 1);
    await page.getByLabel('Filter albums by genre').selectOption('');
    await page.getByLabel('Find an album or artist').fill('Missing cover');
    assert.equal(await collection.getByRole('button').count(), 1);
    assert.equal(await collection.locator('img').count(), 0, 'Unknown artwork should remain a placeholder');
    await page.getByRole('button', { name: 'Time', exact: true }).click();
    const timeline = page.getByRole('region', { name: /Uploaded playlist genre timeline/ });
    await timeline.waitFor();
    assert.equal(await timeline.locator('[data-album-artwork]').count(), 7);
    await timeline.locator('[data-album-artwork]').first().click();
    await detail.waitFor();
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), width);
    await page.getByRole('button', { name: 'Genre space', exact: true }).click();
    const map = page.getByLabel(/Genre-space map with .* imported tracks/);
    await map.waitFor();
    await map.focus();
    await page.keyboard.press('Home');
    await page.locator('#your-playlist aside [data-album-artwork]').scrollIntoViewIfNeeded();
    await page.locator('#your-playlist aside img').waitFor();
    await page.reload({ waitUntil: 'networkidle' });
    await page.getByRole('button', { name: 'Resume atlas' }).click();
    await page.getByRole('heading', { name: 'Explore your music' }).waitFor();
    assert.equal(await page.getByRole('button', { name: 'Albums', exact: true }).getAttribute('aria-pressed'), 'true');
    await page.getByRole('button', { name: 'Clear playlist' }).click();
    await page.getByLabel('Spotify playlist link').waitFor();
    assert.deepEqual(errors, []);
    await context.close();
    console.log(`Album collage, filters, timeline covers, details, missing art, keyboard map, and resume passed at ${width}px.`);
  }
} finally { await browser.close(); }
