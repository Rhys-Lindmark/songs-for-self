'use client';

import { memo, useEffect, useRef, useState } from 'react';
import { loadPublicJson } from '@/lib/public-json-cache';
import { observeArtworkVisibility } from '@/lib/artwork-visibility';
import { configureArtworkCatalogLoader, resolveArtwork, type ArtworkSource, type ArtworkCatalog, type ArtworkResolution } from '@/lib/album-artwork';

configureArtworkCatalogLoader(() => loadPublicJson<ArtworkCatalog>('album-thumbnails.json'));

type Props = ArtworkSource & { album: string; artist?: string; className?: string; resolution?: ArtworkResolution };
export const AlbumArtwork = memo(function AlbumArtwork(props: Props) {
  const key = JSON.stringify([props.coverUrl, props.spotifyAlbumId, props.spotifyTrackId, props.resolution]);
  return <ArtworkImage key={key} {...props} />;
});

function ArtworkImage({ album, artist = '', coverUrl, spotifyAlbumId, spotifyTrackId, resolution = 'thumbnail', className = '' }: Props) {
  const frame = useRef<HTMLSpanElement>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [visible, setVisible] = useState(false);
  const [fallback, setFallback] = useState(false);
  const [failed, setFailed] = useState(false);
  const [larger, setLarger] = useState(false);
  useEffect(() => {
    const element = frame.current;
    if (!element) return;
    return observeArtworkVisibility(element, (intersects) => { if (intersects) setVisible(true); });
  }, []);
  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    void resolveArtwork({ coverUrl, spotifyAlbumId, spotifyTrackId }, fallback, larger ? 'full' : resolution).then((next) => {
      if (!cancelled) { setUrl(next); setFailed(!next); }
    });
    return () => { cancelled = true; };
  }, [coverUrl, spotifyAlbumId, spotifyTrackId, visible, fallback, resolution, larger]);
  return <span ref={frame} data-album-artwork data-artwork-status={failed ? 'unavailable' : url ? 'ready' : 'loading'} className={`relative block aspect-square overflow-hidden bg-[#ded8c9] ${className}`}>
    <span aria-hidden="true" className="absolute inset-0 grid place-items-center p-1 text-center font-serif text-[10px] leading-tight text-[#17221e]/55">{(album || artist || '?').split(/\s+/).slice(0, 2).map((word) => word[0]).join('')}</span>
    {url && !failed && (
      // Real catalog artwork is loaded lazily; missing covers retain a named placeholder.
      // oxlint-disable-next-line next/no-img-element
      <img src={url} alt={`Cover of ${album || 'album'}${artist ? ` by ${artist}` : ''}`} width={resolution === 'thumbnail' && !larger ? 64 : 300} height={resolution === 'thumbnail' && !larger ? 64 : 300} loading="lazy" decoding="async" fetchPriority="low" onError={() => { if (resolution === 'thumbnail' && !larger) { setUrl(null); setLarger(true); } else if (!fallback && (spotifyAlbumId || spotifyTrackId)) { setUrl(null); setFallback(true); } else setFailed(true); }} className="relative h-full w-full object-cover" />
    )}
  </span>;
}
