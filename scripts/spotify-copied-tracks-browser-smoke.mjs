import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { chromium } from 'playwright';

const baseUrl = process.env.SFS_BASE_URL || 'http://localhost:4339';
const macChrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const executablePath = process.env.CHROME_PATH || (existsSync(macChrome) ? macChrome : undefined);
const browser = await chromium.launch({ executablePath, headless: true });
const first = '0jHZ5yXOZNKvtwPGSgL0gX';
const second = '7tplosylJ1BPIzieonXF0N';

try {
  const page = await browser.newPage({ viewport: { width: 390, height: 900 } });
  const requested = [];
  await page.route('**/api/spotify-track-preview?track=**', async (route) => {
    const id = new URL(route.request().url()).searchParams.get('track');
    requested.push(id);
    const metadata = id === first
      ? { name: 'Sabali', artist: 'Amadou & Mariam', date: '2008-11-17' }
      : { name: 'Mavra Froudia', artist: 'Efrén López', date: '2006-01-01' };
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
      'Track Name': metadata.name,
      'Artist Name(s)': metadata.artist,
      'Release Date': metadata.date,
      'Spotify Track ID': id,
      'Track URI': `spotify:track:${id}`,
    }) });
  });

  await page.goto(baseUrl, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'Import the full copied playlist' }).click();
  await page.getByLabel('Copied Spotify track links').fill([
    `https://open.spotify.com/track/${first}`,
    `spotify:track:${second}`,
    `https://open.spotify.com/track/${first}?si=duplicate`,
  ].join('\n'));
  await page.getByRole('button', { name: 'Import 3 copied playlist positions' }).click();
  await page.getByText('Imported 3 copied playlist positions', { exact: false }).waitFor();
  await page.getByText('spotify-copied-3-tracks.csv', { exact: true }).waitFor();
  assert.deepEqual(requested.sort((left, right) => left.localeCompare(right)), [first, second].sort((left, right) => left.localeCompare(right)));
  await page.getByRole('list', { name: 'Playlist import progress' }).waitFor();
  assert.equal(await page.getByText(/limited beta/i).count(), 0);
  console.log('Spotify copied-track full-playlist browser smoke passed.');
} finally {
  await browser.close();
}
