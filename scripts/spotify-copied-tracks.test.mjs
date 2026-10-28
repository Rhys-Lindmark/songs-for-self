import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

const source = fs.readFileSync(new URL('../lib/spotify-copied-tracks.ts', import.meta.url), 'utf8');
const compiled = ts.transpile(source, { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 });
const moduleUrl = `data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`;
const copied = await import(moduleUrl);

test('extracts copied Spotify track links and preserves order and duplicates', () => {
  const first = '0123456789abcdefghijKL';
  const second = 'abcdefghijklmnopqrstUV';
  assert.deepEqual(copied.extractSpotifyTrackIds([
    `https://open.spotify.com/track/${first}?si=abc`,
    `spotify:track:${second}`,
    `https://open.spotify.com/track/${first}`,
    'https://open.spotify.com/playlist/6SX8vdBpH9zDSF3N5pNlzP',
  ].join('\n')), [first, second, first]);
  assert.equal(copied.parseSpotifyTrackId(first), first);
  assert.equal(copied.parseSpotifyTrackId(`https://open.spotify.com/track/${second}`), second);
  assert.equal(copied.parseSpotifyTrackId('not a track'), null);
});

test('reads title, artist, date, ids, and artwork from a public track embed', () => {
  const entity = {
    type: 'track', id: '0123456789abcdefghijKL', title: 'A song',
    artists: [{ name: 'First Artist', uri: 'spotify:artist:abcdefghijklmnopqrstUV' }, { name: 'Second Artist' }],
    releaseDate: { isoString: '2008-11-17T00:00:00Z' },
    visualIdentity: { image: [{ url: 'https://images.example/cover.jpg' }] },
  };
  const html = `<script id="__NEXT_DATA__" type="application/json">${JSON.stringify({ props: { pageProps: { state: { data: { entity } } } } })}</script>`;
  const row = copied.parseSpotifyTrackEmbed(html);
  assert.equal(row['Track Name'], 'A song');
  assert.equal(row['Artist Name(s)'], 'First Artist; Second Artist');
  assert.equal(row['Artist IDs'], 'abcdefghijklmnopqrstUV');
  assert.equal(row['Release Date'], '2008-11-17');
  assert.equal(row['Spotify Track ID'], entity.id);
  assert.equal(row['Image URL'], 'https://images.example/cover.jpg');
});

test('rejects missing, malformed, and non-track public embeds', () => {
  assert.throws(() => copied.parseSpotifyTrackEmbed('<html></html>'), /did not expose/);
  assert.throws(() => copied.parseSpotifyTrackEmbed('<script id="__NEXT_DATA__" type="application/json">nope</script>'), /could not be read/);
  const episode = `<script id="__NEXT_DATA__" type="application/json">${JSON.stringify({ props: { pageProps: { state: { data: { entity: { type: 'episode', id: '0123456789abcdefghijKL' } } } } } })}</script>`;
  assert.throws(() => copied.parseSpotifyTrackEmbed(episode), /playable track/);
});
