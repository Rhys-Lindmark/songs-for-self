export type TimelineRange = {
  min: number;
  max: number;
};

/**
 * Converts a musical year to its exact percentage along a linear timeline.
 * Labels, guide lines, and bubbles all use this function so their coordinates
 * cannot drift apart when the range changes.
 */
export function timelinePercent(year: number, range: TimelineRange): number {
  if (!Number.isFinite(year) || !Number.isFinite(range.min) || !Number.isFinite(range.max)) {
    throw new TypeError('Timeline values must be finite numbers');
  }
  if (range.max <= range.min) throw new RangeError('Timeline max must be greater than min');
  return ((year - range.min) / (range.max - range.min)) * 100;
}

export function timelineLeft(year: number, range: TimelineRange): string {
  return `${timelinePercent(year, range)}%`;
}
