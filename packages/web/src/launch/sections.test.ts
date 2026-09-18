import { describe, expect, it } from 'vitest';

import { matchRoute } from '../app/router.js';

import {
  isLaunchSection,
  launchOverviewPath,
  launchReviewPath,
  launchSectionPath,
  LAUNCH_SECTION_ORDER,
  playPath,
  SECTION_ARRIVES_IN,
  SECTION_LABELS,
  SECTION_SUMMARIES,
} from './sections.js';

describe('the launch section catalogue', () => {
  it('lists D-160’s seven sections once each', () => {
    expect(LAUNCH_SECTION_ORDER).toHaveLength(7);
    expect(new Set(LAUNCH_SECTION_ORDER).size).toBe(7);
    expect(LAUNCH_SECTION_ORDER[0]).toBe('foundation');
    expect(LAUNCH_SECTION_ORDER.at(-1)).toBe('incident_launch');
  });

  it('names, summarises and places every section', () => {
    // A `Record<LaunchSection, …>` already fails to compile if a section is
    // missing. This catches the other direction — an eighth section added to
    // the rules and to the records, but never to the order the screen renders.
    for (const table of [SECTION_LABELS, SECTION_SUMMARIES, SECTION_ARRIVES_IN])
      expect(Object.keys(table).sort()).toEqual([...LAUNCH_SECTION_ORDER].sort());
  });

  it('marks exactly the sections that have no editor yet', () => {
    // Built sections are `null`; the rest are honest placeholders naming the
    // group that brings them. Group 4 built Foundation, group 5 Truths, so this
    // count drops by one each time a group lands.
    expect(SECTION_ARRIVES_IN.foundation).toBeNull();
    expect(SECTION_ARRIVES_IN.truths).toBeNull();
    expect(SECTION_ARRIVES_IN.crew).toBeNull();
    expect(SECTION_ARRIVES_IN.starship).toBeNull();
    const pending = LAUNCH_SECTION_ORDER.filter((section) => SECTION_ARRIVES_IN[section] !== null);
    expect(pending).toHaveLength(3);
    for (const section of pending) expect(SECTION_ARRIVES_IN[section]).toMatch(/group \d/);
  });

  it('recognises a section segment and nothing else', () => {
    expect(isLaunchSection('foundation')).toBe(true);
    expect(isLaunchSection('connection_troubles')).toBe(true);
    // `review` is a sibling route, not a section: the matcher takes it first.
    expect(isLaunchSection('review')).toBe(false);
    expect(isLaunchSection('Foundation')).toBe(false);
    expect(isLaunchSection('')).toBe(false);
  });

  it('builds paths the route matcher accepts (one spelling, not two)', () => {
    expect(matchRoute(launchOverviewPath('c1'))).toEqual({
      name: 'launch-overview',
      campaignId: 'c1',
    });
    expect(matchRoute(launchReviewPath('c1'))).toEqual({ name: 'launch-review', campaignId: 'c1' });
    expect(matchRoute(playPath('c1'))).toEqual({ name: 'play', campaignId: 'c1' });
    for (const section of LAUNCH_SECTION_ORDER)
      expect(matchRoute(launchSectionPath('c1', section))).toEqual({
        name: 'launch-section',
        campaignId: 'c1',
        section,
      });
  });
});
