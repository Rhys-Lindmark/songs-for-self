import assert from 'node:assert/strict';
import fs from 'node:fs';

const baseUrl = new URL(process.env.SFS_PRODUCTION_URL || 'https://ai.rhyslindmark.com/music');
const assetBase = baseUrl.pathname.replace(/\/$/, '');
const pageResponse = await fetch(baseUrl, { redirect: 'follow' });
assert.equal(pageResponse.status, 200, `Expected ${baseUrl} to return 200`);
assert.match(pageResponse.headers.get('content-type') || '', /text\/html/);
assert.equal(
  new URL(pageResponse.url).pathname.replace(/\/$/, ''),
  baseUrl.pathname.replace(/\/$/, ''),
  'Production URL should not redirect to an unexpected path',
);

const html = await pageResponse.text();
const manifest = JSON.parse(fs.readFileSync(new URL('../public/dataset-manifest.json', import.meta.url), 'utf8'));
const expectedOther = manifest.coverage.otherTracks.toLocaleString('en-US');
for (const expected of ['<title>Songs for Self — A personal atlas of listening</title>', '7,582', 'available songs', expectedOther, 'zoomable map of musical neighborhoods', 'Spotify playlist link', `${assetBase}/og.png`, `${assetBase}/favicon.svg`]) {
  assert.ok(html.includes(expected), `Missing production marker: ${expected}`);
}
assert.match(html, /Import the full copied playlist/, 'Missing complete-playlist import action');
for (const removed of ['AVAILABLE PLAYLIST TRACKS', 'TRACKS PLACED IN TIME']) {
  assert.ok(!html.includes(removed), `Removed coverage card returned: ${removed}`);
}

const assets = [
  `${assetBase}/og.png`,
  `${assetBase}/favicon.svg`,
  `${assetBase}/songs-for-self-v3.csv`,
  `${assetBase}/timeline-data.json`,
  `${assetBase}/geography-data.json`,
  `${assetBase}/world-outline.json`,
  `${assetBase}/genre-space-data.json`,
  `${assetBase}/upload-lookup.json`,
  `${assetBase}/artist-genre-index.json`,
];
const assetResults = await Promise.all(assets.map(async (pathname) => {
  const response = await fetch(new URL(pathname, baseUrl.origin), { method: 'HEAD', redirect: 'follow' });
  assert.equal(response.status, 200, `Expected ${pathname} to return 200`);
  return { pathname, contentType: response.headers.get('content-type'), contentLength: response.headers.get('content-length') };
}));

console.log(JSON.stringify({ page: pageResponse.url, status: pageResponse.status, markers: 9, removedCards: 2, assets: assetResults }, null, 2));
