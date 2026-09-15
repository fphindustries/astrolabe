import { describe, expect, it } from 'vitest';

import { STARFORGED } from '@astrolabe/rules';

import { relevantMoveItems } from './relevant-moves.js';

describe('relevantMoveItems', () => {
  it('includes an always-relevant-category move, sorted by name', () => {
    const items = relevantMoveItems(STARFORGED.moves);
    expect(items.length).toBeGreaterThan(0);
    const names = items.map((i) => i.name);
    expect([...names].sort((a, b) => a.localeCompare(b))).toEqual(names);
  });

  it('excludes a move from a category that needs situation flags (D-66)', () => {
    const combatMove = STARFORGED.moves.find((m) => m.category === 'combat');
    expect(combatMove).toBeDefined();
    const items = relevantMoveItems(STARFORGED.moves);
    expect(items.some((i) => i.id === combatMove?.id)).toBe(false);
  });

  it('includes Face Danger (adventure category)', () => {
    const items = relevantMoveItems(STARFORGED.moves);
    expect(items.some((i) => i.id === 'move:adventure/face-danger')).toBe(true);
  });
});
