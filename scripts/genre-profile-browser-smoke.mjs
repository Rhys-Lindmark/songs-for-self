import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { chromium } from 'playwright';

const baseUrl = process.env.SFS_BASE_URL || 'http://127.0.0.1:4329';
const styles = [...['bebop', 'vocal jazz', 'modal jazz', 'jazz fusion', 'indie rock', 'metal', 'punk', 'synthpop', 'dance pop'].flatMap((genre) => [genre, genre]), 'country', ''];
const csv = [['Track Name', 'Artist Name(s)', 'Album Name', 'Genre', 'Image URL'], ...styles.map((genre, index) => [`Profile fixture ${index}`, `Completely Unindexed Profile Artist ${index}`, 'Profile fixture album', genre, 'https://covers.example/profile.svg'])].map((row) => row.map((value) => `"${String(value).replaceAll('"', '""')}"`).join(',')).join('\n');
const macChrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || (existsSync(macChrome) ? macChrome : undefined), headless: true });
try {
  for (const width of [1280, 320]) {
    const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: 'reduce' });
    const page = await context.newPage(); page.setDefaultTimeout(25_000);
    const errors = []; page.on('pageerror', (error) => errors.push(error.message));
    await page.route('https://covers.example/**', (route) => route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect width="100" height="100" fill="#346753"/></svg>' }));
    // The descriptive profile must remain usable when the optional detailed map cannot load.
    if (width === 320) await page.route('**/genre-space-data.json', (route) => route.fulfill({ status: 503, body: 'Temporarily unavailable' }));
    await page.goto(baseUrl, { waitUntil: 'networkidle' });
    await page.locator('input[type="file"]').setInputFiles({ name: 'genre-profile-fixture.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) });
    const section = page.getByRole('region', { name: 'Playlist genre profile', exact: true });
    try {
      await section.getByRole('heading', { name: 'Your top genres', exact: true }).waitFor();
    } catch (cause) {
      console.error(JSON.stringify({ width, url: page.url(), errors, alerts: await page.getByRole('alert').allTextContents(), body: (await page.locator('body').innerText()).slice(-7000) }));
      if (process.env.SFS_PROFILE_SCREENSHOT) await page.screenshot({ path: process.env.SFS_PROFILE_SCREENSHOT, fullPage: true });
      throw cause;
    }
    const list = section.getByRole('list', { name: 'Top playlist genres', exact: true });
    assert.equal(await list.getByRole('listitem').count(), 4, 'Show only observed broad genres');
    assert.match(await list.getByRole('listitem').first().innerText(), /Jazz.*40\.0%/s);
    assert.match(await section.innerText(), /Jazz stands out in this playlist\./);
    assert.match(await section.innerText(), /approximately 50× the U\.S\. streaming share/);
    assert.match(await section.innerText(), /1 entry has no broad genre classification/);
    const detail = section.getByLabel('Genre profile detail', { exact: true });
    await detail.selectOption('detailed');
    await section.getByRole('heading', { name: 'Your top 10 genres', exact: true }).waitFor();
    assert.equal(await list.getByRole('listitem').count(), 10);
    assert.match(await list.innerText(), /Bebop/);
    assert.match(await list.innerText(), /10\.0%/);
    await section.getByText('Compare your genre mix with U.S. listening', { exact: true }).click();
    const jazz = section.locator('[data-benchmark-genre="jazz"]');
    assert.match(await jazz.innerText(), /50× benchmark share/);
    assert.equal(await jazz.getByRole('cell').nth(0).innerText(), '40.0%');
    assert.equal(await jazz.getByRole('cell').nth(1).innerText(), '0.8%');
    assert.match(await section.innerText(), /19 of 20 playlist entries align/);
    assert.match(await section.innerText(), /83\.4% of U\.S\. streams/);
    assert.match(await section.innerText(), /including repeat entries/);
    assert.match(await section.innerText(), /listener percentiles require individual listening histories/);
    assert.match(await section.getByRole('link', { name: 'Luminate · U.S. FY 2025 benchmark', exact: true }).getAttribute('href'), /luminate-data/);
    if (width === 1280 && process.env.SFS_PROFILE_SCREENSHOT) await section.screenshot({ path: process.env.SFS_PROFILE_SCREENSHOT, style: '.skip-link { visibility: hidden !important; }' });
    for (const view of ['Time', 'Genre space', 'Geography']) {
      await page.getByRole('button', { name: view, exact: true }).click();
      await section.getByRole('heading', { name: 'Your top 10 genres', exact: true }).waitFor();
      assert.match(await section.innerText(), /Jazz stands out in this playlist/);
    }
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), width);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: 'Resume atlas', exact: true }).click();
    await section.getByRole('heading', { name: 'Your top genres', exact: true }).waitFor();
    assert.match(await section.innerText(), /Jazz stands out in this playlist/);
    assert.equal(await list.getByRole('listitem').count(), 4);
    assert.deepEqual(errors, []);
    await context.close();
    console.log(`Top genres, detailed top10, sourced comparison, all-row shares, all views, resume and overflow passed at ${width}px${width === 320 ? ' with detailed-map failure' : ''}.`);
  }
} finally { await browser.close(); }
