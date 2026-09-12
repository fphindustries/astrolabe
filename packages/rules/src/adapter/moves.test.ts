import type { Datasworn } from '@datasworn/core';
import { describe, expect, it } from 'vitest';

import raw from '@datasworn/starforged/json/starforged.json' with { type: 'json' };

import { mapMoveCategory } from './moves.js';

const ruleset = raw as unknown as Datasworn.Ruleset;

describe('mapMoveCategory against the real Starforged data', () => {
  const allMoves = Object.values(ruleset.moves).flatMap((category) =>
    mapMoveCategory(category, ruleset.datasworn_version),
  );

  it('imports every move — 56 across 12 categories, verified against the raw data', () => {
    const rawCount = Object.values(ruleset.moves).reduce(
      (sum, category) => sum + Object.keys(category.contents ?? {}).length,
      0,
    );
    expect(rawCount).toBe(56);
    expect(allMoves).toHaveLength(rawCount);
  });

  it('mints a unique ID for every move, category included, so face_danger in two categories does not collide', () => {
    const ids = allMoves.map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toContain('move:adventure/face-danger');
    expect(ids).toContain('move:scene-challenge/face-danger');
  });

  it('keeps Face Danger outcomes verbatim, never parsed', () => {
    const faceDanger = allMoves.find((m) => m.id === 'move:adventure/face-danger');
    expect(faceDanger).toBeDefined();
    expect(faceDanger?.rollType).toBe('action');
    expect(faceDanger?.outcomes?.strong_hit?.text).toBe(
      'On a __strong hit__, you are successful. Take +1 momentum.',
    );
    expect(faceDanger?.trigger.conditions.map((c) => c.rollOptions)).toEqual([
      [{ using: 'stat', stat: 'edge' }],
      [{ using: 'stat', stat: 'heart' }],
      [{ using: 'stat', stat: 'iron' }],
      [{ using: 'stat', stat: 'shadow' }],
      [{ using: 'stat', stat: 'wits' }],
    ]);
  });

  it('maps a no_roll move (Pay the Price) to null outcomes and rewrites its embedded oracle links', () => {
    const payThePrice = allMoves.find((m) => m.id === 'move:fate/pay-the-price');
    expect(payThePrice).toBeDefined();
    expect(payThePrice?.rollType).toBe('none');
    expect(payThePrice?.outcomes).toBeNull();
    expect(payThePrice?.embeddedOracles).toContain('oracle:moves/pay-the-price');
    expect(payThePrice?.embeddedOracles).toContain('oracle:misc/story-complication');
  });

  it('maps Endure Harm’s "highest of iron or health" trigger condition', () => {
    const endureHarm = allMoves.find((m) => m.id === 'move:suffer/endure-harm');
    expect(endureHarm?.trigger.conditions).toEqual([
      {
        method: 'highest',
        rollOptions: [
          { using: 'stat', stat: 'iron' },
          { using: 'condition_meter', meter: 'health' },
        ],
      },
    ]);
  });

  it('rewrites [label](id:...) links inside move text to Astrolabe IDs', () => {
    const faceDanger = allMoves.find((m) => m.id === 'move:adventure/face-danger');
    expect(faceDanger?.text).toContain('(id:move:fate/pay-the-price)');
    expect(faceDanger?.text).not.toContain('starforged/moves/fate/pay_the_price');
  });

  it('maps every roll_type value present in the data without throwing', () => {
    const rollTypes = new Set(allMoves.map((m) => m.rollType));
    expect(rollTypes).toEqual(new Set(['action', 'none', 'progress', 'special_track']));
  });

  it('maps a legacy_track roll option (Continue a Legacy)', () => {
    const continueLegacy = allMoves.find((m) => m.id === 'move:legacy/continue-a-legacy');
    expect(continueLegacy?.trigger.conditions[0]?.rollOptions).toEqual([
      { using: 'legacy_track', track: 'quests' },
      { using: 'legacy_track', track: 'bonds' },
      { using: 'legacy_track', track: 'discoveries' },
    ]);
  });

  it('maps an asset_control roll option (Withstand Damage) with resolved asset wildcards', () => {
    const withstandDamage = allMoves.find((m) => m.id === 'move:suffer/withstand-damage');
    const option = withstandDamage?.trigger.conditions[0]?.rollOptions[0];
    expect(option).toEqual({
      using: 'asset_control',
      assets: ['asset:command-vehicle/*', 'asset:support-vehicle/*', 'asset:incidental-vehicle/*'],
      control: 'integrity',
    });
  });
});
