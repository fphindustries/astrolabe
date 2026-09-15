import { describe, expect, it } from 'vitest';

import { STARFORGED } from '../index.js';

import { withoutLinks } from './plain.js';

describe('withoutLinks', () => {
  it('keeps each link label and drops its target', () => {
    expect(
      withoutLinks(
        'When you [Face Danger](id:move:adventure/face-danger) or [Clash](id:move:combat/clash), you may…',
      ),
    ).toBe('When you Face Danger or Clash, you may…');
  });

  it('leaves text with no links unchanged', () => {
    expect(withoutLinks('On a __miss__, you fail.')).toBe('On a __miss__, you fail.');
  });

  it('leaves no link markup in any imported asset ability, move outcome or oracle row', () => {
    const texts = [
      ...STARFORGED.assets.flatMap((asset) => asset.abilities.map((ability) => ability.text)),
      ...STARFORGED.moves.flatMap((move) =>
        move.outcomes === null
          ? []
          : Object.values(move.outcomes).flatMap((outcome) =>
              outcome === undefined ? [] : [outcome.text],
            ),
      ),
      ...STARFORGED.oracles.flatMap((oracle) => oracle.rows.map((row) => row.text)),
    ];
    expect(texts.some((text) => text.includes('](id:'))).toBe(true);
    expect(texts.map(withoutLinks).filter((text) => text.includes('](id:'))).toEqual([]);
  });

  it('finds no markup at all in move trigger and condition text, so a verbatim quote of it reads as written (D-135)', () => {
    const triggers = STARFORGED.moves.flatMap((move) => [
      move.trigger.text,
      ...move.trigger.conditions.flatMap((condition) =>
        condition.text === undefined ? [] : [condition.text],
      ),
    ]);
    expect(triggers.length).toBeGreaterThan(STARFORGED.moves.length);
    expect(triggers.filter((text) => /\]\(|__|\*\*/.test(text))).toEqual([]);
  });
});
