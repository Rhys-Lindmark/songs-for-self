'use client';

import { useEffect, useRef, useState } from 'react';
import { resolveArtwork, type ArtworkSource } from '@/lib/album-artwork';

export function AlbumArtwork({ album, artist = '', coverUrl, spotifyAlbumId, spotifyTrackId, className = '' }: ArtworkSource & { album: string; artist?: string; className?: string }) {
  const frame = useRef<HTMLSpanElement>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [visible, setVisible] = useState(false);
  const [fallback, setFallback] = useState(false);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const element = frame.current;
    if (!element) return;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) { setVisible(true); observer.disconnect(); }
    }, { rootMargin: '80px' });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    void resolveArtwork({ coverUrl, spotifyAlbumId, spotifyTrackId }, fallback).then((next) => {
      if (!cancelled) { setUrl(next); setFailed(!next); }
    });
    return () => { cancelled = true; };
  }, [coverUrl, spotifyAlbumId, spotifyTrackId, visible, fallback]);
  return <span ref={frame} data-album-artwork data-artwork-status={failed ? 'unavailable' : url ? 'ready' : 'loading'} className={`relative block aspect-square overflow-hidden bg-[#ded8c9] ${className}`}>
    <span aria-hidden="true" className="absolute inset-0 grid place-items-center p-1 text-center font-serif text-[10px] leading-tight text-[#17221e]/55">{(album || artist || '?').split(/\s+/).slice(0, 2).map((word) => word[0]).join('')}</span>
    {url && !failed && (
      // Real catalog artwork is loaded lazily; missing covers retain a named placeholder.
      // oxlint-disable-next-line next/no-img-element
      <img src={url} alt={`Cover of ${album || 'album'}${artist ? ` by ${artist}` : ''}`} loading="lazy" decoding="async" onError={() => { if (!fallback && (spotifyAlbumId || spotifyTrackId)) { setUrl(null); setFallback(true); } else setFailed(true); }} className="relative h-full w-full object-cover" />
    )}
  </span>;
}
