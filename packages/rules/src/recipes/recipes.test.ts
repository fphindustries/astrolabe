import { describe, expect, it } from 'vitest';

import { createSeededRandomSource } from '../dice/rng.js';
import { STARFORGED } from '../generated/index.js';

import type { RandomSource } from '../schema/dice.js';

import {
  CAMPAIGN_LAUNCH_RECIPE_MATERIALIZATIONS,
  CHARACTER_RECIPE,
  LAUNCH_RECIPE_KINDS,
  NPC_RECIPE,
  PLANET_CLASS_RECIPE,
  PLANET_CLASSES,
  SECTOR_NAME_RECIPE,
  STAR_RECIPE,
  buildStartingSettlementRecipe,
  planetClassFromRow,
  settlementLocationFromRow,
  ORACLE_RECIPES,
  materializeLaunchRecipe,
  rerollResult,
  rollRecipe,
} from './index.js';

/** Lands each d100 on the scripted face, in order. */
function faces(...scripted: number[]): RandomSource & { remaining(): number } {
  const queue = [...scripted];
  return {
    next: () => ((queue.shift() ?? 50) - 0.5) / 100,
    remaining: () => queue.length,
  };
}

const tableOf = (id: string) => STARFORGED.oracles.find((table) => table.id === id);

describe('oracle recipes (D-65, D-139)', () => {
  it('declares exactly the npc and derelict recipes Milestone 1 exercises', () => {
    expect([...ORACLE_RECIPES.keys()]).toEqual(['recipe:npc', 'recipe:derelict']);
  });

  it('names only oracle tables the ruleset has, with unique slots', () => {
    for (const recipe of ORACLE_RECIPES.values()) {
      for (const { oracle } of recipe.rolls) {
        expect(tableOf(oracle), `${recipe.id} → ${oracle}`).toBeDefined();
      }
      const slots = recipe.rolls.map((roll) => roll.slot);
      expect(new Set(slots).size).toBe(slots.length);
    }
  });

  it('gives an npc name rolls and derelicts none (a derelict amends no entity)', () => {
    expect(
      ORACLE_RECIPES.get('recipe:npc')!
        .rolls.filter((r) => r.name === true)
        .map((r) => r.slot),
    ).toEqual(['given_name', 'family_name']);
    expect(ORACLE_RECIPES.get('recipe:derelict')!.rolls.some((r) => r.name === true)).toBe(false);
  });

  it('rolls every slot in order, reproducibly from a seed', () => {
    const recipe = ORACLE_RECIPES.get('recipe:npc')!;
    const first = rollRecipe(createSeededRandomSource(8), recipe, tableOf);
    const second = rollRecipe(createSeededRandomSource(8), recipe, tableOf);

    expect(first.map((r) => r.slot.slot)).toEqual(recipe.rolls.map((r) => r.slot));
    expect(first).toEqual(second);
    for (const rolled of first) {
      expect(rolled.results.length).toBeGreaterThan(0);
    }
  });

  it('gives a plain row as the one result of its slot', () => {
    const [role] = rollRecipe(faces(1, 1, 1, 1, 1, 1), NPC_RECIPE, tableOf);
    expect(role!.results).toEqual([
      { oracleId: 'oracle:characters/role', roll: 1, rowText: expect.any(String) },
    ]);
  });

  it('resolves "Roll twice" into exactly two results, rerolling a nested one once (D-68)', () => {
    // role: 96 "Roll twice" → 1, then 97 "Roll twice" again → rerolled to 2.
    const rng = faces(96, 1, 97, 2);
    const [role] = rollRecipe(rng, { ...NPC_RECIPE, rolls: NPC_RECIPE.rolls.slice(0, 1) }, tableOf);
    expect(role!.results.map((r) => r.roll)).toEqual([1, 2]);
    expect(role!.results.every((r) => r.rowText !== 'Roll twice')).toBe(true);
    expect(rng.remaining()).toBe(0);
  });

  it('resolves a row embedding tables by rolling each of them', () => {
    // goal: 85 "[Action] + [Theme]" → core/action 3, core/theme 4.
    const rng = faces(85, 3, 4);
    const [goal] = rollRecipe(rng, { ...NPC_RECIPE, rolls: NPC_RECIPE.rolls.slice(1, 2) }, tableOf);
    expect(goal!.results.map((r) => [r.oracleId, r.roll])).toEqual([
      ['oracle:core/action', 3],
      ['oracle:core/theme', 4],
    ]);
    expect(goal!.results.every((r) => !r.rowText.includes('['))).toBe(true);
  });

  it('refuses a recipe naming a table that is not loaded', () => {
    expect(() =>
      rollRecipe(createSeededRandomSource(1), ORACLE_RECIPES.get('recipe:npc')!, () => undefined),
    ).toThrow(/not loaded/);
  });

  it('rerolls one result on its own table, resolving a "Roll twice" or embedded row like a recipe roll', () => {
    expect(rerollResult(faces(7), 'oracle:characters/role', tableOf, NPC_RECIPE)).toEqual([
      { oracleId: 'oracle:characters/role', roll: 7, rowText: expect.any(String) },
    ]);
    // goal: 95 "Roll twice" is rerolled once → 85 embeds Action + Theme → 3, 4.
    const rng = faces(95, 85, 3, 4);
    expect(
      rerollResult(rng, 'oracle:characters/goal', tableOf, NPC_RECIPE).map((r) => r.oracleId),
    ).toEqual(['oracle:core/action', 'oracle:core/theme']);
    expect(rng.remaining()).toBe(0);
  });
});

describe('the launch character recipe (6.0h, D-186)', () => {
  it('declares the five rolls a character proposal is grounded in', () => {
    // D-166 has the server roll a *declared* recipe before the Guide
    // interprets it. Task 1.3's enumeration omitted a character, so these five
    // lived as a list in the AI context — server-owned and sound, but outside
    // `rules` and outside the completeness test above.
    expect(CHARACTER_RECIPE.rolls.map((slot) => slot.slot)).toEqual([
      'given-name',
      'family-name',
      'callsign',
      'backstory-1',
      'backstory-2',
    ]);
  });

  it('gives the two backstory prompts a slot each, over the same table', () => {
    // The trap D-186 names. One slot rolled twice returns two results under a
    // single name, which would collapse the two keys into one and break both
    // the proposal schema's citation enum and its grounding check.
    const backstory = CHARACTER_RECIPE.rolls.filter((slot) => slot.slot.startsWith('backstory-'));

    expect(backstory).toHaveLength(2);
    expect(new Set(backstory.map((slot) => slot.oracle)).size).toBe(1);
    expect(new Set(CHARACTER_RECIPE.rolls.map((slot) => slot.slot)).size).toBe(
      CHARACTER_RECIPE.rolls.length,
    );
  });

  it('is a declared materialization, reachable by its selector', () => {
    expect(CAMPAIGN_LAUNCH_RECIPE_MATERIALIZATIONS).toContain(CHARACTER_RECIPE);
    expect(materializeLaunchRecipe({ kind: 'character' })).toBe(CHARACTER_RECIPE);
  });

  it('rolls every slot, so each key the proposal cites has a result', () => {
    const rolled = rollRecipe(createSeededRandomSource(7), CHARACTER_RECIPE, (oracle) =>
      STARFORGED.oracles.find((candidate) => candidate.id === oracle),
    );

    expect(rolled.map((entry) => entry.slot.slot)).toEqual([
      'given-name',
      'family-name',
      'callsign',
      'backstory-1',
      'backstory-2',
    ]);
    for (const entry of rolled) expect(entry.results.length).toBeGreaterThan(0);
  });
});

describe('the sector recipes (8.0c, D-173)', () => {
  it('declares each as a materialization reachable by its selector', () => {
    expect(materializeLaunchRecipe({ kind: 'sector_name' })).toBe(SECTOR_NAME_RECIPE);
    expect(materializeLaunchRecipe({ kind: 'planet_class' })).toBe(PLANET_CLASS_RECIPE);
    expect(materializeLaunchRecipe({ kind: 'star' })).toBe(STAR_RECIPE);
    for (const recipe of [SECTOR_NAME_RECIPE, PLANET_CLASS_RECIPE, STAR_RECIPE])
      expect(CAMPAIGN_LAUNCH_RECIPE_MATERIALIZATIONS).toContain(recipe);
    const ids = CAMPAIGN_LAUNCH_RECIPE_MATERIALIZATIONS.map((recipe) => recipe.id);
    for (const count of [1, 2] as const) {
      const recipe = materializeLaunchRecipe({
        kind: 'starting_settlement',
        firstLookCount: count,
      });
      expect(ids).toContain(recipe.id);
    }
    expect(new Set(ids).size).toBe(ids.length);
    expect(LAUNCH_RECIPE_KINDS).toEqual(
      expect.arrayContaining(['sector_name', 'starting_settlement', 'planet_class', 'star']),
    );
  });

  it('zooms into the starting settlement with first looks and its trouble (beat 9)', () => {
    expect(buildStartingSettlementRecipe(2).rolls).toEqual([
      { slot: 'first_look_1', oracle: 'oracle:settlements/first-look' },
      { slot: 'first_look_2', oracle: 'oracle:settlements/first-look' },
      { slot: 'trouble', oracle: 'oracle:settlements/trouble' },
    ]);
    expect(buildStartingSettlementRecipe(1).rolls).toHaveLength(2);
  });

  it('reads every row of the imported settlement-location table', () => {
    const table = tableOf('oracle:settlements/location')!;
    const read = table.rows.map((row) => settlementLocationFromRow(row.text));
    expect(read).toEqual(['planetside', 'orbital', 'deep_space']);
    expect(settlementLocationFromRow('Somewhere else')).toBeUndefined();
  });

  it('reads the class from every row of the imported class table, by its linked id', () => {
    const table = tableOf('oracle:planets/class')!;
    const read = table.rows.map((row) => planetClassFromRow(row.text));
    expect(read).not.toContain(undefined);
    // Every class Chapter 2 covers is reachable by a roll.
    expect([...new Set(read)].sort()).toEqual([...PLANET_CLASSES].sort());
    // A row whose markup was already stripped still reads.
    expect(planetClassFromRow('Desert World')).toBe('desert');
    expect(planetClassFromRow('Swamp World')).toBeUndefined();
  });

  it('rolls the sector name and the star from the imported tables', () => {
    const lookup = (oracle: string) => STARFORGED.oracles.find((c) => c.id === oracle);
    const name = rollRecipe(createSeededRandomSource(3), SECTOR_NAME_RECIPE, lookup);
    expect(name.map((entry) => entry.slot.slot)).toEqual(['prefix', 'suffix']);
    const star = rollRecipe(createSeededRandomSource(3), STAR_RECIPE, lookup);
    expect(star[0]!.results.length).toBeGreaterThan(0);
  });
});
