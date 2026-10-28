import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { parse } from 'csv-parse/sync';

const rows = parse(fs.readFileSync(new URL('../data/songs-for-self.enriched.csv', import.meta.url), 'utf8'), {
  columns: true,
  skip_empty_lines: true,
});
const active = rows.filter((row) => row.spotify_track_id);
const vizData = JSON.parse(fs.readFileSync(new URL('../data/viz-data.json', import.meta.url), 'utf8'));
const genreOverrides = JSON.parse(fs.readFileSync(new URL('../data/genre-overrides.json', import.meta.url), 'utf8'));
const genreDecisionQueue = JSON.parse(fs.readFileSync(new URL('../data/genre-decision-queue.json', import.meta.url), 'utf8'));
const bestEffortBatch = JSON.parse(fs.readFileSync(new URL('../data/genre-best-effort-batch-8.json', import.meta.url), 'utf8'));
const evidenceCascadeBatch = JSON.parse(fs.readFileSync(new URL('../data/genre-overrides-batch-9.json', import.meta.url), 'utf8'));
const otherSummary = JSON.parse(fs.readFileSync(new URL('../data/other-genre-summary.json', import.meta.url), 'utf8'));

await test('every available track has explicit V3 genre, time, and geography coverage', () => {
  assert.ok(active.length > 7000);
  assert.equal(active.filter((row) => !row.release_year).length, 0);
  assert.equal(active.filter((row) => !row.timeline_year).length, 0);
  assert.equal(active.filter((row) => !row.origin_latitude || !row.origin_longitude).length, 0);
  assert.equal(active.filter((row) => !row.genre_family || !row.genre_source).length, 0);
});

await test('headline placement metrics use the same available-track denominator', () => {
  assert.equal(vizData.summary.activeTracks, active.length);
  assert.equal(vizData.summary.genreTracks, active.length);
  assert.equal(vizData.summary.timelineTracks, active.length);
  assert.equal(vizData.summary.mappedTracks, active.length);
});

await test('canonical genre-family totals include every active track exactly once', () => {
  const canonicalFamilies = Object.keys(vizData.summary.genreCounts);
  assert.ok(active.every((row) => canonicalFamilies.includes(row.genre_family)), 'Every track family must use canonical casing');
  assert.equal(Object.values(vizData.summary.genreCounts).reduce((sum, count) => sum + count, 0), active.length);
});

await test('timeline points expose four ranked album memories with cover provenance', () => {
  for (const point of vizData.timeline) {
    assert.ok(point.albums.length >= 1 && point.albums.length <= 4, `${point.genre} ${point.year} should expose one to four albums`);
    assert.deepEqual([...point.albums].sort((left, right) => right.count - left.count || left.name.localeCompare(right.name)), point.albums);
    for (const album of point.albums.filter((item) => item.coverUrl)) {
      assert.equal(album.coverSource, 'Cover Art Archive');
      assert.match(album.coverSourceId, /^[0-9a-f-]{36}$/);
      assert.equal(album.coverUrl, `https://coverartarchive.org/release-group/${album.coverSourceId}/front-250`);
    }
  }
  const hipHop2013 = vizData.timeline.find((point) => point.genre === 'Hip-hop' && point.year === 2013);
  assert.ok(hipHop2013, 'Expected a 2013 Hip-hop point');
  const asap = hipHop2013.albums.find((album) => album.name === 'LONG.LIVE.A$AP (Deluxe Version)');
  assert.equal(asap?.count, 3);
  assert.equal(asap?.spotifyAlbumId, '1E1eyI5uGllppJZCxNoF9w');
  assert.ok(asap?.coverUrl, 'A$AP Rocky album should have a Cover Art Archive fallback');
});

await test('every editorial genre override is applied with evidence', () => {
  for (const [artist, override] of Object.entries(genreOverrides.artists)) {
    const artistRows = active.filter((row) => row.artist_names.split('; ').includes(artist));
    assert.ok(artistRows.length > 0, `Expected playlist rows for ${artist}`);
    for (const row of artistRows) {
      if (row.genre_source.startsWith('editorial:genre-evidence-batch-')) continue;
      assert.equal(row.genre_family, override.family, `${artist} should use its reviewed family`);
      assert.match(row.genre_source, /^editorial:genre-overrides\//);
      assert.ok(row.genre_evidence, `${artist} should retain auditable evidence`);
    }
  }
});

await test('former decision-queue catalogs have explicit best-effort family placements', () => {
  const expected = new Map([
    ['Bo Burnham', [25, 'Pop']], ['Rhys Lindmark', [20, 'Classical']], ['Peter Alsop', [9, 'Modern Folk']], ['Tom Lehrer', [7, 'Pop']],
    ['Raffi', [5, 'Modern Folk']], ['Danny Go!', [4, 'Pop']], ['Tom Cardy', [4, 'Pop']], ['Obscurest Vinyl', [4, 'Pop']],
  ]);
  for (const [artist, [expectedCount, family]] of expected) {
    assert.ok(genreDecisionQueue.artists[artist]?.question, `${artist} needs a documented product question`);
    const artistRows = active.filter((row) => row.artist_names.split(';').map((value) => value.trim()).includes(artist));
    assert.equal(artistRows.length, expectedCount, `${artist} decision-queue count changed`);
    assert.ok(artistRows.every((row) => row.genre_family === family), `${artist} should use the resolved ${family} placement`);
    assert.ok(artistRows.every((row) => row.genre_evidence.includes('best-effort-family-placement') || artist === 'Raffi'), `${artist} should retain best-effort evidence`);
  }
  assert.equal(genreDecisionQueue.status, 'resolved');
  assert.equal(otherSummary.decisionQueue.tracks, 0);
  assert.equal(otherSummary.readyForGenreReviewTracks, otherSummary.otherTracks);
});

await test('reviewed World false positives stay out of World', () => {
  for (const artist of ['Iron & Wine', 'The Mountain Goats', 'Smash Mouth', 'Old Crow Medicine Show', 'Josh Ritter']) {
    const artistRows = active.filter((row) => row.artist_names.split('; ').includes(artist));
    assert.ok(artistRows.length > 0, `Expected playlist rows for ${artist}`);
    assert.ok(artistRows.every((row) => row.genre_family !== 'World'), `${artist} should not be World`);
  }
});

await test('zero-Other batch one moves 55 reviewed tracks into requested families', () => {
  const expected = new Map([
    ['Streetlight Manifesto', ['Rock', 20]],
    ['Self Esteem', ['Pop', 16]],
    ['Pogo', ['Electronic', 14]],
    ['Working for a Nuclear Free City', ['Electronic', 2]],
    ['Panama Wedding', ['Electronic', 1]],
    ['Nico Segal', ['Hip-hop', 3]],
  ]);
  let reviewedTracks = 0;
  for (const [artist, [family, count]] of expected) {
    const artistRows = active.filter((row) => row.artist_names.split('; ').includes(artist));
    assert.equal(artistRows.length, count, `${artist} reviewed-track count changed`);
    assert.ok(artistRows.every((row) => row.genre_family === family), `${artist} should be ${family}`);
    reviewedTracks += artistRows.length;
  }
  assert.equal(reviewedTracks, 56);
  // One Streetlight Manifesto row was already Rock before the registry; the
  // batch reduces the unresolved Other count by 55 while normalizing 56 rows.
  assert.ok(vizData.summary.genreCounts.Other <= 2489);
});

await test('zero-Other batch two places 118 reviewed catalog rows', () => {
  const expected = new Map([
    ['Narada Nutcracker Performers', ['Classical', 13]],
    ['Camille', ['Pop', 9]],
    ['Yuno Miles', ['Hip-hop', 9]],
    ['The Weepies', ['Modern Folk', 8]],
    ['Yeasayer', ['Rock', 8]],
    ['Youth Lagoon', ['Rock', 8]],
    ['Adam Green', ['Modern Folk', 5]],
    ['Mapei', ['Pop', 5]],
    ['Sungazer', ['Jazz', 5]],
    ['Ted Hawkins', ['R&B, Soul & Blues', 5]],
    ['Todrick Hall', ['Pop', 5]],
    ['Bag Raiders', ['Electronic', 4]],
    ['Dan Deacon', ['Electronic', 4]],
    ['Fanfare Ciocarlia', ['World', 4]],
    ['Frédéric Chopin', ['Classical', 6]],
    ['Juan Gabriel', ['Pop', 4]],
    ['People Under The Stairs', ['Hip-hop', 4]],
    ['Photay', ['Electronic', 4]],
    ['Quantic', ['Electronic', 4]],
    ['Shearwater', ['Rock', 4]],
  ]);
  let reviewedTracks = 0;
  for (const [artist, [family, count]] of expected) {
    const artistRows = active.filter((row) => row.artist_names.split(';').map((value) => value.trim()).includes(artist));
    assert.equal(artistRows.length, count, `${artist} reviewed-track count changed`);
    assert.ok(artistRows.every((row) => row.genre_family === family), `${artist} should be ${family}`);
    reviewedTracks += artistRows.length;
  }
  assert.equal(reviewedTracks, 118);
  assert.ok(vizData.summary.genreCounts.Other <= 2377);
});

await test('zero-Other batch three places 85 reviewed catalog rows', () => {
  const expected = new Map([
    ['Great Big Sea', ['Modern Folk', 6]], ['Young Dubliners', ['Rock', 6]],
    ['Ennio Morricone', ['Classical', 6]], ['Buck Meek', ['Country', 6]],
    ['Carsick Cars', ['Rock', 4]], ['J-Zone', ['Hip-hop', 7]],
    ['Beatrice Dillon', ['Electronic', 4]], ['Trent Reznor and Atticus Ross', ['Experimental', 4]],
    ['Axel Boman', ['Electronic', 3]], ['Beats Antique', ['Electronic', 3]],
    ['Blue Scholars', ['Hip-hop', 3]], ['Buraka Som Sistema', ['Electronic', 3]],
    ['Compay Segundo', ['World', 3]], ['Dawn of Midi', ['Jazz', 3]],
    ['Dorothy Masuka', ['World', 3]], ['Emancipator', ['Electronic', 3]],
    ['Fairuz', ['World', 3]], ['Frente Cumbiero', ['World', 3]],
    ['Hans Zimmer', ['Classical', 3]], ['Ibibio Sound Machine', ['World', 3]],
    ['Moondog', ['Experimental', 3]], ['Mux Mool', ['Electronic', 3]],
  ]);
  let reviewedTracks = 0;
  for (const [artist, [family, count]] of expected) {
    const artistRows = active.filter((row) => row.artist_names.split(';').map((value) => value.trim()).includes(artist));
    assert.equal(artistRows.length, count, `${artist} reviewed-track count changed`);
    if (artist === 'Buck Meek') {
      assert.equal(artistRows.filter((row) => row.genre_family === 'Country').length, 5);
      assert.equal(artistRows.filter((row) => row.spotify_track_id === '1Pe4hdraYdTG44U0ZPrI7n' && row.genre_family === 'Modern Folk').length, 1);
    } else {
      assert.ok(artistRows.every((row) => row.genre_family === family), `${artist} should be ${family}`);
    }
    reviewedTracks += artistRows.length;
  }
  assert.equal(reviewedTracks, 85);
  assert.ok(vizData.summary.genreCounts.Other <= 2297);
});

await test('zero-Other batch four places 40 reviewed catalog rows', () => {
  const expected = new Map([
    ['Jesse Welles', ['Modern Folk', 5]],
    ['The End of America', ['Modern Folk', 4]],
    ['Bitter:Sweet', ['Electronic', 3]],
    ['Mabe Fratti', ['Experimental', 3]],
    ['Nubya Garcia', ['Jazz', 3]],
    ['Rudresh Mahanthappa', ['Jazz', 4]],
    ['Seckou Keita', ['World', 3]],
    ['Penguin Cafe Orchestra', ['Experimental', 3]],
    ['Connor Price', ['Hip-hop', 3]],
    ['Wheelchair Sports Camp', ['Hip-hop', 3]],
    ['Robert Schumann', ['Classical', 3]],
    ['The Piano Guys', ['Classical', 3]],
  ]);
  let reviewedTracks = 0;
  for (const [artist, [family, count]] of expected) {
    const artistRows = active.filter((row) => row.artist_names.split(';').map((value) => value.trim()).includes(artist));
    assert.equal(artistRows.length, count, `${artist} reviewed-track count changed`);
    assert.ok(artistRows.every((row) => row.genre_family === family), `${artist} should be ${family}`);
    reviewedTracks += artistRows.length;
  }
  assert.equal(reviewedTracks, 40);
  assert.ok(vizData.summary.genreCounts.Other <= 2258);
});

await test('zero-Other batch five places 45 reviewed catalog rows', () => {
  const expected = new Map([
    ['Adrian Crowley', ['Modern Folk', 2]], ['Andy Akiho', ['Classical', 2]],
    ['Ayub Ogada', ['World', 3]], ['Baaba Maal', ['World', 2]],
    ['Barker', ['Electronic', 2]], ['Bellowhead', ['Traditional Folk', 2]],
    ['Bill Monroe & His Blue Grass Boys', ['Country', 2]], ['Blockhead', ['Hip-hop', 2]],
    ['Emahoy Tsege Mariam Gebru', ['World', 2]], ['Getatchew Mekurya', ['Jazz', 2]],
    ['Hanggai', ['World', 2]], ['Gazapizm', ['Hip-hop', 2]],
    ['Alex Gaudino', ['Electronic', 2]], ['Anomalie', ['Electronic', 2]],
    ['CunninLynguists', ['Hip-hop', 3]], ['Doomtree', ['Hip-hop', 2]],
    ['Johann Strauss II', ['Classical', 2]], ['Johannes Brahms', ['Classical', 7]],
    ['Jonny Greenwood', ['Classical', 2]],
  ]);
  let reviewedTracks = 0;
  for (const [artist, [family, count]] of expected) {
    const artistRows = active.filter((row) => row.artist_names.split(';').map((value) => value.trim()).includes(artist));
    assert.equal(artistRows.length, count, `${artist} reviewed-track count changed`);
    assert.ok(artistRows.every((row) => row.genre_family === family), `${artist} should be ${family}`);
    reviewedTracks += artistRows.length;
  }
  assert.equal(reviewedTracks, 45);
  assert.ok(vizData.summary.genreCounts.Other <= 2222);
});

await test('zero-Other batch six retains its catalog placements except later exact-track corrections', () => {
  const expected = new Map([
    ['Auntie Flo', ['Electronic', 2]], ['Australian Art Orchestra', ['Jazz', 2]],
    ['BAYNK', ['Electronic', 2]], ['Ben Harper And The Innocent Criminals', ['Rock', 2]],
    ['Bent Knee', ['Rock', 2]], ['Big Head Todd and The Monsters', ['Rock', 3]],
    ['Casey MQ', ['Electronic', 2]], ['Chiwoniso', ['World', 2]],
    ['Cory Wong', ['R&B, Soul & Blues', 2]], ['Daniel Johnston', ['Modern Folk', 2]],
    ['Deca', ['Hip-hop', 2]], ['DURRY', ['Rock', 2]],
    ['Édith Piaf', ['Pop', 2]], ['Foxygen', ['Rock', 2]],
    ['FORQ', ['Jazz', 2]], ['Jlin', ['Electronic', 2]],
    ['Hermitude', ['Electronic', 3]], ['Gyptian', ['World', 2]],
    ['Indigo De Souza', ['Rock', 2]], ['Joe Cuba', ['World', 2]],
  ]);
  let reviewedTracks = 0;
  for (const [artist, [family, count]] of expected) {
    const artistRows = active.filter((row) => row.artist_names.split(';').map((value) => value.trim()).includes(artist));
    assert.equal(artistRows.length, count, `${artist} reviewed-track count changed`);
    const unexpectedRows = artistRows.filter((row) => row.genre_family !== family);
    if (artist === 'Casey MQ') {
      assert.deepEqual(unexpectedRows.map((row) => row.spotify_track_id), ['4RrpTNBLLu4vJwr9At7gkI']);
      assert.equal(unexpectedRows[0]?.genre_family, 'Pop');
    } else {
      assert.equal(unexpectedRows.length, 0, `${artist} should be ${family}`);
    }
    reviewedTracks += artistRows.length;
  }
  assert.equal(reviewedTracks, 42);
  assert.ok(vizData.summary.genreCounts.Other <= 2182);
});

await test('zero-Other batch seven places 104 reviewed catalog rows', () => {
  const expectedCounts = new Map([
    ['Caught A Ghost', 4], ['Indian Calling', 4], ['Londrelle', 4],
    ['2nd South Carolina String Band', 3], ['888', 3], ['Alexis Harte', 3], ['Bill Wurtz', 3],
    ['Boiled In Lead', 3], ['Dan Reeder', 4], ['Daniel Pemberton', 3], ['Enter The Haggis', 3],
    ['Guerilla Toss', 3], ['In Love With a Ghost', 3], ['Jay Warren', 3], ['Julie Andrews', 3],
    ['Julie Feeney', 3], ['Michael Franti', 3], ['Paper Bird', 3], ['Phosphorescent', 3],
    ['Ruth Pelham', 3], ['SAULT', 4], ["Sergio Mendes & Brasil '66", 4], ['Stan Rogers', 3],
    ['The Bellas', 3], ['the bird and the bee', 3], ['The Felice Brothers', 4], ['The Hollyfelds', 3],
    ['The Saw Doctors', 3], ['Tony Exum Jr', 3], ['Vulfmon', 4], ['Youngblood Brass Band', 3], ['Yung Spinach', 3],
  ]);
  let reviewedTracks = 0;
  for (const [artist, expectedCount] of expectedCounts) {
    const artistRows = active.filter((row) => row.artist_names.split(';').map((value) => value.trim()).includes(artist));
    assert.equal(artistRows.length, expectedCount, `${artist} reviewed-track count changed`);
    const expectedFamily = artist === 'Ruth Pelham' ? 'Modern Folk' : genreOverrides.artists[artist].family;
    assert.ok(artistRows.every((row) => row.genre_family === expectedFamily), `${artist} should use its latest reviewed family`);
    reviewedTracks += artistRows.length;
  }
  assert.equal(reviewedTracks, 104);
  assert.ok(vizData.summary.genreCounts.Other <= 2083);
});

await test('direct sourced genre tags flow through the auditable taxonomy cascade', () => {
  const cascaded = active.filter((row) => row.genre_source.startsWith('taxonomy-cascade:'));
  assert.ok(cascaded.length >= 59);
  assert.ok(cascaded.every((row) => row.genre_family !== 'Other'));
  assert.ok(cascaded.every((row) => row.genre_evidence.includes('direct genre tag:')));
  assert.ok(vizData.summary.genreCounts.Other <= 2022);
});

await test('zero-Other batch eight places the clear two-track tail with explicit best-effort status', () => {
  let reviewedTracks = 0;
  for (const [artist, decision] of Object.entries(bestEffortBatch.artists)) {
    const artistRows = active.filter((row) => row.artist_names.split(';')[0].trim() === artist);
    assert.ok(artistRows.length > 0, `Expected playlist rows for ${artist}`);
    assert.ok(artistRows.every((row) => row.genre_family === decision.family), `${artist} should be ${decision.family}`);
    assert.ok(artistRows.every((row) => row.genre_confidence === 'medium' && row.genre_evidence.includes('best-effort-review')), `${artist} must remain explicitly best-effort`);
    reviewedTracks += artistRows.length;
  }
  assert.equal(reviewedTracks, 132);
  assert.ok(vizData.summary.genreCounts.Other <= 1891);
});

await test('MusicBrainz evidence cascade keeps reviewed identity and taxonomy corrections', () => {
  for (const [artist, decision] of Object.entries(evidenceCascadeBatch.artists)) {
    const artistRows = active.filter((row) => row.artist_names.split(';').map((value) => value.trim()).includes(artist));
    assert.ok(artistRows.length > 0, `Expected playlist rows for ${artist}`);
    assert.ok(artistRows.every((row) => row.genre_family === decision.family), `${artist} should be ${decision.family}`);
    assert.ok(artistRows.every((row) => row.genre_source.startsWith('editorial:genre-overrides/')), `${artist} should retain its reviewed override`);
    assert.ok(artistRows.every((row) => /editorial:(taxonomy|identity|track-context|best-effort|user-catalog)/.test(row.genre_evidence)), `${artist} should retain review evidence`);
  }
  assert.ok(vizData.summary.genreCounts.Other <= 1777);
});

await test('album-specific evidence cascade reduces the unresolved tail without weakening provenance', () => {
  const musicBrainzAlbums = active.filter((row) => row.genre_source.startsWith('musicbrainz:release-group-genres/'));
  const discogsAlbums = active.filter((row) => row.genre_source.startsWith('discogs:release-genres/'));
  const reviewedDiscogsAlbums = active.filter((row) => row.genre_source.startsWith('editorial:discogs-release-review/'));
  const laterExactDiscogsSupersessions = active.filter((row) => row.spotify_track_id === '23w07u3kp1Q2UmDKOKgOnC'
    && row.genre_source === 'editorial:genre-evidence-batch-77/track/23w07u3kp1Q2UmDKOKgOnC');
  assert.ok(musicBrainzAlbums.length >= 225);
  assert.ok(discogsAlbums.length + laterExactDiscogsSupersessions.length >= 208);
  assert.equal(reviewedDiscogsAlbums.length, 5);
  assert.ok([...musicBrainzAlbums, ...discogsAlbums, ...reviewedDiscogsAlbums].every((row) => row.genre_family !== 'Other'));
  assert.ok([...musicBrainzAlbums, ...discogsAlbums].every((row) => row.genre_evidence.startsWith('https://')));
  assert.equal(vizData.summary.genreCounts.Other, 0);
});

await test('album and featured-artist catalog propagation remains explicit inference', () => {
  const propagated = active.filter((row) => row.genre_source.startsWith('inferred:catalog-'));
  assert.ok(propagated.length >= 25);
  assert.ok(propagated.every((row) => row.genre_family !== 'Other'));
  assert.ok(propagated.every((row) => row.genre_estimated === 'true'));
  assert.ok(propagated.every((row) => row.genre_evidence.includes('related playlist catalog tracks')));
  assert.ok(propagated.every((row) => ['medium', 'low'].includes(row.genre_confidence)));
});

await test('estimated values carry provenance', () => {
  for (const row of active.filter((item) => item.release_year_estimated === 'true')) {
    assert.match(row.release_year_source, /^(estimate|inferred):/);
  }
  for (const row of active.filter((item) => item.origin_estimated === 'true')) {
    assert.match(row.origin_source, /^(estimate|inferred):/);
  }
  for (const row of active.filter((item) => item.genre_estimated === 'true')) {
    assert.match(row.genre_source, /^(estimate|inferred):/);
  }
});

await test('classical works use composition-era timeline placement', () => {
  const classical = active.filter((row) => row.genre_family === 'Classical');
  const historicalClassical = classical.filter((row) => ['Medieval', 'Renaissance', 'Baroque', 'Classical period', 'Romantic'].includes(row.historical_period));
  assert.ok(classical.length > 250);
  assert.ok(historicalClassical.length > 75);
  assert.ok(historicalClassical.filter((row) => row.timeline_year_kind === 'estimated_composition').length >= historicalClassical.length * 0.95);
  assert.ok(classical.filter((row) => Number(row.timeline_year) < 1950).length >= 200);
  const nutcracker = classical.filter((row) => row.artist_names.split(';').map((value) => value.trim()).includes('Narada Nutcracker Performers'));
  assert.equal(nutcracker.length, 13);
  assert.ok(nutcracker.every((row) => row.timeline_year === '1892' && row.historical_period === 'Romantic'));
});

await test('broad fallbacks are limited to the unresolved tail', () => {
  assert.ok(active.filter((row) => row.release_year_source.startsWith('estimate:genre')).length < 1000);
  assert.ok(active.filter((row) => row.origin_source.startsWith('estimate:genre')).length < 1000);
});

await test('major classical composers land in their historical eras', () => {
  const expected = new Map([
    ['Johann Sebastian Bach', [1700, 1750]],
    ['Wolfgang Amadeus Mozart', [1760, 1800]],
    ['Ludwig van Beethoven', [1790, 1820]],
    ['Erik Satie', [1880, 1920]],
  ]);
  for (const [artist, [minimum, maximum]] of expected) {
    const row = active.find((item) => item.artist_names.startsWith(artist));
    assert.ok(row, `Expected a playlist row for ${artist}`);
    assert.ok(Number(row.timeline_year) >= minimum && Number(row.timeline_year) <= maximum, `${artist} should be placed in historical time`);
  }
});
