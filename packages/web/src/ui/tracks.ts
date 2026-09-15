/**
 * Pure geometry for the purpose-built track and meter displays (task 10.2,
 * §8). Kept out of JSX so the rules of the drawing are tested without a DOM.
 */

/** Starforged progress tracks mark four ticks to a box. */
export const TICKS_PER_BOX = 4;

/** Each box's ticks, 0–4, for a track of `maxTicks` (a vow's 40 is ten boxes). */
export function progressBoxes(ticks: number, maxTicks: number): readonly number[] {
  const boxes = Math.max(1, Math.ceil(maxTicks / TICKS_PER_BOX));
  const clamped = Math.min(Math.max(ticks, 0), maxTicks);
  return Array.from({ length: boxes }, (_, index) =>
    Math.min(Math.max(clamped - index * TICKS_PER_BOX, 0), TICKS_PER_BOX),
  );
}

/** Whole boxes filled: what a progress roll counts. */
export function filledBoxes(ticks: number): number {
  return Math.floor(Math.max(ticks, 0) / TICKS_PER_BOX);
}

/** One flag per pip of a meter: filled up to `value`. */
export function meterPips(value: number, max: number): readonly boolean[] {
  return Array.from({ length: Math.max(max, 0) }, (_, index) => index < value);
}

/** One flag per clock segment, filled clockwise from the top. */
export function clockSegments(filled: number, segments: number): readonly boolean[] {
  return Array.from({ length: Math.max(segments, 1) }, (_, index) => index < filled);
}

/** An SVG path for segment `index` of `count` in a circle of radius `r` centred at (r, r). */
export function segmentPath(index: number, count: number, r: number): string {
  if (count === 1) {
    return `M ${r} 0 A ${r} ${r} 0 1 1 ${r - 0.001} 0 Z`;
  }
  const angle = (i: number) => (i / count) * 2 * Math.PI - Math.PI / 2;
  const point = (a: number) => `${round(r + r * Math.cos(a))} ${round(r + r * Math.sin(a))}`;
  return `M ${r} ${r} L ${point(angle(index))} A ${r} ${r} 0 0 1 ${point(angle(index + 1))} Z`;
}

export interface MomentumCell {
  readonly value: number;
  /** Between zero and the current value: the momentum a burn would spend, or owe. */
  readonly filled: boolean;
  readonly current: boolean;
  readonly reset: boolean;
}

/** Momentum's scale, one cell per point from `min` to `max` (−6 to +10 at most). */
export function momentumCells(
  value: number,
  min: number,
  max: number,
  reset?: number,
): readonly MomentumCell[] {
  const cells: MomentumCell[] = [];
  for (let point = min; point <= max; point++) {
    cells.push({
      value: point,
      filled: value >= 0 ? point > 0 && point <= value : point < 0 && point >= value,
      current: point === value,
      reset: point === reset,
    });
  }
  return cells;
}

const round = (n: number) => Math.round(n * 1000) / 1000;
