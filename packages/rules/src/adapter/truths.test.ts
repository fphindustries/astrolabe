import type { Datasworn } from '@datasworn/core';
import { describe, expect, it } from 'vitest';

import raw from '@datasworn/starforged/json/starforged.json' with { type: 'json' };

import { mapTruths } from './truths.js';

const ruleset = raw as unknown as Datasworn.Ruleset;

describe('mapTruths against the real Starforged data', () => {
  const truths = mapTruths(ruleset.truths ?? {}, ruleset.datasworn_version);

  it('imports all 14 setting truths', () => {
    expect(truths).toHaveLength(14);
  });

  it('mints an oracle-namespaced ID via the existing "truths" marker', () => {
    const cataclysm = truths.find((t) => t.name === 'Cataclysm');
    expect(cataclysm?.id).toBe('oracle:cataclysm');
  });

  it('rolls a d100 across the options, with no gaps or overlaps', () => {
    for (const truth of truths) {
      expect(truth.dice).toBe('1d100');
      const sorted = [...truth.rows].sort((a, b) => a.min - b.min);
      expect(sorted[0]?.min).toBe(1);
      expect(sorted[sorted.length - 1]?.max).toBe(100);
      for (let i = 1; i < sorted.length; i++) {
        expect(sorted[i]?.min).toBe((sorted[i - 1]?.max ?? 0) + 1);
      }
    }
  });

  it('strips the embedded elaboration-table markup rather than showing it verbatim', () => {
    const cataclysm = truths.find((t) => t.name === 'Cataclysm');
    for (const row of cataclysm?.rows ?? []) {
      expect(row.text).not.toContain('{{table:');
    }
  });

  it('does not populate embeddedOracles, since the elaboration tables are not imported', () => {
    for (const truth of truths) {
      for (const row of truth.rows) {
        expect(row.embeddedOracles).toBeUndefined();
      }
    }
  });
});
