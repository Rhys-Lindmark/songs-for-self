import { NextResponse } from 'next/server';
import { parseSpotifyPlaylistId } from '@/lib/spotify-import';
import { parseSpotifyPublicPreview } from '@/lib/spotify-public-preview';

export const runtime = 'edge';

const cors = { 'Access-Control-Allow-Origin': '*' };

export async function GET(request: Request) {
  const playlistId = parseSpotifyPlaylistId(new URL(request.url).searchParams.get('playlist') ?? '');
  if (!playlistId) return NextResponse.json({ error: 'Paste a valid Spotify playlist link.' }, { status: 400, headers: cors });

  try {
    const headers = { 'User-Agent': 'SongsForSelf/1.0 (+https://ai.rhyslindmark.com/music)' };
    const [embedResponse, publicResponse] = await Promise.all([
      fetch(`https://open.spotify.com/embed/playlist/${playlistId}`, { headers, signal: AbortSignal.timeout(12_000) }),
      fetch(`https://open.spotify.com/playlist/${playlistId}`, { headers, signal: AbortSignal.timeout(12_000) }),
    ]);
    if (!embedResponse.ok) throw new Error(`Spotify preview returned ${embedResponse.status}.`);
    const preview = parseSpotifyPublicPreview(
      await embedResponse.text(),
      publicResponse.ok ? await publicResponse.text() : '',
    );
    return NextResponse.json(preview, {
      headers: { ...cors, 'Cache-Control': 'public, max-age=60, s-maxage=300, stale-while-revalidate=600' },
    });
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : 'Spotify preview could not be read.';
    return NextResponse.json({ error: message }, { status: 502, headers: cors });
  }
}
