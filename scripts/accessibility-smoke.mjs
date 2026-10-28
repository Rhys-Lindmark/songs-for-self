import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { chromium } from 'playwright';

const baseUrl = process.env.SFS_BASE_URL || 'http://localhost:4329';
const macChrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const executablePath = process.env.CHROME_PATH || (existsSync(macChrome) ? macChrome : undefined);
const browser = await chromium.launch({ executablePath, headless: true });

assert.ok(contrastRatio('#a64831', '#f3efe4') >= 4.5, 'accent text fails AA contrast on the archive background');
assert.ok(contrastRatio('#a64831', '#ece6d8') >= 4.5, 'accent text fails AA contrast on the playlist-tools background');
assert.ok(contrastRatio('#08130d', '#1db954') >= 4.5, 'Spotify action text fails AA contrast');

try {
  for (const viewport of [{ width: 1280, height: 900 }, { width: 320, height: 900 }]) {
    const context = await browser.newContext({ viewport, reducedMotion: 'reduce' });
    const page = await context.newPage();
    await page.goto(baseUrl, { waitUntil: 'networkidle' });

    assert.equal(await page.locator('html').getAttribute('lang'), 'en', 'document language is missing');
    assert.equal(await page.getByRole('main').count(), 1, 'page must expose one main landmark');
    assert.equal(await page.getByRole('heading', { level: 1 }).count(), 1, 'page must expose one H1');
    assert.equal(await page.locator('[id]').evaluateAll((elements) => {
      const ids = elements.map((element) => element.id);
      return ids.length - new Set(ids).size;
    }), 0, 'page contains duplicate IDs');
    assert.deepEqual(await page.locator('img').evaluateAll((images) => images.filter((image) => !image.hasAttribute('alt')).map((image) => image.getAttribute('src'))), [], 'an image is missing an alt attribute');
    assert.deepEqual(await page.locator('input:not([type="hidden"]), select, textarea').evaluateAll((controls) => controls.filter((control) => {
      const labelled = control.getAttribute('aria-label') || control.getAttribute('aria-labelledby') || (control instanceof HTMLInputElement && control.type === 'file') || (control.labels?.length ?? 0) > 0;
      return !labelled;
    }).map((control) => control.outerHTML.slice(0, 140))), [], 'a form control has no accessible name');

    await page.keyboard.press('Tab');
    assert.equal(await page.evaluate(() => document.activeElement?.classList.contains('skip-link')), true, 'skip link is not the first keyboard stop');
    await page.waitForFunction(() => (document.activeElement?.getBoundingClientRect().top ?? -1) >= 0);
    const skipLinkBox = await page.locator('.skip-link').boundingBox();
    assert.ok(skipLinkBox && skipLinkBox.y >= 0, 'focused skip link is not visible');
    await page.keyboard.press('Enter');
    assert.equal(await page.evaluate(() => document.activeElement?.id), 'your-playlist', 'skip link does not move focus to playlist tools');
    assert.equal(await page.evaluate(() => getComputedStyle(document.documentElement).scrollBehavior), 'auto', 'reduced-motion mode still uses smooth scrolling');

    await page.getByRole('tab', { name: /Geography/ }).click();
    const map = page.getByRole('group', { name: 'Zoomable map of playlist artist origins' });
    await map.waitFor();
    const firstMarker = map.getByRole('button').first();
    await firstMarker.focus();
    assert.equal(await firstMarker.getAttribute('aria-label').then(Boolean), true, 'map marker has no accessible name');

    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), viewport.width, `${viewport.width}px accessibility flow introduces horizontal overflow`);
    await context.close();
    console.log(`accessibility smoke passed at ${viewport.width}px`);
  }
} finally {
  await browser.close();
}

function contrastRatio(foreground, background) {
  const values = [relativeLuminance(foreground), relativeLuminance(background)].sort((left, right) => right - left);
  return (values[0] + 0.05) / (values[1] + 0.05);
}

function relativeLuminance(hex) {
  const channels = hex.match(/[\da-f]{2}/gi).map((channel) => Number.parseInt(channel, 16) / 255);
  const linear = channels.map((channel) => channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4);
  return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
}
