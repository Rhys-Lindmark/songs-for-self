import { NextResponse } from 'next/server';
import { parseSpotifyTrackEmbed, parseSpotifyTrackId } from '@/lib/spotify-copied-tracks';

export const runtime = 'edge';

const cors = { 'Access-Control-Allow-Origin': '*' };

export async function GET(request: Request) {
  const trackId = parseSpotifyTrackId(new URL(request.url).searchParams.get('track') ?? '');
  if (!trackId) return NextResponse.json({ error: 'That is not a valid Spotify track.' }, { status: 400, headers: cors });

  try {
    const response = await fetch(`https://open.spotify.com/embed/track/${trackId}`, {
      headers: { 'User-Agent': 'SongsForSelf/1.0 (+https://ai.rhyslindmark.com/music)' },
      signal: AbortSignal.timeout(12_000),
    });
    if (!response.ok) throw new Error(`Spotify track preview returned ${response.status}.`);
    return NextResponse.json(parseSpotifyTrackEmbed(await response.text()), {
      headers: { ...cors, 'Cache-Control': 'public, max-age=86400, s-maxage=2592000, stale-while-revalidate=604800' },
    });
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : 'Spotify track preview could not be read.';
    return NextResponse.json({ error: message }, { status: 502, headers: cors });
  }
}
