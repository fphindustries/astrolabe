import { describe, expect, it } from 'vitest';

import { STARFORGED, validateCharacterDraft, type AssetId, type OracleId } from '@astrolabe/rules';
import type { EventId, ProposalRoll } from '@astrolabe/shared';

import { CREATION_SLOTS, emptyDraft } from './creation-form.js';
import {
  PROPOSED_FIELDS,
  applyProposal,
  guideNotes,
  hooksToSend,
  proposedFields,
  rollChip,
  slotsFromAssets,
  type CharacterProposal,
  type CreationForm,
} from './proposal.js';

const ROLL: ProposalRoll = {
  eventId: 'aaaaaaaa-0000-4000-8000-000000000003' as EventId,
  oracleId: 'oracle:characters/name/callsign' as OracleId,
  label: 'Callsign',
  roll: 34,
  rowText: 'Wraith',
};

const PROPOSAL: CharacterProposal = {
  concept: 'A pilot who answers every call.',
  name: { value: 'Mara Oduya', reason: 'The name rolls.', groundedIn: [] },
  callsign: {
    value: 'Wraith',
    reason: 'The callsign roll, as rolled.',
    groundedIn: [ROLL.eventId],
  },
  stats: { value: { edge: 3, heart: 2, iron: 1, shadow: 1, wits: 2 }, reason: 'A pilot.' },
  assets: [
    { assetId: 'asset:module/sensor-array' as AssetId, reason: 'She listens.' },
    { assetId: 'asset:path/ace' as AssetId, reason: 'She flies.' },
    { assetId: 'asset:path/navigator' as AssetId, reason: 'She navigates.' },
  ],
  backgroundVow: { title: 'Answer every call', rank: 'dangerous', reason: 'The concept.' },
  hooks: [{ text: 'A lost settlement still broadcasts.', reason: 'Prompt.', groundedIn: [] }],
};

const EMPTY: CreationForm = {
  name: '',
  pronouns: '',
  callsign: '',
  stats: emptyDraft().stats,
  slotSelections: {},
  swearVow: false,
  vowTitle: '',
  vowRank: 'troublesome',
  hooks: [],
};

describe('slotsFromAssets (3.3)', () => {
  it('fills the path slots with paths and the final slot with what is left, whatever the order', () => {
    const slots = slotsFromAssets(
      PROPOSAL.assets.map((a) => a.assetId),
      CREATION_SLOTS,
      STARFORGED,
    );
    expect(slots).toEqual({
      path_1: 'asset:path/ace',
      path_2: 'asset:path/navigator',
      final: 'asset:module/sensor-array',
    });
  });

  it('leaves a slot empty rather than forcing an asset that cannot go there', () => {
    const slots = slotsFromAssets(
      ['asset:path/ace', 'asset:module/sensor-array', 'asset:module/shields'] as AssetId[],
      CREATION_SLOTS,
      STARFORGED,
    );
    expect(slots['path_2']).toBeUndefined();
  });
});

describe('applyProposal (3.3, D-124)', () => {
  it('fills every field into a draft the rules accept', () => {
    const form = applyProposal(EMPTY, PROPOSAL, PROPOSED_FIELDS, CREATION_SLOTS, STARFORGED);
    expect(form).toMatchObject({
      name: 'Mara Oduya',
      callsign: 'Wraith',
      swearVow: true,
      vowTitle: 'Answer every call',
      vowRank: 'dangerous',
      hooks: ['A lost settlement still broadcasts.'],
    });
    const assets = Object.values(form.slotSelections) as AssetId[];
    expect(
      validateCharacterDraft(
        { name: form.name, callsign: form.callsign, stats: form.stats, assets },
        STARFORGED,
      ),
    ).toEqual([]);
  });

  it('restores one field without touching the player’s edits to the others', () => {
    const edited = { ...EMPTY, name: 'Isolde', callsign: 'Ghost' };
    const restored = applyProposal(edited, PROPOSAL, ['callsign'], CREATION_SLOTS, STARFORGED);
    expect(restored).toMatchObject({ name: 'Isolde', callsign: 'Wraith' });
  });

  it('leaves pronouns to the player unless the concept stated them (D-131)', () => {
    const typed = { ...EMPTY, pronouns: 'they/them' };
    expect(proposedFields(PROPOSAL)).not.toContain('pronouns');
    expect(
      applyProposal(typed, PROPOSAL, proposedFields(PROPOSAL), CREATION_SLOTS, STARFORGED).pronouns,
    ).toBe('they/them');

    const stated: CharacterProposal = {
      ...PROPOSAL,
      pronouns: { value: 'she/her', reason: 'The concept says so.' },
    };
    expect(proposedFields(stated)).toContain('pronouns');
    expect(
      applyProposal(typed, stated, proposedFields(stated), CREATION_SLOTS, STARFORGED).pronouns,
    ).toBe('she/her');
    expect(guideNotes(stated, [], STARFORGED).pronouns.lines).toEqual(['The concept says so.']);
  });
});

describe('guideNotes and chips', () => {
  it('pairs each field with its reasons and the rolls it cites', () => {
    const notes = guideNotes(PROPOSAL, [ROLL], STARFORGED);
    expect(notes.callsign).toEqual({ lines: ['The callsign roll, as rolled.'], rolls: [ROLL] });
    expect(notes.name.rolls).toEqual([]);
    expect(notes.assets.lines).toContain('Ace: She flies.');
    expect(rollChip(ROLL)).toBe('Callsign 34: Wraith');
  });

  it('sends only hooks with words in them', () => {
    expect(hooksToSend(['  a hook ', '', '   '])).toEqual(['a hook']);
  });
});
