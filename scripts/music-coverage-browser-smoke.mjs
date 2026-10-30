import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { chromium } from 'playwright';

const baseUrl = process.env.SFS_BASE_URL || 'http://127.0.0.1:4329';
const fixture = [
  ['Brandenburg fixture', 'Johann Sebastian Bach', 'Baroque', 2024, 1721, 'Johann Sebastian Bach'],
  ['Messiah fixture', 'George Frideric Handel', 'Baroque', 2024, 1741, 'George Frideric Handel'],
  ['Seasons fixture', 'Antonio Vivaldi', 'Baroque', 2024, 1725, 'Antonio Vivaldi'],
  ['Historical suite fixture', 'Marin Marais', 'Baroque', 2024, 1717, 'Marin Marais'],
  ['Delta fixture one', 'Charley Patton', 'Delta blues', 2013, 1929, ''],
  ['Delta fixture two', 'Robert Johnson', 'Delta blues', 1997, '', ''],
  ['Grunge fixture', 'Coverage Fixture Performer XYZ', 'Grunge', 1993, '', ''],
  ['House fixture', 'Coverage Fixture Performer XYZ', 'House', 2024, '', ''],
  ['No evidence fixture', 'Completely Unindexed Fixture XYZ', '', '', '', ''],
];
fixture.push([...fixture[0]]);
const rows = fixture.map((row, index) => [...row, `Fixture album ${index}`, 'https://covers.example/fixture.svg']);
const csv = [['Track Name', 'Artist Name(s)', 'Genre', 'Release Year', 'Original Year', 'Composer', 'Album Name', 'Image URL'], ...rows].map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(',')).join('\n');
const macChrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || (existsSync(macChrome) ? macChrome : undefined), headless: true });
try {
  for (const width of [1280, 320]) {
    const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: 'reduce' });
    const page = await context.newPage();
    page.setDefaultTimeout(25_000);
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.route('https://covers.example/**', (route) => route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect width="100" height="100" fill="#346753"/></svg>' }));
    await page.goto(baseUrl, { waitUntil: 'networkidle' });
    await page.locator('input[type="file"]').setInputFiles({ name: 'music-coverage-fixture.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) });
    const coverage = page.getByRole('region', { name: 'Music map exploration', exact: true });
    await coverage.getByRole('heading', { name: "You've explored 0.8% of the music map", exact: true }).waitFor();
    assert.match(await coverage.innerText(), /8 of 1,000 areas · 9 of 10 tracks matched/);
    await coverage.getByText('Explore covered and missing areas', { exact: true }).click();
    const picker = coverage.getByLabel('Explore a music map area', { exact: true });
    assert.equal(await picker.locator('option').count(), 1000);
    assert.equal(await coverage.locator('[data-music-area][data-covered="true"]').count(), 8);
    await picker.selectOption('composer-johann-sebastian-bach');
    const selected = coverage.getByRole('complementary', { name: 'Selected music map area' });
    await selected.getByRole('heading', { name: /Johann Sebastian Bach/ }).waitFor();
    assert.match(await selected.innerText(), /2 matching tracks/);
    assert.match(await selected.innerText(), /identified composer/);
    if (process.env.SFS_COVERAGE_SCREENSHOT && width === 1280) await coverage.screenshot({ path: process.env.SFS_COVERAGE_SCREENSHOT });
    await page.getByRole('button', { name: 'Time', exact: true }).click();
    assert.equal(await picker.inputValue(), 'composer-johann-sebastian-bach');
    await coverage.getByRole('button', { name: /Music exploration pixels arranged by era/ }).waitFor();
    await page.getByRole('button', { name: 'Genre space', exact: true }).click();
    assert.equal(await picker.inputValue(), 'composer-johann-sebastian-bach');
    await coverage.getByRole('button', { name: /Music exploration pixels arranged by genre family/ }).waitFor();
    await page.getByRole('button', { name: 'Geography', exact: true }).click();
    assert.equal(await picker.inputValue(), 'composer-johann-sebastian-bach');
    const pixels = coverage.getByRole('button', { name: /Music exploration pixels arranged by region/ });
    await pixels.focus();
    await page.keyboard.press('Home');
    const first = await picker.inputValue();
    await page.keyboard.press('ArrowRight');
    assert.notEqual(await picker.inputValue(), first);
    await coverage.getByLabel('Filter music map coverage').selectOption('covered');
    assert.equal(await picker.locator('option').count(), 8);
    await coverage.getByLabel('Filter music map coverage').selectOption('uncovered');
    assert.equal(await picker.locator('option').count(), 992);
    await coverage.getByLabel('Filter music map coverage').selectOption('all');
    await coverage.getByLabel('Find a music map area').fill('Vivaldi');
    assert.equal(await picker.locator('option').count(), 1);
    assert.match(await selected.innerText(), /Seasons fixture/);
    await coverage.getByText('1 track needs more evidence', { exact: true }).click();
    assert.match(await coverage.innerText(), /No evidence fixture/);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), width);
    await page.reload({ waitUntil: 'networkidle' });
    await page.getByRole('button', { name: 'Resume atlas', exact: true }).click();
    await coverage.getByRole('heading', { name: "You've explored 0.8% of the music map", exact: true }).waitFor();
    assert.deepEqual(errors, []);
    await context.close();
    console.log(`Coverage score, historical composers/reissues, all three views, covered/missing filters, keyboard, unknowns, and resume passed at ${width}px.`);
  }
} finally { await browser.close(); }
