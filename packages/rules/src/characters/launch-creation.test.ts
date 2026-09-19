import { describe, expect, it } from 'vitest';
import { STARFORGED } from '../generated/index.js';
import {
  duplicateModuleHolders,
  installedModules,
  sharedStarshipBaseline,
  STARSHIP_ASSET_ID,
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
  // D-190, D-191: modules come from the crew, each owned by its holder.
  it('installs each module a crew member holds, owned by that member', () => {
    const second = STARFORGED.assets.filter((asset) => asset.categoryId === 'module')[1]!.id;
    expect(
      installedModules(
        [
          { id: 'vesna', assets: [...paths.slice(0, 2), moduleId] },
          { id: 'rook', assets: paths },
          { id: 'juno', assets: [...paths.slice(0, 2), second] },
        ],
        STARFORGED,
      ),
    ).toEqual([
      { assetId: moduleId, ownerCharacterId: 'vesna' },
      { assetId: second, ownerCharacterId: 'juno' },
    ]);
  });
  it('installs a module held twice once, from the earlier holder, and names the later', () => {
    const crew = [
      { id: 'vesna', assets: [...paths.slice(0, 2), moduleId] },
      { id: 'juno', assets: [...paths.slice(0, 2), moduleId] },
    ];
    expect(installedModules(crew, STARFORGED)).toEqual([
      { assetId: moduleId, ownerCharacterId: 'vesna' },
    ]);
    expect(duplicateModuleHolders(crew, STARFORGED)).toEqual([
      { characterId: 'juno', assetId: moduleId, installedBy: 'vesna' },
    ]);
  });
});

describe('sharedStarshipBaseline', () => {
  it('is the imported Starship asset at integrity 5, and passes its own validator', () => {
    const baseline = sharedStarshipBaseline(STARFORGED);
    expect(baseline.assetId).toBe('asset:command-vehicle/starship');
    // D-193's constant is the imported asset, not a second spelling of it.
    expect(STARSHIP_ASSET_ID).toBe(baseline.assetId);
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
        },
        STARFORGED,
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
      },
      STARFORGED,
    ).map((problem) => problem.code);
    expect(codes).toEqual(['integrity_invalid']);
  });
});
