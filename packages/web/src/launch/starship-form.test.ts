import { describe, expect, it } from 'vitest';

import type { AssetId } from '@astrolabe/rules';
import { STARSHIP_PROPOSAL_TARGET, type EntityId, type EventId } from '@astrolabe/shared';

import { emptyCampaignState } from './state-fixture.js';
import {
  EMPTY_STARSHIP_FORM,
  FIELD_ORACLES,
  applyRoll,
  detailProblems,
  dropProposal,
  editedFields,
  groundingOf,
  heldStarshipProposal,
  initialStarshipForm,
  isDirty,
  proposedFields,
  proposedGrounding,
  quirkCountOf,
  setQuirk,
  setQuirkCount,
  setText,
  takeProposal,
  toDraftSnapshot,
  toSaveRequest,
  type HeldStarshipProposal,
  type StarshipForm,
} from './starship-form.js';

/** 7.1: every Starship-step transition, tested where it lives. */

const id = (n: number) => `0190f000-0000-7000-8000-00000000000${n}` as EventId;

const complete: StarshipForm = {
  ...EMPTY_STARSHIP_FORM,
  name: 'Lantern Wake',
  appearance: 'A patched hull.',
  history: 'Won in a wager.',
  quirks: ['Its clocks run slow.'],
};

const held: HeldStarshipProposal = {
  eventId: id(9),
  rationale: 'The rolls, together.',
  proposal: {
    name: { value: 'Lantern Wake', reason: 'The name roll.', groundedIn: [id(1)] },
    appearance: { value: 'A patched hull.', reason: 'Its history.' },
    history: { value: 'Won in a wager.', reason: 'The history roll.', groundedIn: [id(2)] },
    quirks: [
      { value: 'Its clocks run slow.', reason: 'A quirk roll.', groundedIn: [id(3)] },
      { value: 'The hatch sticks.', reason: 'A quirk roll.', groundedIn: [id(4)] },
    ],
  },
};

const ship = {
  starshipId: 'aaaa8888-aaaa-4aaa-8aaa-aaaaaaaaaaaa' as EntityId,
  name: 'Accepted Wake',
  appearance: 'Accepted hull.',
  history: 'Accepted history.',
  quirks: ['Accepted quirk.'],
  integrity: { value: 5, min: 0, max: 5 },
  assetId: 'asset:command-vehicle/starship' as AssetId,
  provenance: 'player_written' as const,
  groundedIn: [id(5)],
  eventId: id(6),
  seq: 10,
};

describe('initialStarshipForm (D-182)', () => {
  it('opens empty with one quirk slot when nothing is saved or accepted', () => {
    expect(initialStarshipForm(emptyCampaignState())).toEqual(EMPTY_STARSHIP_FORM);
  });

  it('prefers the accepted ship when it is newer than the draft, and carries its citations', () => {
    const state = emptyCampaignState({
      starship: ship,
      drafts: { starship: { snapshot: { starship: { name: 'Old draft' } }, seq: 4 } },
    });
    expect(initialStarshipForm(state)).toMatchObject({
      name: 'Accepted Wake',
      quirks: ['Accepted quirk.'],
      carried: [id(5)],
    });
  });

  it('prefers a draft saved after the accepted ship, proposal and all', () => {
    const state = emptyCampaignState({
      starship: ship,
      drafts: {
        starship: {
          snapshot: {
            starship: {
              name: 'Newer draft',
              quirks: ['One', ''],
              proposalEventId: id(9),
              groundedIn: [id(1)],
            },
          },
          seq: 12,
        },
      },
    });
    expect(initialStarshipForm(state)).toMatchObject({
      name: 'Newer draft',
      appearance: '',
      quirks: ['One', ''],
      proposalEventId: id(9),
      carried: [id(1)],
    });
  });
});

describe('quirks', () => {
  it('goes to two quirks and back, dropping the second quirk’s roll with it', () => {
    const two = applyRoll(complete, 'quirk_2', { eventId: id(4), text: 'The hatch sticks.' });
    expect(quirkCountOf(two)).toBe(2);
    expect(two.quirks).toEqual(['Its clocks run slow.', 'The hatch sticks.']);

    const one = setQuirkCount(two, 1);
    expect(one.quirks).toEqual(['Its clocks run slow.']);
    expect(one.fieldRolls).toEqual({});
  });

  it('edits one quirk without touching the other', () => {
    const two = setQuirkCount(complete, 2);
    expect(setQuirk(two, 1, 'Second').quirks).toEqual(['Its clocks run slow.', 'Second']);
  });
});

describe('field rolls (A41)', () => {
  it('roll only the recipe’s own tables', () => {
    expect(Object.keys(FIELD_ORACLES).sort()).toEqual(['history', 'name', 'quirk_1', 'quirk_2']);
    expect(FIELD_ORACLES.quirk_1).toBe(FIELD_ORACLES.quirk_2);
  });

  it('fills the field and keeps the roll as a citation, even after rewording', () => {
    const rolled = applyRoll(complete, 'history', { eventId: id(2), text: 'A rolled history.' });
    expect(rolled.history).toBe('A rolled history.');
    const reworded = setText(rolled, 'history', 'My own words on it.');
    expect(groundingOf(reworded)).toEqual([id(2)]);
  });

  it('cites a field roll once, beside carried citations', () => {
    const form = {
      ...applyRoll(complete, 'name', { eventId: id(1), text: 'X' }),
      carried: [id(1)],
    };
    expect(groundingOf(form)).toEqual([id(1)]);
  });
});

describe('proposals (7.0c, D-166)', () => {
  it('reads the held proposal from the fold, so it survives a reload', () => {
    const state = emptyCampaignState({
      proposals: {
        [STARSHIP_PROPOSAL_TARGET]: {
          targetKind: 'starship',
          targetId: STARSHIP_PROPOSAL_TARGET,
          proposal: held.proposal,
          rationale: held.rationale,
          groundedIn: [],
          eventId: id(9),
        },
      },
    });
    expect(heldStarshipProposal(state)).toEqual(held);
    expect(heldStarshipProposal(emptyCampaignState())).toBeNull();
  });

  it('takes the whole proposal, with its quirk count and its id', () => {
    const taken = takeProposal(EMPTY_STARSHIP_FORM, held);
    expect(taken).toMatchObject({
      name: 'Lantern Wake',
      quirks: ['Its clocks run slow.', 'The hatch sticks.'],
      proposalEventId: id(9),
    });
    expect(editedFields(taken, held.proposal)).toEqual([]);
  });

  it('takes only the fields asked for, and drops the field rolls they replace', () => {
    const mine = applyRoll({ ...EMPTY_STARSHIP_FORM, name: 'Mine' }, 'history', {
      eventId: id(7),
      text: 'Rolled.',
    });
    const taken = takeProposal(mine, held, ['history']);
    expect(taken.name).toBe('Mine');
    expect(taken.history).toBe('Won in a wager.');
    expect(taken.fieldRolls).toEqual({});
    expect(taken.proposalEventId).toBe(id(9));
  });

  it('marks what the player changed, and names each field’s grounding', () => {
    // Beat 6: keep one quirk, edit the appearance.
    const edited = setQuirkCount(
      setText(takeProposal(EMPTY_STARSHIP_FORM, held), 'appearance', 'Scorched.'),
      1,
    );
    expect(editedFields(edited, held.proposal)).toEqual(['appearance', 'quirk_2']);
    expect(proposedFields(held.proposal)).toEqual([
      'name',
      'appearance',
      'history',
      'quirk_1',
      'quirk_2',
    ]);
    expect(proposedGrounding(held.proposal, 'appearance')).toEqual([]);
    expect(proposedGrounding(held.proposal, 'quirk_2')).toEqual([id(4)]);
  });

  it('keeps the words and forgets the proposal when dropped', () => {
    const dropped = dropProposal(takeProposal(EMPTY_STARSHIP_FORM, held));
    expect(dropped.proposalEventId).toBeUndefined();
    expect(dropped.name).toBe('Lantern Wake');
  });
});

describe('what the step sends', () => {
  it('refuses to build a request the rules would refuse', () => {
    expect(toSaveRequest(EMPTY_STARSHIP_FORM, undefined)).toBeNull();
    expect(detailProblems(EMPTY_STARSHIP_FORM).map((problem) => problem.field)).toEqual([
      'name',
      'appearance',
      'history',
      'quirks',
    ]);
  });

  it('sends the trimmed details, the proposal and the citations, and no server-owned field', () => {
    const form = applyRoll(takeProposal(EMPTY_STARSHIP_FORM, held), 'name', {
      eventId: id(8),
      text: '  Rolled Wake  ',
    });
    expect(toSaveRequest(form, id(9))).toEqual({
      starship: {
        name: 'Rolled Wake',
        appearance: 'A patched hull.',
        history: 'Won in a wager.',
        quirks: ['Its clocks run slow.', 'The hatch sticks.'],
      },
      proposalEventId: id(9),
      groundedIn: [id(8)],
    });
  });

  it('stops naming a proposal once the Guide is asked again (10.0a)', () => {
    // The words stay, as the player's own; the proposal they came from is gone.
    const body = toSaveRequest(takeProposal(EMPTY_STARSHIP_FORM, held), id(7));
    expect(body?.proposalEventId).toBeUndefined();
    expect(body?.starship.name).toBe('Lantern Wake');
  });

  it('saves a draft with a blank quirk rather than refusing it (7.0g)', () => {
    const draft = toDraftSnapshot(setQuirkCount(complete, 2));
    expect(draft.starship?.quirks).toEqual(['Its clocks run slow.', '']);
  });

  it('is dirty after an edit and clean again when it matches', () => {
    expect(isDirty(setText(complete, 'name', 'Other'), complete)).toBe(true);
    expect(isDirty(complete, complete)).toBe(false);
  });
});
