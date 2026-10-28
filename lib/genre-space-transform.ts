export type GenreSpaceOffset = { x: number; y: number };

export function pinchTransform({
  startScale,
  startOffset,
  center,
  startDistance,
  distance,
}: {
  startScale: number;
  startOffset: GenreSpaceOffset;
  center: GenreSpaceOffset;
  startDistance: number;
  distance: number;
}): { scale: number; offset: GenreSpaceOffset } {
  if (![startScale, startDistance, distance, center.x, center.y, startOffset.x, startOffset.y].every(Number.isFinite) || startScale <= 0 || startDistance <= 0 || distance < 0) {
    throw new RangeError('Pinch values must be finite and distances/scales must be positive');
  }
  const scale = Math.max(1, Math.min(8, startScale * distance / startDistance));
  const scaleRatio = scale / startScale;
  return {
    scale,
    offset: {
      x: center.x - 0.5 - (center.x - 0.5 - startOffset.x) * scaleRatio,
      y: center.y - 0.5 - (center.y - 0.5 - startOffset.y) * scaleRatio,
    },
  };
}
