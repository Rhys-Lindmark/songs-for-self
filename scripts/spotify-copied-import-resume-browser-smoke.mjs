import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { chromium } from 'playwright';

const baseUrl = process.env.SFS_BASE_URL || 'http://localhost:4341';
const macChrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const executablePath = process.env.CHROME_PATH || (existsSync(macChrome) ? macChrome : undefined);
const browser = await chromium.launch({ executablePath, headless: true });
const trackIds = Array.from({ length: 12 }, (_, index) => String(index + 1).padStart(22, '0'));
let resumeMode = false;

try {
  const context = await browser.newContext({ viewport: { width: 390, height: 900 } });
  await context.route('**/api/spotify-track-preview?track=**', async (route) => {
    const id = new URL(route.request().url()).searchParams.get('track');
    const position = trackIds.indexOf(id);
    if (!resumeMode && position >= 6) await new Promise((resolve) => setTimeout(resolve, 10_000));
    try {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
        'Track Name': `Checkpoint Track ${position + 1}`,
        'Artist Name(s)': 'Resume Fixture',
        'Release Date': '2026-01-01',
        'Spotify Track ID': id,
        'Track URI': `spotify:track:${id}`,
      }) });
    } catch {
      // Reloading intentionally abandons the old page's pending second batch.
    }
  });

  let page = await context.newPage();
  await page.goto(baseUrl, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'Import the full copied playlist' }).click();
  await page.getByLabel('Copied Spotify track links').fill(trackIds.map((id) => `https://open.spotify.com/track/${id}`).join('\n'));
  await page.getByRole('button', { name: 'Import 12 copied playlist positions' }).click();
  await page.getByRole('button', { name: 'Reading 6 of 12 unique tracks…' }).waitFor();

  await page.close({ runBeforeUnload: false });
  resumeMode = true;
  page = await context.newPage();
  await page.goto(baseUrl, { waitUntil: 'networkidle' });
  await page.getByText('Resume copied playlist?', { exact: false }).waitFor();
  const resumePrompt = await page.locator('output').filter({ hasText: 'Resume copied playlist?' }).innerText();
  assert.match(resumePrompt, /6 of 12 unique tracks/);
  await page.getByRole('button', { name: 'Resume import' }).click();
  await page.getByText('Imported 12 copied playlist positions', { exact: false }).waitFor();
  await page.getByText('spotify-copied-12-tracks.csv', { exact: true }).waitFor();
  assert.equal(await page.getByText('Resume copied playlist?', { exact: false }).count(), 0);
  await context.close();
  console.log('Spotify copied-import checkpoint/resume browser smoke passed.');
} finally {
  await browser.close();
}
