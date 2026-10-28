type SpotifyEmbedTrack = {
  uri?: string;
  title?: string;
  subtitle?: string;
  entityType?: string;
};

type SpotifyEmbedPayload = {
  props?: {
    pageProps?: {
      state?: {
        data?: {
          entity?: {
            name?: string;
            subtitle?: string;
            trackList?: SpotifyEmbedTrack[];
          };
        };
      };
    };
  };
};

export type SpotifyPublicPreview = {
  title: string;
  owner: string;
  total: number | null;
  rows: Record<string, string>[];
};

export function parseSpotifyPublicPreview(embedHtml: string, publicHtml = ''): SpotifyPublicPreview {
  const script = embedHtml.match(/<script\s+id=["']__NEXT_DATA__["']\s+type=["']application\/json["']>([\s\S]*?)<\/script>/i)?.[1];
  if (!script) throw new Error('Spotify did not expose a public playlist preview.');

  let payload: SpotifyEmbedPayload;
  try {
    payload = JSON.parse(script) as SpotifyEmbedPayload;
  } catch {
    throw new Error('Spotify returned a public preview that could not be read.');
  }

  const entity = payload.props?.pageProps?.state?.data?.entity;
  const rows = (entity?.trackList ?? []).flatMap((track) => {
    const id = track.uri?.match(/^spotify:track:([A-Za-z0-9]{22})$/)?.[1];
    if (!id || track.entityType !== 'track') return [];
    return [{
      'Track Name': track.title?.trim() || 'Untitled track',
      'Artist Name(s)': track.subtitle?.trim() || 'Unknown artist',
      'Spotify Track ID': id,
      'Track URI': `spotify:track:${id}`,
    }];
  });

  if (!rows.length) throw new Error('Spotify did not expose any playable tracks in this public preview.');

  const description = publicHtml.match(/<meta\s+(?:property=["']og:description["']\s+)?content=["']([^"']*?\b[\d,]+\s+items\b[^"']*)["'][^>]*>/i)?.[1]
    ?? publicHtml.match(/<meta\s+[^>]*content=["']([^"']*?\b[\d,]+\s+items\b[^"']*)["'][^>]*>/i)?.[1]
    ?? '';
  const totalMatch = description.match(/\b([\d,]+)\s+items\b/i);
  const total = totalMatch ? Number(totalMatch[1].replaceAll(',', '')) : null;

  return {
    title: entity?.name?.trim() || 'Spotify playlist',
    owner: entity?.subtitle?.trim() || '',
    total: Number.isFinite(total) && total! >= rows.length ? total : null,
    rows,
  };
}
