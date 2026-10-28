import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

const source = fs.readFileSync(new URL('../lib/spotify-public-preview.ts', import.meta.url), 'utf8');
const compiled = ts.transpile(source, { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 });
const moduleUrl = `data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`;
const preview = await import(moduleUrl);

test('reads a bounded public embed preview and advertised playlist total', () => {
  const embed = `<script id="__NEXT_DATA__" type="application/json">${JSON.stringify({ props: { pageProps: { state: { data: { entity: {
    name: 'A public playlist', subtitle: 'Playlist Owner', trackList: [
      { uri: 'spotify:track:0123456789abcdefghijKL', title: 'First', subtitle: 'Artist One', entityType: 'track' },
      { uri: 'spotify:episode:0123456789abcdefghijKL', title: 'Podcast', subtitle: 'Host', entityType: 'episode' },
      { uri: 'spotify:track:abcdefghijklmnopqrstUV', title: 'Second', subtitle: 'Artist Two', entityType: 'track' },
    ],
  } } } } } })}</script>`;
  const result = preview.parseSpotifyPublicPreview(embed, '<meta property="og:description" content="Playlist · Playlist Owner · 2,111 items · 9 saves"/>');
  assert.equal(result.title, 'A public playlist');
  assert.equal(result.owner, 'Playlist Owner');
  assert.equal(result.total, 2111);
  assert.equal(result.rows.length, 2);
  assert.equal(result.rows[0]['Track Name'], 'First');
  assert.equal(result.rows[1]['Spotify Track ID'], 'abcdefghijklmnopqrstUV');
});

test('rejects missing or empty Spotify preview payloads', () => {
  assert.throws(() => preview.parseSpotifyPublicPreview('<html></html>'), /did not expose/);
  const empty = `<script id="__NEXT_DATA__" type="application/json">${JSON.stringify({ props: { pageProps: { state: { data: { entity: { trackList: [] } } } } } })}</script>`;
  assert.throws(() => preview.parseSpotifyPublicPreview(empty), /playable tracks/);
});

test('never claims a malformed or smaller advertised count', () => {
  const embed = `<script id="__NEXT_DATA__" type="application/json">${JSON.stringify({ props: { pageProps: { state: { data: { entity: { trackList: [
    { uri: 'spotify:track:0123456789abcdefghijKL', title: 'First', subtitle: 'Artist', entityType: 'track' },
  ] } } } } } })}</script>`;
  assert.equal(preview.parseSpotifyPublicPreview(embed, '<meta content="Playlist · nope items">').total, null);
  assert.equal(preview.parseSpotifyPublicPreview(embed, '<meta content="Playlist · 0 items">').total, null);
});
