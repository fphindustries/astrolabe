import { describe, expect, it } from 'vitest';

import { STARFORGED } from '../generated/index.js';

import { CHARACTER_CREATION, assetCreationTraceProblems } from './creation-rules.js';

/**
 * D-89's asset rules, and the check that keeps them honest.
 *
 * Three of the four rules are stated in Datasworn's own collection
 * descriptions, so they carry a verbatim clause and are checked against the
 * real imported text — the same guarantee section 1 gives move automation.
 * The fourth, the slot count, is from Rulebook pp. 104–110, which are
 * outside the CC-BY subset: it carries a citation and is deliberately not
 * quoted.
 */
describe('traceability', () => {
  it('every clause is verbatim in the category description it cites', () => {
    // The mechanism working, not a convention nobody enforces: a rule that
    // drifts from its source fails here rather than quietly misstating the
    // game.
    expect(assetCreationTraceProblems(STARFORGED.assetCategories)).toEqual([]);
  });

  it('fails loudly when a clause drifts from its source', () => {
    const problems = assetCreationTraceProblems(STARFORGED.assetCategories, {
      ...CHARACTER_CREATION,
      forbidden: [
        {
          category: 'deed',
          clause: { category: 'deed', text: 'deeds are absolutely fine at creation' },
        },
      ],
    });
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain('is not in the deed description');
  });

  it('requires a slot to carry either a clause or a citation', () => {
    const problems = assetCreationTraceProblems(STARFORGED.assetCategories, {
      ...CHARACTER_CREATION,
      slots: [{ id: 'final', label: 'Untraced', allows: ['path'] }],
    });
    expect(problems[0]).toContain('neither a clause nor a citation');
  });
});

describe('the creation slots (D-89)', () => {
  it('is three slots: two paths and one final asset', () => {
    expect(CHARACTER_CREATION.slots).toHaveLength(3);
    const pathOnly = CHARACTER_CREATION.slots.filter(
      (s) => s.allows.length === 1 && s.allows[0] === 'path',
    );
    expect(pathOnly).toHaveLength(2);
  });

  it('lets the final slot be a module, support vehicle, companion or another path', () => {
    const final = CHARACTER_CREATION.slots.find((s) => s.id === 'final');
    expect([...(final?.allows ?? [])].sort()).toEqual([
      'companion',
      'module',
      'path',
      'support_vehicle',
    ]);
  });

  it('cites the rulebook for the slot count, and does not quote it', () => {
    // pp. 104-110 are outside the CC-BY subset.
    const final = CHARACTER_CREATION.slots.find((s) => s.id === 'final');
    expect(final?.citation).toContain('pp. 104');
    expect(final?.clause).toBeUndefined();
  });

  it('never lets a slot accept a command vehicle: the starship is the crew’s, not chosen', () => {
    for (const slot of CHARACTER_CREATION.slots) {
      expect(slot.allows).not.toContain('command_vehicle');
    }
  });

  it('forbids deeds', () => {
    expect(CHARACTER_CREATION.forbidden.map((f) => f.category)).toEqual(['deed']);
  });

  it('covers every imported category as crew-owned, forbidden or slot-eligible', () => {
    // A future Datasworn category should surface here rather than silently
    // being unselectable. The command vehicle is the crew's shared ship
    // (D-164); since 7.3 no character is granted one (D-193).
    const accounted = new Set([
      'command_vehicle',
      ...CHARACTER_CREATION.forbidden.map((f) => f.category),
      ...CHARACTER_CREATION.slots.flatMap((s) => s.allows),
    ]);
    for (const category of STARFORGED.assetCategories) {
      expect(accounted, `category ${category.id}`).toContain(category.id);
    }
  });
});

describe('what the adapter now imports', () => {
  it('imports all six categories with their descriptions and pages', () => {
    expect(STARFORGED.assetCategories).toHaveLength(6);
    for (const category of STARFORGED.assetCategories) {
      expect(category.description.length).toBeGreaterThan(0);
      expect(category.source.page).toBeGreaterThan(0);
    }
  });

  it('carries the starship attachment rule as data, not prose', () => {
    // Modules attach to the starship. Nothing at creation needs to check
    // it — the starship is granted — but Milestone 2's module management
    // reads the rule rather than re-deriving it.
    const starship = STARFORGED.assets.find((a) => a.categoryId === 'command_vehicle');
    expect(starship?.attachments?.categories).toEqual(['module']);
    expect(starship?.attachments?.max).toBeUndefined();
  });

  it('marks the crew-usable assets as shared', () => {
    const shared = STARFORGED.assets.filter((a) => a.shared);
    const categories = new Set(shared.map((a) => a.categoryId));
    expect([...categories].sort()).toEqual(['command_vehicle', 'module', 'support_vehicle']);
  });

  it('keeps requirements as prose, and only on deeds and paths', () => {
    // The two mean different things: a deed requirement gates acquisition,
    // a path requirement gates *use*. Neither is a structured condition, so
    // neither is parsed.
    const withRequirement = STARFORGED.assets.filter((a) => a.requirement !== undefined);
    const categories = new Set(withRequirement.map((a) => a.categoryId));
    expect([...categories].sort()).toEqual(['deed', 'path']);
  });

  it('does not let a path requirement block selection', () => {
    // "If you wield a bladed weapon..." is a condition on using the asset,
    // not on choosing it, so it must never appear as a creation problem.
    const gatedPath = STARFORGED.assets.find(
      (a) => a.categoryId === 'path' && a.requirement !== undefined,
    );
    expect(gatedPath?.requirement).toMatch(/^If you/);
  });
});
