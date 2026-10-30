import assert from 'node:assert/strict';
import test from 'node:test';
import { addSpotifyHistoryFile, createSpotifyHistoryAccumulator, disposeSpotifyHistoryAccumulator, finishSpotifyHistory, SPOTIFY_HISTORY_LIMITS } from '../lib/spotify-listening-history.ts';
import { analyzePlaylistRows } from '../lib/playlist-analyzer.ts';
const A = '1'.repeat(22); const B = '2'.repeat(22);
const ext = (changes = {}) => ({ ts: '2024-01-01T12:00:00Z', ms_played: 120_000, master_metadata_track_name: 'A song', master_metadata_album_artist_name: 'An artist', master_metadata_album_album_name: 'An album', spotify_track_uri: `spotify:track:${A}`, ...changes });
const basic = (changes = {}) => ({ endTime: '2024-01-01 12:00', msPlayed: 90_000, trackName: 'A song', artistName: 'An artist', ...changes });
const parseFiles = (...files) => { const acc = createSpotifyHistoryAccumulator(); for (const file of files) addSpotifyHistoryFile(acc, JSON.stringify(file)); return finishSpotifyHistory(acc); };

await test('extended history aggregates repeated music plays with timestamps and listening duration', () => {
  const result = parseFiles([ext(),ext({ ts: '2024-01-03T13:10:00Z', ms_played: 5_000 }),ext({ ts: '2023-12-31T23:59:00Z', ms_played: 60_000 })]);
  assert.equal(result.rows.length, 1); assert.equal(result.rows[0]['History Plays'], '3'); assert.equal(result.rows[0]['History Ms Played'], '185000');
  assert.equal(result.rows[0]['History First Played'], '2023-12-31T23:59:00.000Z'); assert.equal(result.rows[0]['History Last Played'], '2024-01-03T13:10:00.000Z');
  assert.deepEqual(result.summary, { kind:'spotify-listening-history',format:'extended',files:1,events:3,uniqueTracks:1,totalMsPlayed:185000,firstPlayedAt:'2023-12-31T23:59:00.000Z',lastPlayedAt:'2024-01-03T13:10:00.000Z',duplicates:0,skippedNonMusic:0,skippedInvalid:0,skippedZeroDuration:0 });
});
await test('positive short plays are retained without applying a thirty-second listening filter', () => {
  const result = parseFiles([ext({ms_played:1}),ext({ts:'2024-01-02T00:00:00Z',ms_played:29_999})]);
  assert.equal(result.summary.events, 2); assert.equal(result.summary.totalMsPlayed, 30_000); assert.equal(result.rows[0]['History Plays'], '2');
});
await test('identical repeated rows within one source file remain genuine multiplicity', () => {
  const event = ext(); const result = parseFiles([event,event,event]);
  assert.equal(result.summary.events, 3); assert.equal(result.summary.duplicates, 0); assert.equal(result.rows[0]['History Plays'], '3');
});
await test('overlapping files retain maximum per-file event multiplicity instead of summing overlaps', () => {
  const event = ext(); const other = ext({ts:'2024-01-02T00:00:00Z'});
  const result = parseFiles([event,event],[event,event,event,other],[event,event,event,other]);
  assert.equal(result.summary.files, 3); assert.equal(result.summary.events, 4); assert.equal(result.summary.duplicates, 6); assert.equal(result.rows[0]['History Plays'], '4'); assert.equal(result.summary.totalMsPlayed, 480_000);
});
await test('reimporting the same file does not add plays, regardless of ignored private fields', () => {
  const result = parseFiles([ext({ip_addr:'secret-a',platform:'device-a'})],[ext({ip_addr:'secret-b',platform:'device-b'})]);
  assert.equal(result.summary.events, 1); assert.equal(result.summary.duplicates, 1);
});
await test('standard history keeps minute precision and explicitly lacks album and track-ID metadata', () => {
  const result = parseFiles([basic(),basic(),basic({endTime:'2024-01-02 13:45'})],[basic(),basic()]);
  assert.equal(result.summary.format, 'standard'); assert.equal(result.summary.events, 3); assert.equal(result.summary.duplicates, 2);
  assert.equal(result.rows[0]['Album Name'], ''); assert.equal(result.rows[0]['Track URI'], ''); assert.equal(result.rows[0]['Album Artist'], '');
  assert.equal(result.summary.firstPlayedAt, '2024-01-01T12:00:00.000Z'); assert.equal(result.summary.lastPlayedAt, '2024-01-02T13:45:00.000Z');
});
await test('extended and standard files cannot be combined or mixed in a single file', () => {
  for (const files of [[[ext()],[basic()]], [[ext(),basic()]], [[{...ext(),endTime:'2024-01-01 12:00'}]]]) {
    const acc = createSpotifyHistoryAccumulator();
    assert.throws(() => { for (const file of files) addSpotifyHistoryFile(acc, JSON.stringify(file)); }, /mix|cannot be combined/i);
    assert.throws(() => finishSpotifyHistory(acc), /failed|new import/i);
  }
});
await test('episodes, audiobooks, zero listening time, and invalid rows are separately counted', () => {
  const result = parseFiles([
    ext(),ext({episode_name:'A podcast',spotify_episode_uri:`spotify:episode:${A}`}),ext({audiobook_title:'A book'}),
    ext({spotify_track_uri:`spotify:episode:${A}`}),ext({ms_played:0}),ext({ms_played:-1}),null,ext({master_metadata_track_name:''}),
  ]);
  assert.equal(result.summary.events, 1); assert.equal(result.summary.skippedNonMusic, 3); assert.equal(result.summary.skippedZeroDuration, 1); assert.equal(result.summary.skippedInvalid, 3);
});
await test('standard podcast and audiobook exports are excluded rather than mistaken for songs', () => {
  const result = parseFiles([basic(),basic({episodeName:'Episode',showName:'Show'}),basic({bookName:'Book',chapterName:'Chapter'})]);
  assert.equal(result.summary.events, 1); assert.equal(result.summary.skippedNonMusic, 2);
});
await test('privacy fields and objects never survive the explicit output whitelist', () => {
  const event = ext({ip_addr:'SECRET_IP',ipAddr:'SECRET_IP2',platform:'SECRET_DEVICE',conn_country:'SECRET_COUNTRY',reason_start:'SECRET_REASON',username:'SECRET_ACCOUNT',device_id:'SECRET_DEVICE_ID',metadata:{secret:'SECRET_NESTED'}});
  const acc = createSpotifyHistoryAccumulator(); addSpotifyHistoryFile(acc, JSON.stringify([event]));
  assert.deepEqual(Object.keys(acc), ['kind']);
  const result = finishSpotifyHistory(acc); const serialized = JSON.stringify(result);
  assert.doesNotMatch(serialized, /SECRET|ip_addr|platform|country|reason_start|username|device_id|metadata/);
  assert.deepEqual(Object.keys(result.rows[0]).sort(), ['Track Name','Artist Name(s)','Album Name','Album Artist','Track URI','History Plays','History Ms Played','History First Played','History Last Played'].sort());
});
await test('history timestamps never become recording release dates in analyzed rows', () => {
  const result = parseFiles([ext()]);
  assert.equal(result.rows[0]['Release Date'], undefined); assert.equal(result.rows[0]['Release Year'], undefined); assert.equal(result.rows[0]['Year'], undefined);
  const analyzed = analyzePlaylistRows(result.rows,{tracks:[],artists:[]});
  assert.equal(analyzed[0].year, null); assert.equal(analyzed[0].spotifyTrackId, A); assert.equal(analyzed[0].album, 'An album');
});
await test('same title with different artists or albums does not merge without trusted Spotify IDs', () => {
  const result = parseFiles([ext({spotify_track_uri:null}),ext({spotify_track_uri:null,master_metadata_album_artist_name:'Another artist'}),ext({spotify_track_uri:null,master_metadata_album_album_name:'Another album'})]);
  assert.equal(result.summary.uniqueTracks, 3); assert.equal(result.summary.events, 3);
});
await test('distinct Spotify track IDs remain distinct despite identical display metadata', () => {
  const result = parseFiles([ext(),ext({spotify_track_uri:`spotify:track:${B}`})]);
  assert.equal(result.summary.uniqueTracks, 2); assert.equal(result.rows.length, 2);
});
await test('one trusted URI preserves play totals across metadata changes and clears contradictory albums', () => {
  const result = parseFiles([ext(),ext({ts:'2024-01-02T00:00:00Z',master_metadata_track_name:'A song renamed',master_metadata_album_album_name:'Different release'})]);
  assert.equal(result.summary.uniqueTracks, 1); assert.equal(result.summary.events, 2); assert.equal(result.rows[0]['Album Name'], ''); assert.equal(result.rows[0]['Track URI'], `spotify:track:${A}`);
});
await test('URI identity and deterministic metadata do not depend on file selection order', () => {
  const a = ext(); const b = ext({ts:'2024-01-02T00:00:00Z',master_metadata_track_name:'A song renamed',master_metadata_album_artist_name:'A renamed artist',master_metadata_album_album_name:'Different release'});
  const one = parseFiles([a],[b]); const two = parseFiles([b],[a]); assert.deepEqual(one, two);
});
await test('strict dates reject invalid calendars and naive extended dates while normalizing offsets', () => {
  const result = parseFiles([ext({ts:'2024-02-29T15:30:00+03:30'}),ext({ts:'2024-02-30T00:00:00Z'}),ext({ts:'2024-01-01'}),ext({ts:'2024-01-01T00:00:00'}),ext({ts:'2024-01-01T25:00:00Z'}),ext({ts:'2024-01-01T00:00:00+14:01'}),ext({ts:'9999-01-01T00:00:00Z'})]);
  assert.equal(result.summary.events, 1); assert.equal(result.summary.skippedInvalid, 6); assert.equal(result.summary.firstPlayedAt, '2024-02-29T12:00:00.000Z');
});
await test('invalid numbers, overlong fields, controls, and non-track URIs are rejected as invalid rows', () => {
  const result = parseFiles([ext(),ext({ms_played:'100'}),ext({ms_played:1.2}),ext({ms_played:null}),ext({ms_played:86_400_001}),ext({master_metadata_track_name:'x'.repeat(2049)}),ext({master_metadata_album_artist_name:{name:'An artist'}}),ext({master_metadata_track_name:'Bad\u0000title'}),ext({spotify_track_uri:'spotify:track:too-short'}),ext({spotify_track_uri:'https://untrusted.example/track'})]);
  assert.equal(result.summary.events, 1); assert.equal(result.summary.skippedInvalid, 9);
});
await test('standard mode does not smuggle unrecognized album/device fields into metadata', () => {
  const result = parseFiles([basic({albumName:'SECRET_ALBUM',spotify_track_uri:undefined,ipAddr:'SECRET_IP'})]);
  assert.equal(result.rows[0]['Album Name'], ''); assert.doesNotMatch(JSON.stringify(result), /SECRET/);
});
await test('JSON parse and unsupported-root errors do not expose source text', () => {
  const acc = createSpotifyHistoryAccumulator(); assert.throws(() => addSpotifyHistoryFile(acc,'{"ip":"SECRET_IP", broken'), (error) => /Could not parse/.test(error.message) && !error.message.includes('SECRET'));
  assert.throws(() => addSpotifyHistoryFile(createSpotifyHistoryAccumulator(),'{}'), /JSON array/);
});
await test('all-nonmusic, all-zero, empty, and unrecognized exports fail with a useful final error', () => {
  for (const rows of [[],[ext({episode_name:'Episode'})],[ext({ms_played:0})],[{},null]]) {
    const acc = createSpotifyHistoryAccumulator(); addSpotifyHistoryFile(acc,JSON.stringify(rows)); assert.throws(() => finishSpotifyHistory(acc), /No valid music plays.*positive listening time/);
  }
});
await test('file, batch-byte, record, and unique-track safety limits fail explicitly without partial finish', () => {
  const encoded = JSON.stringify([ext()]);
  const checks = [
    [{maxFiles:1},[encoded,'[]'], /file limit/],
    [{maxFileBytes:10},[encoded], /per-file byte limit/],
    [{maxBatchBytes:new TextEncoder().encode(encoded).length * 2 - 1},[encoded,encoded], /batch byte limit/],
    [{maxRecords:1},[JSON.stringify([ext(),ext()])], /record limit/],
    [{maxUniqueTracks:1},[JSON.stringify([ext(),ext({spotify_track_uri:`spotify:track:${B}`})])], /unique-track limit/],
  ];
  for (const [limits,files,message] of checks) {
    const acc = createSpotifyHistoryAccumulator(limits); assert.throws(() => {for(const file of files)addSpotifyHistoryFile(acc,file);},message); assert.throws(() => finishSpotifyHistory(acc), /failed|new import/i);
  }
});
await test('byte safety limits count UTF-8 bytes rather than UTF-16 string length', () => {
  const text = JSON.stringify([ext({master_metadata_track_name:'🌎'.repeat(12)})]);
  assert.ok(new TextEncoder().encode(text).length > text.length);
  const acc = createSpotifyHistoryAccumulator({maxFileBytes:text.length}); assert.throws(() => addSpotifyHistoryFile(acc,text), /per-file byte limit/);
});
await test('limits cannot be disabled, raised past defaults, or changed through inherited property names', () => {
  for (const limits of [{maxFiles:0},{maxRecords:Infinity},{maxFiles:SPOTIFY_HISTORY_LIMITS.maxFiles+1},{constructor:1},JSON.parse('{"__proto__":1}')]) assert.throws(() => createSpotifyHistoryAccumulator(limits), /positive integers.*default safety limits/);
  assert.equal(Object.prototype.polluted, undefined);
});
await test('finish is terminal and cancellation disposal is idempotent', () => {
  const acc = createSpotifyHistoryAccumulator();addSpotifyHistoryFile(acc,JSON.stringify([ext()]));finishSpotifyHistory(acc);
  assert.throws(() => finishSpotifyHistory(acc), /finished|new import/i);assert.throws(() => addSpotifyHistoryFile(acc,'[]'), /finished|new import/i);
  disposeSpotifyHistoryAccumulator(acc);disposeSpotifyHistoryAccumulator(acc);
  const cancelled = createSpotifyHistoryAccumulator();addSpotifyHistoryFile(cancelled,JSON.stringify([ext()]));disposeSpotifyHistoryAccumulator(cancelled);assert.throws(() => finishSpotifyHistory(cancelled), /disposed|new import/i);
});
