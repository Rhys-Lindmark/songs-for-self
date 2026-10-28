import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const page = fs.readFileSync(new URL('../app/page.tsx', import.meta.url), 'utf8');

await test('bottom disclosure names every core source and keeps caveats out of the primary charts', () => {
  assert.match(page, /Sources, methods &amp; privacy/);
  for (const source of ['open.spotify.com/playlist/', 'musicbrainz.org/', 'wikidata.org/', 'coverartarchive.org/', 'furia.com/everynoise_public/']) assert.match(page, new RegExp(source.replaceAll('.', '\\.')));
  assert.match(page, /top-level genre is a useful editorial summary, not an objective fact/i);
  assert.match(page, /Artist birthplace or formation place is not the same thing as where a recording was made/i);
});

await test('visitor privacy copy matches the browser-local product contract', () => {
  assert.match(page, /CSV analysis runs in your browser/i);
  assert.match(page, /is not uploaded to a Songs for Self server/i);
  assert.match(page, /explicit authorization/i);
  assert.match(page, /separate consent before any server-side storage or public sharing/i);
});
