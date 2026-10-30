import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { chromium } from 'playwright';

const baseUrl = process.env.SFS_BASE_URL || 'http://localhost:4342';
const macChrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const executablePath = process.env.CHROME_PATH || (existsSync(macChrome) ? macChrome : undefined);
const browser = await chromium.launch({ executablePath, headless: true });

try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const failedResponses = [];
  page.on('response', (response) => {
    if (response.status() >= 400) failedResponses.push(`${response.status()} ${response.url()}`);
  });
  await page.goto(baseUrl, { waitUntil: 'networkidle' });

  await page.getByLabel('Open a genre and musical year').selectOption('Rock|1969');
  const abbeyRoadCover = page.getByRole('img', { name: 'Cover of Abbey Road (Remastered)', exact: true });
  await abbeyRoadCover.waitFor({ state: 'visible', timeout: 20_000 });
  await abbeyRoadCover.scrollIntoViewIfNeeded();
  await abbeyRoadCover.evaluate((image) => new Promise((resolve, reject) => {
    if (image.complete && image.naturalWidth > 0) return resolve();
    const timeout = setTimeout(() => reject(new Error(`Artwork load timed out: ${image.currentSrc}`)), 20_000);
    image.addEventListener('load', () => { clearTimeout(timeout); resolve(); }, { once: true });
    image.addEventListener('error', () => { clearTimeout(timeout); reject(new Error(`Artwork failed: ${image.currentSrc}`)); }, { once: true });
  }));
  const artwork = await abbeyRoadCover.evaluate((image) => ({
    complete: image.complete,
    naturalWidth: image.naturalWidth,
    naturalHeight: image.naturalHeight,
    src: image.currentSrc,
  }));
  assert.equal(artwork.complete, true, 'Abbey Road artwork has not finished loading');
  assert.ok(artwork.naturalWidth >= 250 && artwork.naturalHeight >= 250, `Abbey Road artwork is not a real loaded image: ${JSON.stringify(artwork)}`);
  assert.match(artwork.src, /spotifycdn\.com|scdn\.co/, 'Abbey Road did not use the verified Spotify artwork fallback');

  const timeline = page.getByRole('region', { name: /Genre timeline/ });
  const covers = timeline.locator('[data-album-artwork]');
  assert.ok(await covers.count() > 100, 'Timeline should expose album artwork instead of dots');
  assert.equal(await timeline.locator('button > span.rounded-full').count(), 0, 'Timeline dots returned');
  assert.equal(await page.getByText('estimated composition era', { exact: true }).count(), 0, 'Visible provenance legend returned');
  assert.deepEqual(failedResponses.filter((entry) => entry.includes(new URL(baseUrl).origin)), [], 'A local app resource failed');

  console.log(JSON.stringify({ abbeyRoadArtwork: artwork, timelineAlbumCovers: await covers.count() }, null, 2));
} finally {
  await browser.close();
}
