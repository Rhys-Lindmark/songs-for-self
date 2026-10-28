import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

const source = fs.readFileSync(new URL('../lib/spotify-account-data.ts', import.meta.url), 'utf8');
const compiled = ts.transpile(source, { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 });
const spotify = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);

test('imports tracks and local tracks from Spotify account-data playlists', () => {
  const playlists = spotify.parseSpotifyAccountData(JSON.stringify({ playlists: [
    { name: 'Songlines', lastModifiedDate: '2026-08-31', items: [
      { track: { trackName: 'Kadi Kadi', artistName: 'Ali Farka Touré', albumName: 'Ali Farka Touré', trackUri: 'spotify:track:1d4wSeVrrGRJHNwJbnr6ef' } },
      { localTrack: { trackName: 'Local song', artistName: 'Local artist', albumName: 'Local album' } },
      { episode: { episodeName: 'Not music' } },
    ] },
    { name: 'Empty podcast list', items: [{ episode: { episodeName: 'Episode' } }] },
  ] }));
  assert.equal(playlists.length, 1);
  assert.equal(playlists[0].name, 'Songlines');
  assert.equal(playlists[0].rows.length, 2);
  assert.equal(playlists[0].skipped, 1);
  assert.equal(playlists[0].rows[0]['Spotify Track ID'], '1d4wSeVrrGRJHNwJbnr6ef');
  assert.equal(playlists[0].rows[1]['Spotify Track ID'], '');
});

test('rejects unrelated and malformed JSON instead of reading other account data', () => {
  assert.throws(() => spotify.parseSpotifyAccountData('{'), /could not be read/);
  assert.throws(() => spotify.parseSpotifyAccountData('{"streamingHistory":[]}'), /No Spotify playlists/);
});
