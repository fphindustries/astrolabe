import { describe, expect, it } from 'vitest';

import { STARFORGED } from '../generated/index.js';
import type { MoveId } from '../schema/ids.js';
import type { RelevanceRule, SituationFlag } from '../schema/relevance.js';
import {
  ALWAYS_RELEVANT_CATEGORIES,
  applyRelevanceEffects,
  isMoveRelevant,
  relevantMoves,
} from './relevance.js';
import { MOVE_RELEVANCE_RULES } from './rules.js';

const noFlags: ReadonlySet<SituationFlag> = new Set();

describe('ALWAYS_RELEVANT_CATEGORIES', () => {
  it('is exactly the six categories D-66 verified as broadly applicable', () => {
    expect([...ALWAYS_RELEVANT_CATEGORIES].sort()).toEqual(
      ['adventure', 'fate', 'quest', 'session', 'suffer', 'threshold'].sort(),
    );
  });
});

describe('isMoveRelevant, against the real move set', () => {
  it('finds every move the golden session uses relevant with no flags active', () => {
    const goldenSessionMoveIds: MoveId[] = [
      'move:adventure/face-danger',
      'move:adventure/gather-information',
      'move:adventure/secure-an-advantage',
      'move:adventure/aid-your-ally',
      'move:fate/pay-the-price',
      'move:fate/ask-the-oracle',
      'move:suffer/endure-harm',
      'move:quest/swear-an-iron-vow',
      'move:quest/reach-a-milestone',
      'move:session/begin-a-session',
      'move:session/end-a-session',
    ];
    for (const id of goldenSessionMoveIds) {
      const move = STARFORGED.moves.find((m) => m.id === id);
      expect(move, `${id} missing from STARFORGED`).toBeDefined();
      expect(isMoveRelevant(move!, noFlags, undefined), id).toBe(true);
    }
  });

  it('does not find a combat move relevant with no rule and no flags', () => {
    const strike = STARFORGED.moves.find((m) => m.id === 'move:combat/strike');
    expect(strike).toBeDefined();
    expect(isMoveRelevant(strike!, noFlags, undefined)).toBe(false);
  });

  it('does not find an exploration move relevant by default either', () => {
    const undertakeExpedition = STARFORGED.moves.find(
      (m) => m.id === 'move:exploration/undertake-an-expedition',
    );
    expect(undertakeExpedition).toBeDefined();
    expect(isMoveRelevant(undertakeExpedition!, noFlags, undefined)).toBe(false);
  });

  it('a rule with no required flags falls back to the category default, just like having no rule', () => {
    const strike = STARFORGED.moves.find((m) => m.id === 'move:combat/strike');
    const emptyRule: RelevanceRule = { moveId: strike!.id, requires: [], sets: [], clears: [] };
    expect(isMoveRelevant(strike!, noFlags, emptyRule)).toBe(false);
  });
});

describe('isMoveRelevant, the general mechanism (unused by Milestone 1’s empty rule table)', () => {
  const inFight = 'in_combat' as SituationFlag;

  it('is relevant only once every required flag is active', () => {
    const strike = STARFORGED.moves.find((m) => m.id === 'move:combat/strike')!;
    const rule: RelevanceRule = { moveId: strike.id, requires: [inFight], sets: [], clears: [] };
    expect(isMoveRelevant(strike, noFlags, rule)).toBe(false);
    expect(isMoveRelevant(strike, new Set([inFight]), rule)).toBe(true);
  });

  it('requires every flag in the list, not just one of them', () => {
    const strike = STARFORGED.moves.find((m) => m.id === 'move:combat/strike')!;
    const hasTarget = 'has_target' as SituationFlag;
    const rule: RelevanceRule = {
      moveId: strike.id,
      requires: [inFight, hasTarget],
      sets: [],
      clears: [],
    };
    expect(isMoveRelevant(strike, new Set([inFight]), rule)).toBe(false);
    expect(isMoveRelevant(strike, new Set([inFight, hasTarget]), rule)).toBe(true);
  });
});

describe('applyRelevanceEffects', () => {
  const a = 'flag_a' as SituationFlag;
  const b = 'flag_b' as SituationFlag;

  it('adds every flag the rule sets', () => {
    const rule: RelevanceRule = {
      moveId: 'move:combat/enter-the-fray' as MoveId,
      requires: [],
      sets: [a],
      clears: [],
    };
    expect(applyRelevanceEffects(new Set(), rule)).toEqual(new Set([a]));
  });

  it('removes every flag the rule clears', () => {
    const rule: RelevanceRule = {
      moveId: 'move:combat/end-the-fight' as MoveId,
      requires: [],
      sets: [],
      clears: [a],
    };
    expect(applyRelevanceEffects(new Set([a, b]), rule)).toEqual(new Set([b]));
  });

  it('leaves flags neither set nor cleared untouched', () => {
    const rule: RelevanceRule = { moveId: 'move:x' as MoveId, requires: [], sets: [a], clears: [] };
    expect(applyRelevanceEffects(new Set([b]), rule)).toEqual(new Set([a, b]));
  });

  it('does not mutate the flag set passed in', () => {
    const original = new Set([a]);
    const rule: RelevanceRule = { moveId: 'move:x' as MoveId, requires: [], sets: [b], clears: [] };
    applyRelevanceEffects(original, rule);
    expect(original).toEqual(new Set([a]));
  });
});

describe('relevantMoves, against the real move set', () => {
  it('includes moves from always-relevant categories and excludes situational ones, with no rules active', () => {
    const results = relevantMoves(STARFORGED.moves, noFlags, MOVE_RELEVANCE_RULES);
    const ids = new Set(results.map((m) => m.id));
    expect(ids.has('move:adventure/face-danger')).toBe(true);
    expect(ids.has('move:suffer/endure-harm')).toBe(true);
    expect(ids.has('move:combat/strike')).toBe(false);
    expect(ids.has('move:exploration/undertake-an-expedition')).toBe(false);
  });

  it('matches ALWAYS_RELEVANT_CATEGORIES exactly, move for move', () => {
    const results = relevantMoves(STARFORGED.moves, noFlags, MOVE_RELEVANCE_RULES);
    const expected = STARFORGED.moves.filter((m) => ALWAYS_RELEVANT_CATEGORIES.has(m.category));
    expect(results.map((m) => m.id).sort()).toEqual(expected.map((m) => m.id).sort());
  });
});

describe('MOVE_RELEVANCE_RULES (D-66)', () => {
  it('is empty for Milestone 1 — no move needs situation-gating yet', () => {
    expect(MOVE_RELEVANCE_RULES.size).toBe(0);
  });
});
