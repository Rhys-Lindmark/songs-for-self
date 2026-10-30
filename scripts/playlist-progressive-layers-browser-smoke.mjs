import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const baseUrl = process.env.SFS_BASE_URL || 'http://localhost:4340';
const fixture = fileURLToPath(new URL('./fixtures/playlist-imports/spotify.csv', import.meta.url));
const macChrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const executablePath = process.env.CHROME_PATH || (existsSync(macChrome) ? macChrome : undefined);
const browser = await chromium.launch({ executablePath, headless: true });

async function uploadPlaylist(page) {
  await page.goto(baseUrl, { waitUntil: 'networkidle' });
  await page.locator('input[type="file"]').setInputFiles(fixture);
  await page.getByRole('heading', { name: 'Explore your music', exact: true }).waitFor();
  await page.getByRole('button', { name: 'Time', exact: true }).click();
  await page.getByLabel('Uploaded playlist genre timeline.', { exact: false }).waitFor();
}

try {
  const page = await browser.newPage({ viewport: { width: 390, height: 900 } });
  let genreRequests = 0;
  await page.route('**/genre-space-data.json', async (route) => {
    genreRequests += 1;
    if (genreRequests === 1) await route.fulfill({ status: 503, contentType: 'application/json', body: '{"error":"simulated genre-space outage"}' });
    else await route.continue();
  });
  await uploadPlaylist(page);
  await page.getByRole('button', { name: 'Geography' }).click();
  await page.getByLabel('Map of uploaded playlist artist origins').waitFor();
  await page.getByRole('button', { name: 'Genre space', exact: true }).click();
  await page.getByText('Genre space couldn’t load.', { exact: true }).waitFor();
  await page.getByText('not loaded · retry', { exact: true }).waitFor();
  assert.equal(await page.getByRole('button', { name: 'Retry genre space to download' }).isDisabled(), true);
  await page.getByRole('button', { name: 'Retry this layer' }).click();
  await page.getByText(/exact song coordinates/).waitFor({ timeout: 60_000 });
  assert.equal(genreRequests, 2);
  assert.equal(await page.getByRole('button', { name: 'Download enriched CSV' }).isEnabled(), true);

  const mapPage = await browser.newPage({ viewport: { width: 390, height: 900 } });
  let mapRequests = 0;
  await mapPage.route('**/world-outline.json', async (route) => {
    mapRequests += 1;
    if (mapRequests === 1) await route.fulfill({ status: 503, contentType: 'application/json', body: '{"error":"simulated map outage"}' });
    else await route.continue();
  });
  await uploadPlaylist(mapPage);
  await mapPage.getByRole('button', { name: 'Geography' }).click();
  await mapPage.getByText('Geography couldn’t load.', { exact: true }).waitFor();
  await mapPage.getByRole('button', { name: 'Retry this layer' }).click();
  await mapPage.getByLabel('Map of uploaded playlist artist origins').waitFor();
  assert.equal(mapRequests, 2);
  await mapPage.getByRole('button', { name: 'Time', exact: true }).click();
  await mapPage.getByLabel('Uploaded playlist genre timeline.', { exact: false }).waitFor();
  console.log('Independent playlist atlas layer failure and retry smoke passed.');
} finally {
  await browser.close();
}
