import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { chromium } from 'playwright';

const baseUrl = process.env.SFS_BASE_URL || 'http://localhost:4335';
const macChrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const executablePath = process.env.CHROME_PATH || (existsSync(macChrome) ? macChrome : undefined);
const browser = await chromium.launch({ executablePath, headless: true });
const playlistId = '3QNxR8qUDQd8e5KyNsOZgx';
const requests = [];

try {
  const page = await browser.newPage({ viewport: { width: 390, height: 900 } });
  const diagnostics = [];
  page.on('console', (message) => diagnostics.push(`console ${message.type()}: ${message.text()}`));
  page.on('pageerror', (error) => diagnostics.push(`pageerror: ${error.message}`));
  page.on('response', (response) => { if (response.status() >= 400) diagnostics.push(`${response.status()} ${response.url()}`); });
  page.on('request', (request) => { if (request.url().includes('spotify.com')) requests.push({ url: request.url(), method: request.method(), body: request.postData() }); });
  await page.route('https://accounts.spotify.com/api/token', async (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ access_token: 'browser-smoke-token', expires_in: 3600 }) }));
  await page.route(`https://api.spotify.com/v1/playlists/${playlistId}/items**`, async (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      total: 1, offset: 0, limit: 50, next: null,
      items: [{ item: { id: '1234567890123456789012', name: 'Sunday Candy', type: 'track', uri: 'spotify:track:1234567890123456789012', artists: [{ id: 'artist0000000000000000', name: 'Nico Segal' }, { id: 'artist1111111111111111', name: 'Chance the Rapper' }], album: { id: 'album00000000000000000', name: 'Surf', release_date: '2015-05-28' } } }],
    }),
  }));

  await page.goto(baseUrl, { waitUntil: 'networkidle' });
  await page.evaluate(({ playlistId, baseUrl }) => {
    sessionStorage.setItem('songs-for-self.spotify.pending', JSON.stringify({ playlistId, clientId: 'browserclientid0000000000000000', verifier: 'v'.repeat(64), state: 'state-token', redirectUri: baseUrl }));
  }, { playlistId, baseUrl });
  await page.goto(`${baseUrl}?code=authorization-code&state=state-token`, { waitUntil: 'networkidle' });
  try {
    await page.getByText('1 track imported in 1 Spotify request.').waitFor();
  } catch (cause) {
    console.error((await page.locator('body').innerText()).slice(0, 1800));
    console.error(JSON.stringify({ requests, diagnostics }, null, 2));
    throw cause;
  }
  await page.getByRole('button', { name: 'Genre space', exact: true }).click();
  await page.getByText('1 exact song coordinates', { exact: false }).waitFor();
  assert.equal(await page.getByRole('list', { name: 'Playlist import progress' }).getByRole('listitem').count(), 6);

  assert.equal(new URL(page.url()).search, '', 'authorization code remains in the browser URL');
  assert.equal(await page.getByText('1', { exact: true }).first().count(), 1);
  assert.equal(requests.filter((request) => request.url.includes('/api/token')).length, 1);
  assert.match(requests.find((request) => request.url.includes('/api/token')).body, /code_verifier=v{64}/);
  assert.equal(requests.filter((request) => request.url.includes(`/playlists/${playlistId}/items`)).length, 1);
  assert.match(requests.find((request) => request.url.includes(`/playlists/${playlistId}/items`)).url, /limit=50.*offset=0/);
  assert.equal(await page.evaluate(() => sessionStorage.getItem('songs-for-self.spotify.pending')), null);
  await page.getByRole('button', { name: 'Clear playlist' }).click();
  await page.getByText('Your playlist atlas will appear here.').waitFor();
  assert.equal(await page.getByText('TRACKS READ', { exact: true }).count(), 0);
  console.log('Spotify PKCE callback and playlist import browser smoke passed.');
} finally {
  await browser.close();
}
