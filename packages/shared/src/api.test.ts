import { describe, expect, it } from 'vitest';

import { LAUNCH_RECIPE_KINDS } from '@astrolabe/rules';

import { LaunchRecipeSelectorSchema } from './api.js';

/**
 * The wire shapes that restate something `rules` already declares.
 *
 * A selector names a recipe by its parameters rather than by an oracle id, so
 * a caller cannot reach a table the rules did not declare (D-65, D-166, D-173).
 * That only holds while both lists say the same thing, and they are maintained
 * by hand in two packages: `character` was declared in the rules and left out
 * here, so 6.0h's recipe was declared and unreachable over HTTP — the same
 * written-and-unreadable shape group 6 keeps finding.
 */
describe('the launch recipe selector', () => {
  it('offers every kind the rules declare, and no others', () => {
    const kinds = LaunchRecipeSelectorSchema.options.map(
      (option) => option.shape.kind.value as string,
    );

    expect([...kinds].sort()).toEqual([...LAUNCH_RECIPE_KINDS].sort());
  });

  it('accepts a character selector, which takes no parameters', () => {
    expect(LaunchRecipeSelectorSchema.safeParse({ kind: 'character' }).success).toBe(true);
  });

  it('still refuses a kind the rules do not declare', () => {
    expect(LaunchRecipeSelectorSchema.safeParse({ kind: 'faction' }).success).toBe(false);
  });
});
