import assert from 'node:assert/strict';
import test from 'node:test';
import { classifyGenres, classifyRankedGenres, parsePoint } from './music-taxonomy.mjs';

void test('classifies specific historical jazz periods', () => {
  const result = classifyGenres(['hard bop', 'jazz']);
  assert.equal(result.family, 'Jazz');
  assert.equal(result.historicalPeriod, 'Bebop');
});

void test('classifies classical eras', () => {
  const result = classifyGenres(['baroque music', 'classical']);
  assert.equal(result.family, 'Classical');
  assert.equal(result.historicalPeriod, 'Baroque');
});

void test('does not confuse baroque pop with the Baroque era', () => {
  const result = classifyGenres(['baroque pop']);
  assert.equal(result.family, 'Pop');
  assert.equal(result.historicalPeriod, '');
});

void test('does not treat American folk, country, or indie as world music', () => {
  assert.notEqual(classifyGenres(['indie folk']).family, 'World');
  assert.notEqual(classifyGenres(['americana', 'country']).family, 'World');
  assert.notEqual(classifyGenres(['folk rock']).family, 'World');
  assert.equal(classifyGenres(['folk music']).family, 'Modern Folk');
  assert.equal(classifyGenres(['traditional folk music']).family, 'Traditional Folk');
});

void test('recognizes direct MusicBrainz folk and mariachi genres without using geography', () => {
  assert.equal(classifyGenres(['folk']).family, 'Modern Folk');
  assert.equal(classifyGenres(['mariachi']).family, 'World');
});

void test('lets specific MusicBrainz hip-hop and R&B labels beat broad secondary tags', () => {
  assert.equal(classifyGenres(['abstract hip hop', 'experimental', 'instrumental hip hop']).family, 'Hip-hop');
  assert.equal(classifyGenres(['alternative r&b', 'bedroom pop']).family, 'R&B, Soul & Blues');
});

void test('lets specific rock labels beat broad pop and electronic tags', () => {
  assert.equal(classifyGenres(['alternative rock', 'nu metal', 'pop rock', 'electronic']).family, 'Rock');
  assert.equal(classifyGenres(['blackgaze']).family, 'Rock');
  assert.equal(classifyGenres(['noise rock', 'post-punk', 'industrial']).family, 'Rock');
  assert.equal(classifyGenres(['melodic metalcore', 'post-hardcore']).family, 'Rock');
  assert.equal(classifyGenres(['experimental rock']).family, 'Rock');
});

void test('recognizes axé as positive regional World evidence', () => {
  assert.equal(classifyGenres(['axé']).family, 'World');
  assert.equal(classifyGenres(['dub music']).family, 'World');
  assert.equal(classifyGenres(['chimurenga']).family, 'World');
  assert.equal(classifyGenres(['weltmusik']).family, 'World');
  assert.equal(classifyGenres(['romani']).family, 'World');
  assert.equal(classifyGenres(['zouk']).family, 'World');
  assert.equal(classifyGenres(['indian classical']).family, 'World');
});

void test('maps Discogs-specific styles without using its ambiguous combined umbrella', () => {
  assert.equal(classifyGenres(["children's"]).family, 'Pop');
  assert.equal(classifyGenres(['spoken word']).family, 'Experimental');
  assert.equal(classifyGenres(['sea shanties']).family, 'Traditional Folk');
  assert.equal(classifyGenres(['new age']).family, 'Electronic');
  assert.equal(classifyGenres(['musical', 'soundtrack']).family, 'Pop');
});

void test('maps direct Wikidata regional and catalog labels', () => {
  assert.equal(classifyGenres(['Algerian chaabi']).family, 'World');
  assert.equal(classifyGenres(['music of Galicia']).family, 'World');
  assert.equal(classifyGenres(['powwow music']).family, 'Traditional Folk');
  assert.equal(classifyGenres(['music of Ireland']).family, 'Traditional Folk');
  assert.equal(classifyGenres(['UK garage']).family, 'Electronic');
  assert.equal(classifyGenres(['bounce music']).family, 'Hip-hop');
  assert.equal(classifyGenres(['symphonic music']).family, 'Classical');
  assert.equal(classifyGenres(['video game music']).family, 'Electronic');
  assert.equal(classifyGenres(["children's music"]).family, 'Pop');
  assert.equal(classifyGenres(['alternative metal']).family, 'Rock');
});

void test('scores each label once so broad World synonyms do not overpower specific genres', () => {
  assert.equal(classifyGenres(['jazz', 'world music']).family, 'Jazz');
  assert.equal(classifyGenres(['hip-hop', 'bossa nova']).family, 'Hip-hop');
  assert.equal(classifyGenres(['reggae', 'alternative rock', 'space rock', 'ska punk']).family, 'Rock');
});

void test('recognizes exact Wikidata labels for classical eras', () => {
  assert.equal(classifyGenres(['baroque music']).historicalPeriod, 'Baroque');
  assert.equal(classifyGenres(['romantic music']).historicalPeriod, 'Romantic');
  assert.equal(classifyGenres(['contemporary classical music']).historicalPeriod, 'Modern classical');
});

void test('weights release-group genres by votes and source kind', () => {
  assert.equal(classifyRankedGenres([
    { name: 'classical', count: 2, kind: 'genre' },
    { name: 'ambient', count: 1, kind: 'genre' },
    { name: 'electronic', count: 1, kind: 'genre' },
    { name: 'modern classical', count: 1, kind: 'genre' },
    { name: 'electronic', count: 1, kind: 'tag' },
  ]).family, 'Classical');
  assert.equal(classifyRankedGenres([
    { name: 'electronic', count: 2, kind: 'genre' },
    { name: 'latin', count: 1, kind: 'tag' },
  ]).family, 'Electronic');
});

void test('parses Wikidata coordinates', () => {
  assert.deepEqual(parsePoint('Point(-74.006 40.7128)'), { longitude: -74.006, latitude: 40.7128 });
});
