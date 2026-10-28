export type MapView = { centerX: number; centerY: number; scale: number };

export const WORLD_VIEW: MapView = { centerX: 500, centerY: 250, scale: 1 };

export function geographyDotRadius(count: number, maxCount: number, scale = 1) {
  const safeMax = Math.max(1, maxCount);
  const screenRadius = 4 + 34 * Math.sqrt(Math.max(0, count) / safeMax);
  return screenRadius / Math.max(1, scale);
}

export function focusMapView(points: { x: number | null; y: number | null }[], fallback: { x: number; y: number }): MapView {
  const valid = points.filter((point): point is { x: number; y: number } => Number.isFinite(point.x) && Number.isFinite(point.y));
  if (!valid.length) return { centerX: fallback.x, centerY: fallback.y, scale: 3 };
  const xs = valid.map((point) => point.x);
  const ys = valid.map((point) => point.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const spanX = Math.max(55, maxX - minX);
  const spanY = Math.max(38, maxY - minY);
  return {
    centerX: (minX + maxX) / 2,
    centerY: (minY + maxY) / 2,
    scale: Math.min(7, Math.max(1.8, Math.min(780 / spanX, 390 / spanY))),
  };
}

export function zoomMapView(view: MapView, factor: number): MapView {
  return { ...view, scale: Math.min(8, Math.max(1, view.scale * factor)) };
}

