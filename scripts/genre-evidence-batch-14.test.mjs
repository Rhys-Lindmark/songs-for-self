import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { parse } from 'csv-parse/sync';

const root = new URL('../', import.meta.url);
const rows = parse(fs.readFileSync(new URL('data/songs-for-self.enriched.csv', root), 'utf8'), { columns: true, skip_empty_lines: true });
const decisions = JSON.parse(fs.readFileSync(new URL('data/genre-overrides-batch-14.json', root), 'utf8'));
const reviewed = rows.filter((row) => row.genre_source.startsWith('editorial:genre-evidence-batch-14/'));

await test('batch 14 resolves both final repeat clusters and 13 exact singleton releases', () => {
  assert.equal(reviewed.length, 17);
  assert.ok(reviewed.every((row) => row.genre_family !== 'Other'));
  assert.ok(reviewed.every((row) => row.genre_evidence.startsWith('https://')));
  for (const row of reviewed) {
    const decision = decisions.albums[row.spotify_album_id];
    assert.ok(decision, `Missing batch 14 decision for ${row.artist_names} — ${row.track_name}`);
    assert.equal(row.genre_family, decision.family);
    assert.ok(decision.evidence.every((url) => row.genre_evidence.includes(url)));
  }
});

await test('repeat clusters use their documented hybrid center without catalog propagation', () => {
  const hrPeople = reviewed.filter((row) => row.artist_names === 'HR People');
  const rabbitCult = reviewed.filter((row) => row.artist_names === 'Rabbit Cult');
  assert.equal(hrPeople.length, 2);
  assert.equal(rabbitCult.length, 2);
  assert.ok(hrPeople.every((row) => row.genre_family === 'Hip-hop'));
  assert.ok(rabbitCult.every((row) => row.genre_family === 'Rock'));
  assert.ok([...hrPeople, ...rabbitCult].every((row) => row.genre_source.includes(`/album/${row.spotify_album_id}`)));
});

await test('World decisions retain positive style evidence while Arabic pop stays Pop', () => {
  const world = reviewed.filter((row) => row.genre_family === 'World');
  assert.deepEqual(world.map((row) => row.genre_primary).sort((left, right) => left.localeCompare(right)), ['Bullerengue', 'Champeta']);
  assert.ok(world.every((row) => /bullerengue|champeta/i.test(row.genre_evidence)));
  const hamid = reviewed.find((row) => row.spotify_track_id === '1C65VHClKDTKUSM7T43BiJ');
  assert.equal(hamid.genre_family, 'Pop');
  assert.equal(hamid.genre_primary, 'Arabic pop');
});

await test('exact novelty and cover contexts map into supported top-level families', () => {
  for (const trackId of ['1WvcgDbT79xeAa7Mv0klkK', '1q4e0EfbivjNS8u4gShPKP']) {
    const row = reviewed.find((item) => item.spotify_track_id === trackId);
    assert.equal(row.genre_family, 'Pop');
    assert.equal(row.genre_primary, 'Novelty song');
  }
  const electricSons = reviewed.find((row) => row.spotify_track_id === '6QSVi59sfB3ADsaV87WswN');
  assert.equal(electricSons.genre_family, 'Pop');
  assert.equal(electricSons.genre_confidence, 'medium');
});
