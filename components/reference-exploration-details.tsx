'use client';
import { useEffect, useState } from 'react';
import { MusicCoverage, type MusicCoverageSnapshot } from '@/components/music-coverage';
import { AcclaimedAlbums, type AcclaimedAlbumsSnapshot } from '@/components/acclaimed-albums';
import { loadPublicJson } from '@/lib/public-json-cache';
import type { AnalyzedTrack } from '@/lib/playlist-analyzer';
type ReferenceData = { version: number; tracks: AnalyzedTrack[]; music: MusicCoverageSnapshot; albums: AcclaimedAlbumsSnapshot };
export function ReferenceExplorationDetails({ panel }: { panel: 'music' | 'albums' }) {
  const [data, setData] = useState<ReferenceData | null>(null);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [view, setView] = useState<'time' | 'space' | 'map'>('time');
  useEffect(() => {
    let cancelled = false;
    loadPublicJson<ReferenceData>('reference-exploration.json').then((value) => { if (!cancelled) setData(value); }).catch(() => { if (!cancelled) setError('Exploration details could not load. The summary scores are still available.'); });
    return () => { cancelled = true; };
  }, [attempt]);
  if (error) return <output className="block py-3 text-sm">{error}<button type="button" onClick={() => { setError(''); setAttempt(attempt + 1); }} className="ml-2 min-h-11 underline">Retry exploration details</button></output>;
  if (!data) return <output className="block py-3 text-sm">Loading exploration details…</output>;
  return panel === 'music' ? <div>
    <label className="text-xs">Arrange music areas<select aria-label="Music area arrangement" value={view} onChange={(event) => setView(event.target.value as typeof view)} className="ml-2 min-h-11 rounded-md border border-[#17221e]/20 bg-[#f3efe4] px-3 text-sm"><option value="time">Time</option><option value="space">Genre space</option><option value="map">Geography</option></select></label>
    <MusicCoverage tracks={data.tracks} view={view} snapshot={data.music} showSummary={false} defaultExpanded />
  </div> : <AcclaimedAlbums tracks={data.tracks} snapshot={data.albums} showSummary={false} defaultExpanded />;
}
