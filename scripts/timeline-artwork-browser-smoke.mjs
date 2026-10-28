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
  const abbeyRoadCover = page.getByRole('img', { name: 'Cover of Abbey Road (Remastered)' });
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
  const dotStyles = await timeline.locator('button > span').evaluateAll((dots) => dots.slice(0, 100).map((dot) => ({
    background: getComputedStyle(dot).backgroundColor,
    borderStyle: getComputedStyle(dot).borderStyle,
  })));
  assert.ok(dotStyles.length > 20, 'Timeline did not expose enough points for the style check');
  assert.ok(dotStyles.every((dot) => dot.background !== 'rgba(0, 0, 0, 0)' && dot.borderStyle === 'solid'), 'Timeline still contains outlined or dashed provenance dots');
  assert.equal(await page.getByText('estimated composition era', { exact: true }).count(), 0, 'Visible provenance legend returned');
  assert.deepEqual(failedResponses, [], `Browser saw failed resources:\n${failedResponses.join('\n')}`);

  console.log(JSON.stringify({ abbeyRoadArtwork: artwork, checkedTimelineDots: dotStyles.length }, null, 2));
} finally {
  await browser.close();
}
