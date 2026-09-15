import { describe, expect, it } from 'vitest';

import { STARFORGED } from '../generated/index.js';
import {
  ADAPTATION_NOTICE,
  buildAttributionScreen,
  collectAttributionEntries,
} from './attribution.js';

describe('collectAttributionEntries, against the real Starforged data', () => {
  const entries = collectAttributionEntries(STARFORGED);

  it('finds exactly the two sourcebooks actually cited in the data', () => {
    expect(entries.map((e) => e.title)).toEqual([
      'Ironsworn: Starforged Assets',
      'Ironsworn: Starforged Rulebook',
    ]);
  });

  it('credits Shawn Tomkin on every entry', () => {
    for (const entry of entries) {
      expect(entry.authors).toEqual(['Shawn Tomkin']);
    }
  });

  it('gives every entry the CC BY 4.0 license, by URL and by human-readable name', () => {
    for (const entry of entries) {
      expect(entry.license).toBe('https://creativecommons.org/licenses/by/4.0');
      expect(entry.licenseName).toBe('CC BY 4.0');
    }
  });

  it('gives every entry the source URL', () => {
    for (const entry of entries) {
      expect(entry.url).toBe('https://ironswornrpg.com');
    }
  });

  it('merges authors for the same (title, url, license) rather than duplicating the entry', () => {
    // Every move, oracle and asset shares an author for its book; if
    // merging didn't work there would be far more than 2 entries.
    expect(entries).toHaveLength(2);
  });

  it('falls back to the license URL itself for an unrecognised license', () => {
    const fixture = {
      moves: [
        {
          id: 'move:x/y' as never,
          category: 'adventure' as never,
          name: 'X',
          rollType: 'none' as never,
          trigger: { text: '', conditions: [] },
          outcomes: null,
          text: '',
          embeddedOracles: [],
          source: {
            sourceId: 's',
            sourceVersion: '0.0.10',
            book: 'Some Other Book',
            authors: ['Someone'],
            license: 'https://example.com/some-license',
            url: 'https://example.com',
          },
        },
      ],
      oracles: [],
      assets: [],
      assetCategories: [],
      truths: [],
      gameRules: { conditionMeters: [], impacts: [], specialTracks: [] },
    };
    const result = collectAttributionEntries(fixture);
    expect(result).toEqual([
      {
        title: 'Some Other Book',
        authors: ['Someone'],
        url: 'https://example.com',
        license: 'https://example.com/some-license',
        licenseName: 'https://example.com/some-license',
      },
    ]);
  });
});

describe('ADAPTATION_NOTICE', () => {
  it('says changes were made, per CC BY 4.0’s attribution requirement', () => {
    expect(ADAPTATION_NOTICE.length).toBeGreaterThan(0);
    expect(ADAPTATION_NOTICE.toLowerCase()).toContain('adapter');
  });
});

describe('buildAttributionScreen', () => {
  const screen = buildAttributionScreen(STARFORGED);

  it('has a heading and an intro', () => {
    expect(screen.heading.length).toBeGreaterThan(0);
    expect(screen.intro.length).toBeGreaterThan(0);
  });

  it('does not claim to reproduce art or page layout (CLAUDE.md)', () => {
    expect(screen.intro.toLowerCase()).toContain('no art or page layout');
  });

  it('includes the real entries, the adaptation notice, and the Datasworn credit', () => {
    expect(screen.entries.length).toBeGreaterThan(0);
    expect(screen.adaptationNotice).toBe(ADAPTATION_NOTICE);
    expect(screen.toolCredit.name).toBe('Datasworn');
    expect(screen.toolCredit.url).toBe('https://github.com/rsek/datasworn');
  });
});
