import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const baseUrl = process.env.SFS_BASE_URL || 'http://localhost:4329';
const macChrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const executablePath = process.env.CHROME_PATH || (existsSync(macChrome) ? macChrome : undefined);
const fixture = fileURLToPath(new URL('./fixtures/playlist-imports/spotify-account-data.json', import.meta.url));
const browser = await chromium.launch({ executablePath, headless: true });

try {
  const page = await browser.newPage({ viewport: { width: 375, height: 900 } });
  await page.goto(baseUrl, { waitUntil: 'networkidle' });
  await page.locator('input[type="file"]').setInputFiles(fixture);
  const picker = page.getByLabel(/Choose a playlist from spotify-account-data\.json/);
  await picker.waitFor();
  assert.equal(await picker.locator('option').count(), 3);
  await picker.selectOption('0');
  await page.getByRole('region', { name: /Uploaded playlist genre timeline/ }).waitFor();
  await page.getByText('Songlines sample.json', { exact: true }).waitFor();
  assert.match(await page.locator('#your-playlist').innerText(), /1\s+tracks read/i);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), 375);
  console.log('Spotify account-data playlist picker browser smoke passed.');
} finally {
  await browser.close();
}
