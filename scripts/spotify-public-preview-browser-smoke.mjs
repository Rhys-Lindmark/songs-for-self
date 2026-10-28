import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { chromium } from 'playwright';

const baseUrl = process.env.SFS_BASE_URL || 'http://localhost:4335';
const macChrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const executablePath = process.env.CHROME_PATH || (existsSync(macChrome) ? macChrome : undefined);
const browser = await chromium.launch({ executablePath, headless: true });
const playlistId = '6SX8vdBpH9zDSF3N5pNlzP';

try {
  const page = await browser.newPage({ viewport: { width: 390, height: 900 } });
  await page.route('**/api/spotify-preview?playlist=**', async (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      title: 'Songlines Top of the World 1999-2024 [2250]',
      owner: 'Rhys Lindmark',
      total: 2111,
      rows: [
        { 'Track Name': 'Sabali', 'Artist Name(s)': 'Amadou & Mariam', 'Spotify Track ID': '0jHZ5yXOZNKvtwPGSgL0gX', 'Track URI': 'spotify:track:0jHZ5yXOZNKvtwPGSgL0gX' },
        { 'Track Name': 'Mavra Froudia', 'Artist Name(s)': 'Efrén López', 'Spotify Track ID': '7tplosylJ1BPIzieonXF0N', 'Track URI': 'spotify:track:7tplosylJ1BPIzieonXF0N' },
      ],
    }),
  }));

  await page.goto(baseUrl, { waitUntil: 'networkidle' });
  await page.getByLabel('Spotify playlist link').fill(`https://open.spotify.com/playlist/${playlistId}`);
  await page.getByRole('button', { name: 'Analyze public preview' }).click();
  await page.getByText('Showing Spotify’s public 2-track preview of 2,111 items.', { exact: false }).waitFor();
  await page.getByText('spotify-preview-6SX8vdBpH9zDSF3N5pNlzP-2-of-2111.csv', { exact: true }).waitFor();
  assert.equal(await page.getByRole('list', { name: 'Playlist import progress' }).getByRole('listitem').count(), 6);
  await page.getByRole('button', { name: 'Advanced: connect with a Spotify developer app' }).click();
  await page.getByText('Full playlist owner import', { exact: true }).waitFor();
  await page.getByText('http://127.0.0.1:4335/', { exact: true }).waitFor();
  assert.equal(await page.getByText(/limited beta/i).count(), 0);

  await page.evaluate(() => localStorage.setItem('songs-for-self.spotify.client-id', 'browserclientid0000000000000000'));
  await page.reload({ waitUntil: 'networkidle' });
  await page.route('https://accounts.spotify.com/api/token', async (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ access_token: 'browser-smoke-token', expires_in: 3600 }) }));
  await page.route(`https://api.spotify.com/v1/playlists/${playlistId}/items**`, async (route) => route.fulfill({ status: 403, contentType: 'application/json', body: '{}' }));
  await page.evaluate(({ playlistId, baseUrl }) => sessionStorage.setItem('songs-for-self.spotify.pending', JSON.stringify({ playlistId, clientId: 'browserclientid0000000000000000', verifier: 'v'.repeat(64), state: 'state-token', redirectUri: baseUrl })), { playlistId, baseUrl });
  await page.goto(`${baseUrl}?code=authorization-code&state=state-token`, { waitUntil: 'networkidle' });
  await page.getByText('Spotify did not grant full owner access', { exact: false }).waitFor();
  assert.equal(await page.getByRole('button', { name: 'Preview without logging in' }).count(), 1);
  assert.equal(await page.getByRole('alert').count(), 0);
  console.log('Spotify public-preview and full-owner handoff browser smoke passed.');
} finally {
  await browser.close();
}
