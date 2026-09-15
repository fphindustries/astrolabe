import { describe, expect, it } from 'vitest';

import {
  clockSegments,
  filledBoxes,
  meterPips,
  momentumCells,
  progressBoxes,
  segmentPath,
} from './tracks.js';

describe('track and meter geometry (10.2)', () => {
  it('fills a progress track four ticks to a box', () => {
    expect(progressBoxes(0, 40)).toEqual(Array(10).fill(0));
    expect(progressBoxes(9, 40)).toEqual([4, 4, 1, 0, 0, 0, 0, 0, 0, 0]);
    expect(progressBoxes(40, 40)).toEqual(Array(10).fill(4));
    expect(progressBoxes(99, 40)).toEqual(Array(10).fill(4));
    expect(filledBoxes(9)).toBe(2);
  });

  it('fills meter pips and clock segments up to the value', () => {
    expect(meterPips(4, 5)).toEqual([true, true, true, true, false]);
    expect(clockSegments(1, 4)).toEqual([true, false, false, false]);
  });

  it('draws a clock segment as a wedge from the centre', () => {
    expect(segmentPath(0, 4, 10)).toBe('M 10 10 L 10 0 A 10 10 0 0 1 20 10 Z');
  });

  it('lays momentum from its minimum to its maximum, filled from zero toward the value', () => {
    const cells = momentumCells(2, -6, 10, 2);
    expect(cells).toHaveLength(17);
    expect(cells.filter((c) => c.filled).map((c) => c.value)).toEqual([1, 2]);
    expect(cells.find((c) => c.current)?.value).toBe(2);
    expect(cells.find((c) => c.reset)?.value).toBe(2);
    expect(
      momentumCells(-2, -6, 10)
        .filter((c) => c.filled)
        .map((c) => c.value),
    ).toEqual([-2, -1]);
  });
});
