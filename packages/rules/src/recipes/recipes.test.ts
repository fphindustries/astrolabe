import { describe, expect, it } from 'vitest';

import { createSeededRandomSource } from '../dice/rng.js';
import { STARFORGED } from '../generated/index.js';

import type { RandomSource } from '../schema/dice.js';

import { NPC_RECIPE, ORACLE_RECIPES, rerollResult, rollRecipe } from './index.js';

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
