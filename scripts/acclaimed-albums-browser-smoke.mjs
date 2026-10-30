import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { chromium } from 'playwright';

const baseUrl = process.env.SFS_BASE_URL || 'http://127.0.0.1:4329';
const rows = [
  ['Acclaimed fixture one', 'The Beatles', 'Abbey Road (Remastered)', 'The Beatles'],
  ['Acclaimed fixture two', 'The Beatles', 'Abbey Road (Remastered)', 'The Beatles'],
  ['Acclaimed fixture three', 'Joni Mitchell', 'Blue', 'Joni Mitchell'],
  ['Acclaimed fixture four', 'Miles Davis', 'Kind of Blue', 'Miles Davis'],
  ['Same title cover fixture', 'Completely Unindexed Tribute Artist', 'Blue', ''],
  ['Live version fixture', 'Miles Davis', 'Kind of Blue (Live)', 'Miles Davis'],
  ['Missing album fixture', 'Completely Unindexed Artist XYZ', '', ''],
  ['Compilation fixture', 'The Beatles', 'Unlisted greatest hits compilation', 'The Beatles'],
];
const csv = [['Track Name', 'Artist Name(s)', 'Album Name', 'Album Artist', 'Image URL'], ...rows.map((row) => [...row, 'https://covers.example/acclaimed.svg'])].map((row) => row.map((value) => `"${String(value).replaceAll('"', '""')}"`).join(',')).join('\n');
const macChrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || (existsSync(macChrome) ? macChrome : undefined), headless: true });
try {
  for (const width of [1280, 320]) {
    const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: 'reduce' });
    const page = await context.newPage(); page.setDefaultTimeout(25_000);
    const errors = []; page.on('pageerror', (error) => errors.push(error.message));
    await page.route('https://covers.example/**', (route) => route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect width="100" height="100" fill="#346753"/></svg>' }));
    await page.route('https://coverartarchive.org/**', (route) => route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect width="100" height="100" fill="#346753"/></svg>' }));
    await page.route('https://open.spotify.com/oembed**', (route) => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ thumbnail_url: 'https://i.scdn.co/image/acclaimed-fixture' }) }));
    await page.route('https://i.scdn.co/**', (route) => route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect width="100" height="100" fill="#346753"/></svg>' }));
    await page.goto(baseUrl, { waitUntil: 'networkidle' });
    await page.locator('input[type="file"]').setInputFiles({ name: 'acclaimed-albums-fixture.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) });
    const section = page.getByRole('region', { name: 'Acclaimed album exploration', exact: true });
    const score = section.getByRole('heading', { name: "You've explored 3/500 critically acclaimed albums", exact: true });
    await score.waitFor();
    assert.match(await section.innerText(), /0.6% · 4 matching playlist tracks/);
    await section.getByText('Explore the 500 albums', { exact: true }).click();
    await section.getByLabel('Filter acclaimed album coverage').selectOption('covered');
    assert.equal(await section.locator('[data-acclaimed-album]').count(), 3);
    const abbey = section.getByRole('button', { name: /^Abbey Road by The Beatles/ });
    await abbey.focus(); await page.keyboard.press('Enter');
    const selected = section.getByRole('complementary', { name: 'Selected acclaimed album', exact: true });
    await selected.getByRole('heading', { name: 'Abbey Road', exact: true }).waitFor();
    assert.match(await selected.innerText(), /2 matching playlist tracks/);
    assert.ok(await selected.getByRole('link').count() >= 2, 'Each album should expose a source and discovery link');
    if (process.env.SFS_ACCLAIMED_SCREENSHOT && width === 1280) await section.screenshot({ path: process.env.SFS_ACCLAIMED_SCREENSHOT, style: '.skip-link { visibility: hidden !important; }' });
    await page.getByRole('button', { name: 'Time', exact: true }).click();
    await score.waitFor();
    await page.getByRole('button', { name: 'Genre space', exact: true }).click();
    await score.waitFor();
    await page.getByRole('button', { name: 'Geography', exact: true }).click();
    await score.waitFor();
    assert.match(await selected.innerText(), /Abbey Road/);
    await section.getByLabel('Filter acclaimed album coverage').selectOption('missing');
    assert.match(await section.innerText(), /497 albums match these filters/);
    assert.equal(await section.locator('[data-acclaimed-album]').count(), 24);
    await section.getByRole('button', { name: 'Show 24 more albums' }).click();
    assert.equal(await section.locator('[data-acclaimed-album]').count(), 48);
    const sourcePicker = section.getByLabel('Filter acclaimed album source');
    assert.ok(await sourcePicker.locator('option').count() >= 4, 'List must draw from multiple critics and book/list sources');
    const source = await sourcePicker.locator('option').nth(1).getAttribute('value');
    await sourcePicker.selectOption(source);
    assert.ok(await section.locator('[data-acclaimed-album]').count() > 0);
    await sourcePicker.selectOption('');
    await section.getByLabel('Filter acclaimed album coverage').selectOption('all');
    await section.getByLabel('Find an acclaimed album or artist').fill('Abbey Road');
    assert.equal(await section.locator('[data-acclaimed-album]').count(), 1);
    await section.getByText('4 tracks earned no album credit', { exact: true }).click();
    assert.match(await section.innerText(), /Missing album fixture/);
    assert.match(await section.innerText(), /Compilation fixture/);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), width);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: 'Resume atlas', exact: true }).click();
    await score.waitFor();
    assert.deepEqual(errors, []);
    await context.close();
    console.log(`Acclaimed500 score, edition/dedup safeguards, all views, covers, filters/sources, unmatched reasons, keyboard and resume passed at ${width}px.`);
  }
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage(); page.setDefaultTimeout(25_000);
  let unavailable = true;
  await page.route('**/acclaimed-albums.json', (route) => unavailable ? route.fulfill({ status: 503, body: 'Temporarily unavailable' }) : route.continue());
  await page.goto(baseUrl, { waitUntil: 'networkidle' });
  await page.locator('input[type="file"]').setInputFiles({ name: 'acclaimed-retry.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) });
  await page.getByRole('button', { name: 'Retry acclaimed albums', exact: true }).waitFor();
  await page.getByRole('region', { name: /Your album collection/ }).waitFor();
  unavailable = false;
  await page.getByRole('button', { name: 'Retry acclaimed albums', exact: true }).click();
  await page.getByRole('heading', { name: "You've explored 3/500 critically acclaimed albums", exact: true }).waitFor();
  await context.close();
  console.log('Acclaimed-list failure isolation and retry passed.');
} finally { await browser.close(); }
