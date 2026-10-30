import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { buildGenreProfile } from '../lib/genre-profile.ts';
const benchmark = JSON.parse(fs.readFileSync(new URL('../data/genre-listening-benchmark.json', import.meta.url)));
const track = (genre = 'Other', changes = {}) => ({ spotifyTrackId: null, track: 'A song', artist: 'An artist', year: null, genre, x: null, y: null, city: '', country: '', method: 'fallback', genreSource: 'unresolved', genreConfidence: 'unresolved', timeSource: 'unresolved', timeConfidence: 'unresolved', geographySource: 'unresolved', geographyConfidence: 'unresolved', ...changes });
const repeated = (genre, style, count) => Array.from({ length: count }, () => track(genre, { suppliedGenres: [style] }));
const fixture = [
  ...['bebop','vocal jazz','modal jazz','jazz fusion'].flatMap((style) => repeated('Jazz', style, 2)),
  ...['indie rock','metal','punk'].flatMap((style) => repeated('Rock', style, 2)),
  ...['synthpop','dance pop'].flatMap((style) => repeated('Pop', style, 2)),
  track('Country', { suppliedGenres: ['country'] }), track(),
];
const placement = (index, changes = {}) => ({ index, family: 'Jazz', primary: 'Bebop', x: 0.5, y: 0.5, method: 'visitor exact match', confidence: 'high', source: 'Specific track genre', referenceGenres: ['bebop'], ...changes });

await test('published audio-streaming shares are transcribed without renormalizing the selected genres', () => {
  assert.equal(benchmark.geography, 'United States'); assert.equal(benchmark.period, '2025 full year');
  assert.deepEqual(benchmark.buckets.map((bucket) => bucket.share), [24.9,18.6,11.9,8.7,8.6,3.7,2.2,2.1,1.1,0.8,0.8]);
  assert.ok(Math.abs(benchmark.buckets.reduce((sum, bucket) => sum + bucket.share, 0) - 83.4) < 1e-10);
  assert.equal(benchmark.publishedShareTotal, 83.4); assert.equal(benchmark.unlistedShareRemainder, 16.6);
  assert.match(benchmark.unit, /audio streams/i); assert.match(benchmark.sourceUrl, /luminate/); assert.match(benchmark.chartUrl, /us-share-of-total-volume/);
});
await test('the twenty-row profile has four observed families, ten detailed genres, and all-row shares', () => {
  const result = buildGenreProfile(fixture, benchmark);
  assert.equal(result.total, 20); assert.equal(result.classified, 19); assert.equal(result.unclassified, 1);
  assert.deepEqual(result.broad.map(({ label, count, share }) => ({ label, count, share })), [
    { label: 'Jazz', count: 8, share: 40 }, { label: 'Rock', count: 6, share: 30 }, { label: 'Pop', count: 4, share: 20 }, { label: 'Country', count: 1, share: 5 },
  ]);
  assert.equal(result.detailed.length, 10); assert.equal(result.detailed.reduce((sum, row) => sum + row.count, 0), 19);
  assert.equal(result.aligned, 19); assert.equal(result.unaligned, 1);
  const jazz = result.comparisons.find((row) => row.id === 'jazz');
  assert.equal(jazz.benchmarkShare, 0.8); assert.equal(jazz.share, 40); assert.equal(jazz.ratio, 50); assert.equal(jazz.deltaPoints, 39.2);
  assert.equal(result.standout.id, 'jazz');
});
await test('duplicate rows describe playlist composition and do not pretend to be distinct artists or actual plays', () => {
  const row = track('Jazz', { suppliedGenres: ['bebop'] });
  const result = buildGenreProfile([row,row,row,track()], benchmark);
  assert.equal(result.broad[0].count, 3); assert.equal(result.broad[0].share, 75); assert.equal(result.total, 4); assert.equal(result.classified, 3);
  assert.equal(result.standout, undefined);
});
await test('empty and all-unknown inputs remain explicit without zero padding or fake baseline genres', () => {
  for (const rows of [[], [track(),track(),track()]]) {
    const result = buildGenreProfile(rows, benchmark);
    assert.deepEqual(result.broad, []); assert.deepEqual(result.detailed, []); assert.deepEqual(result.comparisons, []);
    assert.equal(result.total, rows.length); assert.equal(result.classified, 0); assert.equal(result.unclassified, rows.length); assert.equal(result.aligned, 0); assert.equal(result.unaligned, rows.length); assert.equal(result.standout, undefined);
  }
});
await test('ties use a stable key order, and a list with fewer than ten genres stays shorter', () => {
  const rows = [track('Rock'),track('Jazz'),track('Pop')];
  const a = buildGenreProfile(rows, benchmark); const b = buildGenreProfile([...rows].reverse(), benchmark);
  assert.deepEqual(a.broad, b.broad); assert.equal(a.broad.length, 3); assert.deepEqual(a.broad.map((row) => row.label), ['Jazz','Pop','Rock']);
});
await test('lists stop at ten actual observed genres without synthesizing an Other row', () => {
  const rows = ['Classical','Experimental','Country','Electronic','Modern Folk','Hip-hop','Jazz','Pop','R&B, Soul & Blues','Rock','World','Traditional Folk'].map((genre) => track(genre));
  const result = buildGenreProfile(rows, benchmark);
  assert.equal(result.classified, 12); assert.equal(result.broad.length, 10); assert.equal(result.detailed.length, 10); assert.equal(result.broad.reduce((sum, row) => sum + row.count, 0), 10);
});
await test('ambiguous broad R&B/Soul/Blues and World families do not get a wholesale benchmark credit', () => {
  const result = buildGenreProfile([track('R&B, Soul & Blues'),track('World'),track('Modern Folk'),track('Traditional Folk'),track('Experimental')], benchmark);
  assert.equal(result.classified, 5); assert.equal(result.aligned, 0); assert.equal(result.unaligned, 5); assert.deepEqual(result.comparisons, []);
});
await test('specific R&B and soul align to the combined cohort while blues remains unreported', () => {
  const result = buildGenreProfile([track('R&B, Soul & Blues',{suppliedGenres:['rhythm and blues']}),track('R&B, Soul & Blues',{suppliedGenres:['neo soul']}),track('R&B, Soul & Blues',{suppliedGenres:['delta blues']}),track('Hip-hop')], benchmark);
  assert.equal(result.aligned, 3); assert.equal(result.unaligned, 1);
  assert.equal(result.comparisons.length, 1); assert.equal(result.comparisons[0].id, 'rnb-hip-hop'); assert.equal(result.comparisons[0].count, 3); assert.equal(result.comparisons[0].benchmarkShare, 24.9);
});
await test('K-pop follows the report World cohort and Latin pop does not leak into generic Pop', () => {
  const result = buildGenreProfile([track('Pop',{suppliedGenres:['K-pop']}),track('Pop',{suppliedGenres:['Latin pop']}),track('Pop',{suppliedGenres:['dance pop']})], benchmark);
  assert.deepEqual(result.comparisons.map((row) => row.id), ['latin','pop','world']);
  assert.ok(result.comparisons.every((row) => row.count === 1)); assert.equal(result.aligned, 3);
});
await test('explicit Folk/Bluegrass may align to Country, while broad Modern Folk alone stays unaligned', () => {
  const result = buildGenreProfile([track('Modern Folk',{suppliedGenres:['folk']}),track('Traditional Folk',{suppliedGenres:['bluegrass']}),track('Modern Folk'),track('Modern Folk',{suppliedGenres:['folk rock']})], benchmark);
  assert.equal(result.comparisons.find((row) => row.id === 'country').count, 2); assert.equal(result.comparisons.find((row) => row.id === 'rock').count, 1); assert.equal(result.unaligned, 1);
});
await test('placement evidence provides one primary genre, while synthetic family labels stay broad', () => {
  const rows = [track('Jazz'),track('Rock'),track('Jazz')];
  const result = buildGenreProfile(rows, benchmark, [placement(0,{referenceGenres:['bebop','jazz'],primary:'Bebop'}),placement(1,{family:'Rock',primary:'Rock · uploaded genre fallback',method:'visitor family-centroid fallback',referenceGenres:[]}),placement(2,{primary:'Modal jazz',referenceGenres:['modal jazz']})]);
  assert.equal(result.detailed.reduce((sum, row) => sum + row.count, 0), 3);
  assert.deepEqual(result.detailed.map((row) => row.label), ['Bebop','Modal jazz','Rock']);
});
await test('raw supplied genre order and retained primary metadata never count a row in several genres', () => {
  const row = track('Jazz', { suppliedGenres: ['bebop','modal jazz','vocal jazz'] });
  const result = buildGenreProfile([row], benchmark);
  assert.equal(result.detailed.length, 1); assert.equal(result.detailed[0].label, 'Bebop'); assert.equal(result.detailed[0].count, 1);
  const retained = buildGenreProfile([track('Jazz',{genreSpacePrimary:'Modal jazz',genreSpaceGenres:['jazz','modal jazz'],genreSource:'explicit artist genres'})], benchmark);
  assert.equal(retained.detailed[0].label, 'Modal jazz');
});
await test('explicit unreported fine genres prevent a generic broad fallback from inventing a baseline', () => {
  for (const genre of ['delta blues','film score','soundtrack','new age','comedy','latin jazz']) {
    const result = buildGenreProfile([track('Pop',{suppliedGenres:[genre]})], benchmark);
    assert.equal(result.aligned, 0, genre); assert.equal(result.comparisons.length, 0, genre);
  }
});
await test('zero and missing published baselines do not become infinity or an invented zero baseline', () => {
  const zero = { ...benchmark, buckets: [{ id: 'jazz', label: 'Jazz', share: 0 }] };
  const result = buildGenreProfile([track('Jazz')], zero);
  assert.equal(result.comparisons[0].ratio, null); assert.equal(result.comparisons[0].benchmarkShare, 0); assert.equal(result.comparisons[0].deltaPoints, 100);
  for (const buckets of [[], [{id:'jazz',label:'Jazz',share:null}], [{id:'jazz',label:'Jazz',share:NaN}]]) {
    const missing = buildGenreProfile([track('Jazz')], { ...benchmark, buckets });
    assert.equal(missing.comparisons.length, 0); assert.equal(missing.aligned, 0); assert.equal(missing.unaligned, 1);
  }
});
await test('a standout needs enough rows and aligned coverage, with the largest positive point gap', () => {
  assert.equal(buildGenreProfile(Array.from({length:9},()=>track('Jazz')), benchmark).standout, undefined);
  const tooUnaligned = [...Array.from({length:4},()=>track('Jazz')), ...Array.from({length:6},()=>track('World'))];
  assert.equal(buildGenreProfile(tooUnaligned, benchmark).standout, undefined);
  const exactlyHalf = [...Array.from({length:5},()=>track('Jazz')), ...Array.from({length:5},()=>track('World'))];
  assert.equal(buildGenreProfile(exactlyHalf, benchmark).standout.id, 'jazz');
});

await test('description-only role text never masquerades as a detailed genre', () => {
  const result = buildGenreProfile([track('Jazz')], benchmark, [placement(0,{primary:'American jazz trumpeter',referenceGenres:[],method:'visitor sourced artist-genre centroid',source:'wikidata:description + taxonomy phrase'})]);
  assert.equal(result.detailed[0].label, 'Jazz');
  assert.equal(result.detailed[0].count, 1);
  const singer = buildGenreProfile([track('Modern Folk',{suppliedGenres:['singer-songwriter']})], benchmark);
  assert.equal(singer.detailed[0].label, 'Singer-songwriter');
});
await test('explicit cross-cohort hybrids remain unaligned instead of choosing a convenient denominator', () => {
  for (const style of ['jazz rock','rap rock','country rap','country pop','folk pop']) {
    const result = buildGenreProfile([track('Rock',{suppliedGenres:[style]})], benchmark);
    assert.equal(result.aligned, 0, style); assert.equal(result.unaligned, 1);
  }
});

await test('specific supplied genres remain visible even outside the broad-family taxonomy', () => {
  const result = buildGenreProfile([track('Other', { suppliedGenres: ['children'] }), track()], benchmark);
  assert.equal(result.broad.length, 0); assert.equal(result.classified, 0);
  assert.equal(result.detailed[0].label, 'Children'); assert.equal(result.detailed[0].share, 50);
  assert.equal(result.aligned, 1); assert.equal(result.comparisons[0].id, 'children');
});

await test('history play weights change composition without expanding unique-track arrays', () => {
  const rows = [track('Jazz'), track('Rock'), track()];
  const weighted = buildGenreProfile(rows, benchmark, [], [8, 3, 1]);
  assert.equal(weighted.total, 12); assert.equal(weighted.broad[0].count, 8);
  assert.ok(Math.abs(weighted.broad[0].share - 66.6666666667) < 1e-8);
  assert.equal(weighted.unclassified, 1); assert.equal(weighted.aligned, 11);
  assert.equal(buildGenreProfile(rows, benchmark).total, 3);
  assert.equal(buildGenreProfile(rows, benchmark, [], [0, 0, 0]).broad.length, 0);
  for (const weights of [[1], [1, -1, 1], [1, Infinity, 1], [1, NaN, 1], [Number.MAX_VALUE, Number.MAX_VALUE, 1]]) {
    assert.throws(() => buildGenreProfile(rows, benchmark, [], weights), /weights/);
  }
});
