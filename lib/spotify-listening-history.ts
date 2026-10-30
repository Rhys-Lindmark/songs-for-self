export type SpotifyHistoryFormat = 'extended' | 'standard';
export type ListeningHistorySummary = {
  kind: 'spotify-listening-history'; format: SpotifyHistoryFormat; files: number; events: number; uniqueTracks: number;
  totalMsPlayed: number; firstPlayedAt: string; lastPlayedAt: string; duplicates: number;
  skippedNonMusic: number; skippedInvalid: number; skippedZeroDuration: number;
};
export type SpotifyHistoryImport = { rows: Record<string, string>[]; summary: ListeningHistorySummary };
export type SpotifyHistoryLimits = { maxFiles: number; maxFileBytes: number; maxBatchBytes: number; maxRecords: number; maxUniqueTracks: number };
export type SpotifyHistoryAccumulator = { readonly kind: 'spotify-history-accumulator' };
export const SPOTIFY_HISTORY_LIMITS: Readonly<SpotifyHistoryLimits> = Object.freeze({ maxFiles: 200, maxFileBytes: 50 * 1024 * 1024, maxBatchBytes: 250 * 1024 * 1024, maxRecords: 1_000_000, maxUniqueTracks: 100_000 });

type MusicEvent = { identity: string; uri: string; title: string; artist: string; album: string; time: number; ms: number };
type TrackAggregate = { identity: string; uri: string; title: string; artist: string; album: string; albumConflict: boolean; plays: number; ms: number; first: number; last: number };
type HistoryState = {
  limits: SpotifyHistoryLimits; status: 'open' | 'finished' | 'disposed' | 'failed'; format: SpotifyHistoryFormat | null;
  files: number; bytes: number; records: number; events: number; totalMs: number; duplicates: number;
  skippedNonMusic: number; skippedInvalid: number; skippedZeroDuration: number;
  tracks: Map<string, TrackAggregate>; eventMultiplicities: Map<string, number>;
};
const states = new WeakMap<SpotifyHistoryAccumulator, HistoryState>();
const MAX_FIELD_LENGTH = 2048;
const MAX_EVENT_MS = 86_400_000;

/** One accumulator handles one export format; caller supplies one file string at a time. */
export function createSpotifyHistoryAccumulator(limits: Partial<SpotifyHistoryLimits> = {}): SpotifyHistoryAccumulator {
  const resolved = { ...SPOTIFY_HISTORY_LIMITS };
  for (const name of Object.keys(limits) as Array<keyof SpotifyHistoryLimits>) {
    const value = limits[name];
    if (!Object.prototype.hasOwnProperty.call(SPOTIFY_HISTORY_LIMITS, name) || !Number.isSafeInteger(value) || value! <= 0 || value! > SPOTIFY_HISTORY_LIMITS[name]) throw new Error('History limits must be positive integers no larger than the default safety limits.');
    resolved[name] = value!;
  }
  const accumulator: SpotifyHistoryAccumulator = Object.freeze({ kind: 'spotify-history-accumulator' });
  states.set(accumulator, { limits: resolved, status: 'open', format: null, files: 0, bytes: 0, records: 0, events: 0, totalMs: 0, duplicates: 0, skippedNonMusic: 0, skippedInvalid: 0, skippedZeroDuration: 0, tracks: new Map(), eventMultiplicities: new Map() });
  return accumulator;
}

/** A failed file invalidates the batch, so callers cannot accidentally finish a truncated import. */
export function addSpotifyHistoryFile(accumulator: SpotifyHistoryAccumulator, text: string): void {
  const state = openState(accumulator);
  try {
    if (typeof text !== 'string') throw new Error('Choose Spotify history JSON files as text.');
    if (state.files + 1 > state.limits.maxFiles) throw new Error(`History import exceeds the ${state.limits.maxFiles}-file limit.`);
    const bytes = utf8Bytes(text, state.limits.maxFileBytes);
    if (state.bytes + bytes > state.limits.maxBatchBytes) throw new Error('History import exceeds the total batch byte limit.');
    let parsed: unknown;
    try { parsed = JSON.parse(text); } catch { throw new Error('Could not parse this JSON. Choose unmodified Spotify streaming-history JSON files.'); }
    if (!Array.isArray(parsed)) throw new Error('Spotify streaming history must be a JSON array, not a playlist or account-profile object.');
    if (state.records + parsed.length > state.limits.maxRecords) throw new Error(`History import exceeds the ${state.limits.maxRecords.toLocaleString('en-US')}-record limit.`);
    const stagedEvents = new Map<string, { event: MusicEvent; count: number }>();
    const stagedTracks = new Map<string, TrackAggregate>();
    let format: SpotifyHistoryFormat | null = null;
    let skippedNonMusic = 0; let skippedInvalid = 0; let skippedZeroDuration = 0; let newTracks = 0;
    for (const value of parsed) {
      if (!isRecord(value)) { skippedInvalid += 1; continue; }
      const detected = detectFormat(value);
      if (detected === 'mixed') throw new Error('This file mixes extended and standard Spotify history. Import one export format at a time.');
      if (!detected) { skippedInvalid += 1; continue; }
      if ((format && format !== detected) || (state.format && state.format !== detected)) throw new Error('Extended and standard Spotify history cannot be combined. Import one export format at a time.');
      format = detected;
      if (isNonMusic(value, detected)) { skippedNonMusic += 1; continue; }
      const ms = detected === 'extended' ? value.ms_played : value.msPlayed;
      if (typeof ms !== 'number' || !Number.isSafeInteger(ms) || ms < 0 || ms > MAX_EVENT_MS) { skippedInvalid += 1; continue; }
      if (ms === 0) { skippedZeroDuration += 1; continue; }
      const time = parseTime(detected === 'extended' ? value.ts : value.endTime, detected);
      const title = field(detected === 'extended' ? value.master_metadata_track_name : value.trackName);
      const artist = field(detected === 'extended' ? value.master_metadata_album_artist_name : value.artistName);
      const rawAlbum = detected === 'extended' ? value.master_metadata_album_album_name : null;
      const album = rawAlbum === null || rawAlbum === undefined || rawAlbum === '' ? '' : field(rawAlbum);
      const rawUri = detected === 'extended' ? value.spotify_track_uri : null;
      const uri = rawUri === null || rawUri === undefined || rawUri === '' ? '' : typeof rawUri === 'string' && /^spotify:track:[A-Za-z0-9]{22}$/u.test(rawUri) ? rawUri : null;
      if (time === null || !title || !artist || album === null || uri === null) { skippedInvalid += 1; continue; }
      const identity = uri ? `uri:${uri}` : `metadata:${JSON.stringify([identityText(title), identityText(artist), identityText(album)])}`;
      const event: MusicEvent = { identity, uri, title, artist, album, time, ms };
      const signature = JSON.stringify([detected, time, ms, identity]);
      const previous = stagedEvents.get(signature);
      if (previous) previous.count += 1; else stagedEvents.set(signature, { event, count: 1 });
      const staged = stagedTracks.get(identity);
      if (staged) mergeMetadata(staged, event);
      else {
        if (!state.tracks.has(identity)) { newTracks += 1; if (state.tracks.size + newTracks > state.limits.maxUniqueTracks) throw new Error(`History import exceeds the ${state.limits.maxUniqueTracks.toLocaleString('en-US')}-unique-track limit.`); }
        stagedTracks.set(identity, aggregateFor(event));
      }
    }
    // All validation and limits succeeded before the accumulator is changed.
    for (const [identity, metadata] of stagedTracks) {
      const existing = state.tracks.get(identity);
      if (existing) mergeMetadata(existing, metadata); else state.tracks.set(identity, metadata);
    }
    for (const [signature, { event, count }] of stagedEvents) {
      const previous = state.eventMultiplicities.get(signature) || 0;
      const added = Math.max(0, count - previous);
      state.eventMultiplicities.set(signature, Math.max(previous, count));
      state.duplicates += count - added;
      if (!added) continue;
      const track = state.tracks.get(event.identity)!;
      track.plays = safeAdd(track.plays, added);
      track.ms = safeAdd(track.ms, event.ms * added);
      track.first = Math.min(track.first, event.time); track.last = Math.max(track.last, event.time);
      state.events = safeAdd(state.events, added); state.totalMs = safeAdd(state.totalMs, event.ms * added);
    }
    state.format = state.format || format;
    state.files += 1; state.bytes += bytes; state.records += parsed.length;
    state.skippedNonMusic += skippedNonMusic; state.skippedInvalid += skippedInvalid; state.skippedZeroDuration += skippedZeroDuration;
  } catch (error) {
    release(state, 'failed');
    throw error;
  }
}

/** Terminal operation: returns sanitized aggregate rows and releases per-event deduplication state. */
export function finishSpotifyHistory(accumulator: SpotifyHistoryAccumulator): SpotifyHistoryImport {
  const state = openState(accumulator);
  if (!state.events || !state.format) { release(state, 'failed'); throw new Error('No valid music plays with positive listening time were found. Choose Spotify streaming-history files containing music.'); }
  const tracks = [...state.tracks.values()].sort((a, b) => b.plays - a.plays || b.ms - a.ms || compareText(a.identity, b.identity));
  const rows: Record<string, string>[] = tracks.map((track) => ({
    'Track Name': track.title, 'Artist Name(s)': track.artist, 'Album Name': track.album, 'Album Artist': state.format === 'extended' ? track.artist : '', 'Track URI': track.uri,
    'History Plays': String(track.plays), 'History Ms Played': String(track.ms), 'History First Played': iso(track.first), 'History Last Played': iso(track.last),
  }));
  let first = Infinity; let last = -Infinity;
  for (const track of tracks) { first = Math.min(first, track.first); last = Math.max(last, track.last); }
  const summary: ListeningHistorySummary = {
    kind: 'spotify-listening-history', format: state.format, files: state.files, events: state.events, uniqueTracks: tracks.length,
    totalMsPlayed: state.totalMs, firstPlayedAt: iso(first), lastPlayedAt: iso(last), duplicates: state.duplicates,
    skippedNonMusic: state.skippedNonMusic, skippedInvalid: state.skippedInvalid, skippedZeroDuration: state.skippedZeroDuration,
  };
  release(state, 'finished');
  return { rows, summary };
}

/** Safe for caller cancellation/finally, including after finish. */
export function disposeSpotifyHistoryAccumulator(accumulator: SpotifyHistoryAccumulator): void { const state = states.get(accumulator); if (state) release(state, 'disposed'); }
function release(state: HistoryState, status: HistoryState['status']): void { state.eventMultiplicities.clear(); state.tracks.clear(); state.status = status; }
function openState(accumulator: SpotifyHistoryAccumulator): HistoryState { const state = states.get(accumulator); if (!state || state.status !== 'open') throw new Error('This history import is finished, disposed, or failed. Start a new import.'); return state; }
function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === 'object' && value !== null && !Array.isArray(value); }
function has(record: Record<string, unknown>, name: string): boolean { return Object.prototype.hasOwnProperty.call(record, name); }
function detectFormat(row: Record<string, unknown>): SpotifyHistoryFormat | 'mixed' | null {
  const extended = ['ts','ms_played','master_metadata_track_name','master_metadata_album_artist_name','spotify_track_uri'].some((name) => has(row, name));
  const standard = ['endTime','msPlayed','trackName','artistName'].some((name) => has(row, name));
  return extended && standard ? 'mixed' : extended ? 'extended' : standard ? 'standard' : null;
}
function isNonMusic(row: Record<string, unknown>, format: SpotifyHistoryFormat): boolean {
  const fields = format === 'extended' ? ['episode_name','episode_show_name','spotify_episode_uri','audiobook_title','audiobook_chapter_title','audiobook_uri','audiobook_chapter_uri','audiobook_isbn'] : ['episodeName','showName','episodeUri','audiobookTitle','bookName','chapterName'];
  return fields.some((name) => typeof row[name] === 'string' && row[name].trim() !== '') || (typeof row.spotify_track_uri === 'string' && /^spotify:(?:episode|show|audiobook|chapter):/u.test(row.spotify_track_uri));
}
function field(value: unknown): string | null { return typeof value === 'string' && value.length <= MAX_FIELD_LENGTH && !hasUnsafeControl(value) ? value.normalize('NFC').trim().replace(/\s+/gu, ' ') || null : null; }
function hasUnsafeControl(value: string): boolean { for (let index = 0; index < value.length; index += 1) { const code = value.charCodeAt(index); if (code < 32 && code !== 9 && code !== 10 && code !== 13) return true; } return false; }
function identityText(value: string): string { return value.normalize('NFC').toLowerCase().replace(/\s+/gu, ' ').trim(); }
function mergeMetadata(target: TrackAggregate, incoming: Pick<TrackAggregate, 'title' | 'artist' | 'album'> & { albumConflict?: boolean }): void {
  if (compareText(incoming.title, target.title) < 0) target.title = incoming.title;
  if (compareText(incoming.artist, target.artist) < 0) target.artist = incoming.artist;
  if (incoming.albumConflict || (target.album && incoming.album && identityText(target.album) !== identityText(incoming.album))) target.albumConflict = true;
  if (target.albumConflict) target.album = ''; else if (incoming.album && (!target.album || compareText(incoming.album, target.album) < 0)) target.album = incoming.album;
}
function aggregateFor(event: MusicEvent): TrackAggregate { return { ...event, albumConflict: false, plays: 0, ms: 0, first: Infinity, last: -Infinity }; }
function compareText(a: string, b: string): number { return a < b ? -1 : a > b ? 1 : 0; }
function safeAdd(a: number, b: number): number { const sum = a + b; if (!Number.isSafeInteger(sum)) throw new Error('History duration or play totals exceed safe numeric limits.'); return sum; }
function iso(time: number): string { return new Date(time).toISOString(); }
function parseTime(value: unknown, format: SpotifyHistoryFormat): number | null {
  if (typeof value !== 'string') return null;
  const match = format === 'extended' ? value.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?(Z|[+-]\d{2}:\d{2})$/u) : value.match(/^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2})$/u);
  if (!match) return null;
  const [year,month,day,hour,minute] = match.slice(1, 6).map(Number);
  const second = format === 'extended' ? Number(match[6]) : 0;
  const milliseconds = format === 'extended' ? Number((match[7] || '').padEnd(3, '0')) : 0;
  if (year < 2000 || year > 2100 || month < 1 || month > 12 || day < 1 || day > 31 || hour > 23 || minute > 59 || second > 59) return null;
  const calendarTime = Date.UTC(year, month - 1, day, hour, minute, second, milliseconds);
  const calendar = new Date(calendarTime);
  if (calendar.getUTCFullYear() !== year || calendar.getUTCMonth() !== month - 1 || calendar.getUTCDate() !== day) return null;
  let offset = 0;
  if (format === 'extended' && match[8] !== 'Z') {
    const zone = match[8]; const hours = Number(zone.slice(1, 3)); const minutes = Number(zone.slice(4, 6));
    if (hours > 14 || minutes > 59 || (hours === 14 && minutes !== 0)) return null;
    offset = (zone[0] === '+' ? 1 : -1) * (hours * 60 + minutes) * 60_000;
  }
  const time = calendarTime - offset;
  return Number.isFinite(time) && time <= Date.now() + 86_400_000 ? time : null;
}
function utf8Bytes(text: string, limit: number): number {
  let bytes = 0;
  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index);
    if (code <= 0x7F) bytes += 1; else if (code <= 0x7FF) bytes += 2;
    else if (code >= 0xD800 && code <= 0xDBFF && index + 1 < text.length && text.charCodeAt(index + 1) >= 0xDC00 && text.charCodeAt(index + 1) <= 0xDFFF) { bytes += 4; index += 1; }
    else bytes += 3;
    if (bytes > limit) throw new Error('History file exceeds the per-file byte limit.');
  }
  return bytes;
}
