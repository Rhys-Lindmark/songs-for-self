import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const baseUrl = process.env.SFS_BASE_URL || 'http://localhost:4329';
const macChrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const executablePath = process.env.CHROME_PATH || (existsSync(macChrome) ? macChrome : undefined);
const widths = [320, 375, 430];
const uploadFixture = fileURLToPath(new URL('./fixtures/playlist-imports/spotify.csv', import.meta.url));
const browser = await chromium.launch({ executablePath, headless: true });

try {
  for (const width of widths) {
    const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: 'reduce' });
    const page = await context.newPage();
    const consoleErrors = [];
    const responseErrors = [];
    page.on('console', (message) => { if (message.type() === 'error' && !message.text().startsWith('Failed to load resource:')) consoleErrors.push(message.text()); });
    page.on('pageerror', (error) => consoleErrors.push(error.message));
    page.on('response', (response) => { if (response.status() >= 400) responseErrors.push(`${response.status()} ${response.url()}`); });

    await page.goto(baseUrl, { waitUntil: 'networkidle' });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), width, `${width}px page has horizontal overflow`);
    assert.equal(await page.getByText('tracks placed by genre', { exact: true }).count(), 0, 'redundant coverage cards returned');

    const spotifyInput = page.getByLabel('Spotify playlist link');
    const spotifyConnect = page.getByRole('button', { name: /(Connect Spotify & import all|Analyze public preview)/ });
    const spotifyBox = await spotifyInput.boundingBox();
    const firstTabBox = await page.getByRole('tab').first().boundingBox();
    const connectBox = await spotifyConnect.boundingBox();
    assert.ok(spotifyBox && firstTabBox && spotifyBox.y < firstTabBox.y, `${width}px Spotify invitation is not ahead of the archive`);
    assert.ok(connectBox && connectBox.height >= 44, `${width}px Spotify action is shorter than 44px`);
    await spotifyInput.fill('not a playlist');
    await spotifyConnect.click();
    await page.getByText(/Paste a Spotify playlist link/).waitFor();
    await page.getByRole('button', { name: 'Advanced: connect with a Spotify developer app' }).click();
    await page.getByText('Full playlist owner import', { exact: true }).waitFor();
    const clientIdInput = page.getByLabel('Spotify app Client ID');
    await clientIdInput.waitFor();
    const clientIdBox = await clientIdInput.boundingBox();
    assert.ok(clientIdBox && clientIdBox.height >= 44, `${width}px Spotify owner Client ID input is shorter than 44px`);

    for (const link of await page.locator('header a:visible').all()) {
      const box = await link.boundingBox();
      assert.ok(box && box.height >= 44, `${width}px header action is shorter than 44px`);
    }
    for (const tab of await page.getByRole('tab').all()) {
      const box = await tab.boundingBox();
      assert.ok(box && box.height >= 44, `${width}px tab is shorter than 44px`);
    }

    const timeline = page.getByRole('region', { name: /Genre timeline/ });
    const timelineSize = await timeline.evaluate((element) => ({ client: element.clientWidth, scroll: element.scrollWidth }));
    assert.ok(timelineSize.scroll > timelineSize.client, `${width}px timeline is not horizontally pannable`);
    for (const bubble of await timeline.getByRole('button').all().then((items) => items.slice(0, 5))) {
      const box = await bubble.boundingBox();
      assert.ok(box && box.width >= 44 && box.height >= 44, `${width}px timeline bubble target is smaller than 44px`);
    }

    await page.getByRole('tab').nth(2).click();
    const genreSpace = page.getByLabel(/Genre-space map with 7,582 playlist tracks/);
    await genreSpace.waitFor();
    const genreSpaceBox = await genreSpace.boundingBox();
    assert.ok(genreSpaceBox && genreSpaceBox.width <= width - 32, `${width}px genre-space map overflows its section`);
    assert.equal(await page.getByText(/[\d,]+ direct label matches/).count(), 1, `${width}px Every Noise coverage is missing`);
    for (const name of ['Zoom in', 'Zoom out', 'Reset genre-space view']) {
      const box = await page.getByRole('button', { name, exact: true }).boundingBox();
      assert.ok(box && box.height >= 44 && box.width >= 44, `${width}px genre-space ${name} control is smaller than 44px`);
    }
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), width, `${width}px genre-space view introduces page overflow`);

    await page.getByRole('tab', { name: /Geography/ }).click();
    await assert.doesNotReject(() => page.getByLabel('Zoomable map of playlist artist origins').waitFor());
    assert.equal(await page.getByRole('button', { name: 'Play by year' }).count(), 0, 'removed geography time controls returned');
    const originPicker = page.getByLabel(/Choose a (country|state|city|area|place)/);
    const pickerBox = await originPicker.boundingBox();
    assert.ok(pickerBox && pickerBox.height >= 44, `${width}px origin picker is shorter than 44px`);
    for (const name of ['Zoom in', 'Zoom out', 'Reset map view']) {
      const box = await page.getByRole('button', { name, exact: true }).boundingBox();
      assert.ok(box && box.height >= 44 && box.width >= 44, `${width}px ${name} control is smaller than 44px`);
    }
    if (width === 320) {
      await originPicker.selectOption('country:united-states');
      await page.getByRole('button', { name: 'Zoom into United States' }).click();
      const statePicker = page.getByLabel('Choose a state');
      await statePicker.waitFor();
      await statePicker.selectOption('region:united-states/california');
      await page.getByRole('button', { name: 'Zoom into California' }).click();
      const cityPicker = page.getByLabel('Choose a city');
      await cityPicker.waitFor();
      await cityPicker.selectOption('city:united-states/california/los-angeles');
      assert.equal(await page.getByText('United States / California', { exact: true }).count(), 1, 'three-level geography breadcrumb is missing');
      assert.match(await page.locator('aside').getByText(/songs$/).first().innerText(), /^2\d\d songs$/, 'Los Angeles city total is not visible');
      await page.getByRole('button', { name: 'United States', exact: true }).click();
      await page.getByLabel('Choose a state').waitFor();
      await page.getByRole('button', { name: 'All countries', exact: true }).click();
      await page.getByLabel('Choose a country').waitFor();
    }

    const uploadAction = page.getByText('Choose CSV or Spotify JSON', { exact: true }).locator('..');
    const templateAction = page.getByRole('link', { name: 'CSV template' });
    for (const action of [uploadAction, templateAction]) {
      const box = await action.boundingBox();
      assert.ok(box && box.height >= 44, `${width}px upload action is shorter than 44px`);
    }
    await templateAction.hover();
    const expectedTemplatePath = await page.evaluate(() => `${window.location.pathname.endsWith('/') ? window.location.pathname : `${window.location.pathname}/`}playlist-upload-template.csv`);
    assert.equal(new URL(await templateAction.getAttribute('href'), baseUrl).pathname, expectedTemplatePath, `${width}px template link escapes the deployed mount path`);

    await page.locator('input[type="file"]').setInputFiles(uploadFixture);
    const importPipeline = page.getByRole('list', { name: 'Playlist import progress' });
    await importPipeline.waitFor();
    assert.equal(await importPipeline.getByRole('listitem').count(), 6, `${width}px import pipeline is incomplete`);
    await page.getByRole('region', { name: /Uploaded playlist genre timeline/ }).waitFor();
    await page.getByRole('button', { name: 'Genre space', exact: true }).click();
    await page.getByText('1 exact song coordinates', { exact: false }).waitFor({ timeout: 60_000 });
    const downloadButton = page.getByRole('button', { name: 'Download enriched CSV' });
    const downloadBox = await downloadButton.boundingBox();
    assert.ok(downloadBox && downloadBox.height >= 44, `${width}px enriched download action is shorter than 44px`);
    if (width === 320) {
      const [download] = await Promise.all([page.waitForEvent('download'), downloadButton.click()]);
      assert.equal(download.suggestedFilename(), 'spotify-songs-for-self-enriched.csv');
      const downloadedPath = await download.path();
      assert.ok(downloadedPath, 'enriched CSV download has no local path');
      const downloadedCsv = readFileSync(downloadedPath, 'utf8');
      assert.match(downloadedCsv, /^spotify_track_id,track,artist,timeline_year,/);
      assert.match(downloadedCsv, /Sunday Candy/);
      assert.match(downloadedCsv, /every_noise_reference_genres/);
    }
    const visitorCanvas = page.getByLabel(/Genre-space map with 1 imported tracks/);
    const canvasBox = await visitorCanvas.boundingBox();
    const analyzerBox = await page.locator('#your-playlist').boundingBox();
    assert.ok(canvasBox && analyzerBox && canvasBox.width <= analyzerBox.width, `${width}px visitor genre-space map overflows its section`);
    for (const viewButton of await page.getByLabel('Choose uploaded playlist visualization').getByRole('button').all()) {
      const box = await viewButton.boundingBox();
      assert.ok(box && box.height >= 44, `${width}px visitor visualization tab is shorter than 44px`);
    }
    await page.getByRole('button', { name: 'Time', exact: true }).click();
    await assert.doesNotReject(() => page.getByRole('region', { name: /Uploaded playlist genre timeline/ }).waitFor());
    await page.getByRole('button', { name: 'Geography', exact: true }).click();
    await assert.doesNotReject(() => page.getByLabel('Map of uploaded playlist artist origins').waitFor());
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), width, `${width}px imported views introduce page overflow`);
    if (width === 320) {
      await page.reload({ waitUntil: 'networkidle' });
      const resumeButton = page.getByRole('button', { name: 'Resume atlas' });
      await resumeButton.waitFor();
      assert.match(await page.getByRole('status').innerText(), /spotify\.csv · 1 tracks/i, 'saved analysis summary is missing after reload');
      await resumeButton.click();
      await page.getByRole('region', { name: /Uploaded playlist genre timeline/ }).waitFor();
      await page.getByText('spotify.csv', { exact: true }).waitFor();
      await page.getByRole('button', { name: 'Clear playlist' }).click();
      await page.getByText('Your playlist atlas will appear here.').waitFor();
      await page.reload({ waitUntil: 'networkidle' });
      assert.equal(await page.getByRole('button', { name: 'Resume atlas' }).count(), 0, 'Clear playlist did not remove the browser-local checkpoint');
    }

    assert.deepEqual(consoleErrors, [], `${width}px browser console errors:\n${consoleErrors.join('\n')}`);
    assert.deepEqual(responseErrors, [], `${width}px failed resources:\n${responseErrors.join('\n')}`);
    await context.close();
    console.log(`responsive smoke passed at ${width}px`);
  }
} finally {
  await browser.close();
}
