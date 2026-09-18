import { describe, expect, it } from 'vitest';
import { STARFORGED } from '../generated/index.js';
import {
  sharedStarshipBaseline,
  validateLaunchCharacterDraft,
  validateSharedStarship,
} from './launch-creation.js';

const paths = STARFORGED.assets
  .filter((asset) => asset.categoryId === 'path')
  .slice(0, 3)
  .map((asset) => asset.id);
const moduleId =
  STARFORGED.assets.find((asset) => asset.categoryId === 'module')?.id ??
  ('asset:module/engine-upgrade' as never);
const validCharacter = {
  name: 'Vesna',
  callsign: 'Map',
  stats: { edge: 3, heart: 2, iron: 2, shadow: 1, wits: 1 },
  assets: paths,
  appearance: 'Weathered flight jacket',
  backstory: { kind: 'discover_in_play' as const },
  backgroundVow: { title: 'Find the lost colony', rank: 'formidable' as const },
};
describe('launch character and shared starship rules', () => {
  it('accepts an explicit unknown backstory and rejects missing appearance', () => {
    expect(validateLaunchCharacterDraft(validCharacter, STARFORGED)).toEqual([]);
    expect(
      validateLaunchCharacterDraft({ ...validCharacter, appearance: '' }, STARFORGED).some(
        (problem) => problem.code === 'appearance_required',
      ),
    ).toBe(true);
  });
  it('owns modules on the shared Starship', () => {
    const starship =
      STARFORGED.assets.find((asset) => asset.categoryId === 'command_vehicle')?.id ??
      ('asset:command-vehicle/starship' as never);
    expect(
      validateSharedStarship(
        {
          name: 'Lantern Wake',
          appearance: 'Old freighter',
          history: 'Won in a wager',
          quirks: ['Slow clocks'],
          integrity: { value: 5, min: 0, max: 5 },
          assetId: starship,
          modules: [{ assetId: moduleId, ownerCharacterId: 'vesna' }],
        },
        STARFORGED,
        ['vesna'],
      ),
    ).toEqual([]);
  });
});

describe('sharedStarshipBaseline', () => {
  it('is the imported Starship asset at integrity 5, and passes its own validator', () => {
    const baseline = sharedStarshipBaseline(STARFORGED);
    expect(baseline.assetId).toBe('asset:command-vehicle/starship');
    expect(baseline.integrity).toEqual({ value: 5, min: 0, max: 5 });
    expect(
      validateSharedStarship(
        {
          name: 'Lantern Wake',
          appearance: 'Worn hull',
          history: 'Salvaged',
          quirks: ['Late clocks'],
          integrity: baseline.integrity,
          assetId: baseline.assetId,
          modules: [],
        },
        STARFORGED,
        [],
      ),
    ).toEqual([]);
  });

  // 7.0b — the number is the imported meter's, and every bound is checked.
  it('reads integrity from the imported condition meter, impacts included', () => {
    const starship = STARFORGED.assets.find((asset) => asset.categoryId === 'command_vehicle');
    expect(starship?.conditionMeters).toEqual([
      {
        key: 'integrity',
        label: 'integrity',
        min: 0,
        max: 5,
        value: 5,
        impacts: [
          { key: 'battered', label: 'battered' },
          { key: 'cursed', label: 'cursed' },
        ],
      },
    ]);
  });

  it.each([
    ['a different starting value', { value: 4, min: 0, max: 5 }],
    ['a raised maximum', { value: 5, min: 0, max: 99 }],
    ['a raised minimum', { value: 5, min: 1, max: 5 }],
  ])('refuses %s', (_label, integrity) => {
    const baseline = sharedStarshipBaseline(STARFORGED);
    const codes = validateSharedStarship(
      {
        name: 'Lantern Wake',
        appearance: 'Worn hull',
        history: 'Salvaged',
        quirks: ['Late clocks'],
        integrity,
        assetId: baseline.assetId,
        modules: [],
      },
      STARFORGED,
      [],
    ).map((problem) => problem.code);
    expect(codes).toEqual(['integrity_invalid']);
  });
});
