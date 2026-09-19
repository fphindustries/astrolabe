import { beforeEach, describe, expect, it } from 'vitest';

import { clearArrival, noteArrival, pathOf, takeArrival } from './arrival.js';

describe('arrival by in-app navigation (D-209)', () => {
  beforeEach(clearArrival);

  it('hands the arrival to the first taker at that path, and to no one after', () => {
    noteArrival('/campaigns/abc/launch');
    expect(takeArrival('/campaigns/abc/launch')).toBe(true);
    expect(takeArrival('/campaigns/abc/launch')).toBe(false);
  });

  it('is not taken by a screen at another path, and waits for the right one', () => {
    noteArrival('/campaigns/abc');
    expect(takeArrival('/')).toBe(false);
    expect(takeArrival('/campaigns/abc')).toBe(true);
  });

  it('compares the path alone, not its query or fragment', () => {
    expect(pathOf('/campaigns/abc/launch?x=1#top')).toBe('/campaigns/abc/launch');
    noteArrival('/campaigns/abc?tab=1');
    expect(takeArrival('/campaigns/abc')).toBe(true);
  });

  it('is cleared by back/forward, so a restored page keeps the browser’s own focus', () => {
    noteArrival('/campaigns/abc');
    clearArrival();
    expect(takeArrival('/campaigns/abc')).toBe(false);
  });

  it('is replaced by the next navigation', () => {
    noteArrival('/a');
    noteArrival('/b');
    expect(takeArrival('/a')).toBe(false);
    expect(takeArrival('/b')).toBe(true);
  });

  it('is nothing on a full page load', () => {
    expect(takeArrival('/')).toBe(false);
  });
});
