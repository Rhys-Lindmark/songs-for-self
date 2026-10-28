export type SpotifyAccountPlaylist = {
  name: string;
  lastModifiedDate: string;
  rows: Record<string, string>[];
  skipped: number;
};

type ExportTrack = {
  trackName?: unknown;
  artistName?: unknown;
  albumName?: unknown;
  trackUri?: unknown;
};

type ExportItem = {
  track?: ExportTrack | null;
  localTrack?: ExportTrack | null;
  episode?: unknown;
};

type ExportPlaylist = {
  name?: unknown;
  lastModifiedDate?: unknown;
  items?: unknown;
};

export function parseSpotifyAccountData(text: string): SpotifyAccountPlaylist[] {
  let payload: unknown;
  try {
    payload = JSON.parse(text);
  } catch {
    throw new Error('That JSON file could not be read. Choose the playlist file from a Spotify account-data download.');
  }
  if (!isRecord(payload) || !Array.isArray(payload.playlists)) {
    throw new Error('No Spotify playlists were found in that JSON file. Choose the playlist file from your account-data download.');
  }

  return payload.playlists.flatMap((value, index) => {
    if (!isRecord(value)) return [];
    const playlist = value as ExportPlaylist;
    const rows: Record<string, string>[] = [];
    let skipped = 0;
    for (const item of Array.isArray(playlist.items) ? playlist.items : []) {
      if (!isRecord(item)) { skipped += 1; continue; }
      const exported = item as ExportItem;
      const track = exported.track ?? exported.localTrack;
      if (!track || !textValue(track.trackName) || !textValue(track.artistName)) { skipped += 1; continue; }
      const uri = textValue(track.trackUri);
      rows.push({
        'Track Name': textValue(track.trackName),
        'Artist Name(s)': textValue(track.artistName),
        'Album Name': textValue(track.albumName),
        'Track URI': uri,
        'Spotify Track ID': spotifyTrackId(uri),
      });
    }
    return [{
      name: textValue(playlist.name) || `Playlist ${index + 1}`,
      lastModifiedDate: textValue(playlist.lastModifiedDate),
      rows,
      skipped,
    }];
  }).filter((playlist) => playlist.rows.length > 0);
}

function spotifyTrackId(uri: string) {
  const match = uri.match(/^spotify:track:([A-Za-z0-9]{22})$/);
  return match?.[1] ?? '';
}

function textValue(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
