const TRACK_ID_PATTERN = /^[A-Za-z0-9]{22}$/;
const TRACK_REFERENCE_PATTERN = /(?:spotify:track:|open\.spotify\.com\/track\/)([A-Za-z0-9]{22})/gi;

type SpotifyTrackEmbed = {
  props?: {
    pageProps?: {
      state?: {
        data?: {
          entity?: {
            type?: string;
            id?: string;
            uri?: string;
            name?: string;
            title?: string;
            artists?: Array<{ name?: string; uri?: string }>;
            releaseDate?: { isoString?: string };
            visualIdentity?: { image?: Array<{ url?: string }> };
          };
        };
      };
    };
  };
};

export function extractSpotifyTrackIds(text: string) {
  const ids: string[] = [];
  for (const match of text.matchAll(TRACK_REFERENCE_PATTERN)) ids.push(match[1]);
  return ids;
}

export function parseSpotifyTrackId(input: string) {
  const value = input.trim();
  if (TRACK_ID_PATTERN.test(value)) return value;
  return extractSpotifyTrackIds(value)[0] ?? null;
}

export function parseSpotifyTrackEmbed(embedHtml: string) {
  const script = embedHtml.match(/<script\s+id=["']__NEXT_DATA__["']\s+type=["']application\/json["']>([\s\S]*?)<\/script>/i)?.[1];
  if (!script) throw new Error('Spotify did not expose this public track.');

  let payload: SpotifyTrackEmbed;
  try {
    payload = JSON.parse(script) as SpotifyTrackEmbed;
  } catch {
    throw new Error('Spotify returned a public track card that could not be read.');
  }

  const entity = payload.props?.pageProps?.state?.data?.entity;
  const id = entity?.id ?? entity?.uri?.match(/^spotify:track:([A-Za-z0-9]{22})$/)?.[1];
  if (entity?.type !== 'track' || !id || !TRACK_ID_PATTERN.test(id)) throw new Error('Spotify did not expose a playable track card.');

  const releaseDate = entity.releaseDate?.isoString?.slice(0, 10) ?? '';
  return {
    'Track Name': entity.title?.trim() || entity.name?.trim() || 'Untitled track',
    'Artist Name(s)': (entity.artists ?? []).map((artist) => artist.name?.trim()).filter(Boolean).join('; ') || 'Unknown artist',
    'Artist IDs': (entity.artists ?? []).map((artist) => artist.uri?.match(/^spotify:artist:([A-Za-z0-9]{22})$/)?.[1]).filter(Boolean).join('; '),
    'Release Date': releaseDate,
    'Spotify Track ID': id,
    'Track URI': `spotify:track:${id}`,
    'Image URL': entity.visualIdentity?.image?.find((image) => image.url)?.url ?? '',
  };
}
