import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

const source = fs.readFileSync(new URL('../lib/public-asset-url.ts', import.meta.url), 'utf8');
const compiled = ts.transpile(source, { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 });
const moduleUrl = `data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`;
const { publicApiUrl, publicAssetUrl, MUSIC_API_ORIGIN } = await import(moduleUrl);

await test('site assets stay inside the custom-domain music path', () => {
  assert.equal(publicAssetUrl('timeline-data.json', '/music'), '/music/timeline-data.json');
  assert.equal(publicAssetUrl('/geography-data.json', '/music/'), '/music/geography-data.json');
  assert.equal(publicAssetUrl('genre-space-data.json', '/music'), '/music/genre-space-data.json');
});

await test('origin-root deployments retain root-relative assets', () => {
  assert.equal(publicAssetUrl('upload-lookup.json', '/'), '/upload-lookup.json');
});

await test('custom-domain API calls use the music Worker origin instead of the non-routed /music/api path', () => {
  assert.equal(publicApiUrl('spotify-preview', { hostname: 'ai.rhyslindmark.com', origin: 'https://ai.rhyslindmark.com' }), `${MUSIC_API_ORIGIN}/api/spotify-preview`);
  assert.equal(publicApiUrl('/api/spotify-track-preview', { hostname: 'localhost', origin: 'http://localhost:4339' }), 'http://localhost:4339/api/spotify-track-preview');
  assert.equal(publicApiUrl('spotify-preview', { hostname: 'songs-for-self.rhyslindmark.workers.dev', origin: MUSIC_API_ORIGIN }), `${MUSIC_API_ORIGIN}/api/spotify-preview`);
});
