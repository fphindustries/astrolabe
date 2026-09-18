import { describe, expect, it } from 'vitest';

import { STARFORGED, type AssetId, type CharacterId } from '@astrolabe/rules';

import { emptyCampaignState } from './state-fixture.js';
import {
  CREW_SLOTS,
  addHook,
  addPrompt,
  chosenAssets,
  emptyCrewMember,
  initialCrewForm,
  isCrewMemberComplete,
  isDirty,
  markAccepted,
  problemsByStep,
  removeHook,
  replaceMember,
  selectSlot,
  setBackstoryMode,
  setHook,
  setStat,
  setVow,
  stepAt,
  stepBadgeLabel,
  toAcceptRequest,
  toDraftSnapshot,
  type CrewMemberForm,
} from './crew-form.js';

/**
 * The Crew form's transitions (6.1).
 *
 * Group 5's note is the reason this file exists: two real defects there were
 * ones a browser pass structurally could not reach, because the logic lived in
 * a `.tsx`. Both threw away what the player had typed. Crew has more
 * transitions than Truths did, so each one is three lines of test here.
 */

const paths = STARFORGED.assets
  .filter((asset) => asset.categoryId === 'path')
  .slice(0, 3)
  .map((asset) => asset.id);
const companion = STARFORGED.assets.find((asset) => asset.categoryId === 'companion')!.id;
const VESNA = 'aaaa1111-aaaa-4aaa-8aaa-aaaaaaaaaaaa' as CharacterId;

/** A member the launch rules accept, so a test can take one thing away. */
function complete(): CrewMemberForm {
  let member = emptyCrewMember('draft-vesna');
  member = { ...member, name: 'Vesna Kade', callsign: 'Map', appearance: 'Weathered jacket' };
  member = { ...member, backstoryText: 'Flew charts nobody else trusted.' };
  member = setVow(member, { title: 'Find the lost survey', rank: 'formidable' });
  CREW_SLOTS.forEach((slot, index) => {
    member = selectSlot(member, slot.id, paths[index] as AssetId);
  });
  return member;
}

describe('the transitions', () => {
  it('keeps the stats a legal arrangement by swapping, never overwriting', () => {
    const member = setStat(emptyCrewMember('d'), 'wits', 3);

    expect(member.stats.wits).toBe(3);
    expect(Object.values(member.stats).sort()).toEqual([1, 1, 2, 2, 3]);
  });

  it('keeps a written backstory when the player tries discover-in-play and comes back', () => {
    // The group 5 defect, before it can bite here: a player who writes two
    // paragraphs, tries the other mode and changes their mind should find
    // their own words where they left them.
    const written = { ...emptyCrewMember('d'), backstoryText: 'Flew charts nobody trusted.' };

    const away = setBackstoryMode(written, 'discover_in_play');
    const back = setBackstoryMode(away, 'written');

    expect(away.backstoryText).toBe('Flew charts nobody trusted.');
    expect(back.backstoryText).toBe('Flew charts nobody trusted.');
  });

  it('sends no backstory text while the mode is discover-in-play', () => {
    // Held in the form, and not in what the server is asked to accept: an
    // explicit mystery is a decision, not an empty field (A28).
    const member = setBackstoryMode(complete(), 'discover_in_play');

    expect(toAcceptRequest(member)?.launch.backstory).toEqual({ kind: 'discover_in_play' });
  });

  it('replaces one slot without disturbing the others', () => {
    const member = selectSlot(complete(), CREW_SLOTS[2]!.id, companion);

    expect(chosenAssets(member)).toEqual([paths[0], paths[1], companion]);
  });

  it('clears a slot when nothing is chosen in it', () => {
    const member = selectSlot(complete(), CREW_SLOTS[1]!.id, undefined);

    expect(chosenAssets(member)).toEqual([paths[0], paths[2]]);
  });

  it('edits, adds and removes hooks without touching their neighbours', () => {
    let member = addHook(addHook(emptyCrewMember('d')));
    member = setHook(member, 0, 'She still hears the channel');
    member = setHook(member, 1, 'Owes a debt she will not name');

    expect(removeHook(member, 0).hooks).toEqual(['Owes a debt she will not name']);
    expect(member.hooks).toHaveLength(2);
  });

  it('will not add more hooks than the rules allow', () => {
    const member = [1, 2, 3, 4, 5].reduce(addHook, emptyCrewMember('d'));

    expect(member.hooks).toHaveLength(3);
  });

  it('changes a vow title without losing its rank, and the reverse', () => {
    const vowed = setVow(emptyCrewMember('d'), { title: 'Find it', rank: 'extreme' });

    expect(setVow(vowed, { title: 'Find it, and say why' })).toMatchObject({
      vowTitle: 'Find it, and say why',
      vowRank: 'extreme',
    });
    expect(setVow(vowed, { rank: 'epic' })).toMatchObject({ vowTitle: 'Find it', vowRank: 'epic' });
  });

  it('replaces the member it names and leaves the rest of the crew alone', () => {
    const crew = [emptyCrewMember('a'), emptyCrewMember('b')];
    const edited = { ...crew[1]!, name: 'Rook' };

    expect(replaceMember(crew, edited).map((member) => member.name)).toEqual(['', 'Rook']);
  });

  it('keeps a rolled prompt as inspiration, and cites it on acceptance (6.2, A41)', () => {
    // The prompt is not the backstory — the player writes that — but the roll
    // is what they drew on, so the accepted character cites it and 6.0b turns
    // it into a chip. A member who rolled nothing cites nothing.
    const member = addPrompt(complete(), { eventId: 'evt-roll' as never, text: 'A debt unpaid.' });

    expect(member.prompts).toHaveLength(1);
    expect(member.backstoryText).toBe('Flew charts nobody else trusted.');
    expect(toAcceptRequest(member)?.groundedIn).toEqual(['evt-roll']);
    expect(toAcceptRequest(complete())?.groundedIn).toBeUndefined();
  });

  it('stops calling an accepted character unaccepted', () => {
    // Found in the browser: accepting wrote the character and the roster still
    // said "not accepted", because the id never came back into the form. The
    // label was the visible half — the dangerous half was that a second Accept
    // would have created a duplicate instead of revising.
    const accepted = markAccepted(complete(), VESNA);

    expect(accepted.characterId).toBe(VESNA);
    expect(accepted.name).toBe('Vesna Kade');
  });

  it('counts one problem as a problem', () => {
    expect(stepBadgeLabel(1)).toBe('1 problem on this step');
    expect(stepBadgeLabel(2)).toBe('2 problems on this step');
  });

  it('stops at either end of the step flow rather than running off it', () => {
    expect(stepAt('identity', -1)).toBe('identity');
    expect(stepAt('identity', 1)).toBe('stats');
    expect(stepAt('review', 1)).toBe('review');
  });
});

describe('what the flow shows about a member', () => {
  it('points each problem at the step that can fix it', () => {
    const member = { ...complete(), name: '', appearance: '' };

    const byStep = problemsByStep(member);

    expect(byStep.identity.map((problem) => problem.field)).toContain('name');
    expect(byStep.background.map((problem) => problem.field)).toContain('appearance');
    expect(byStep.stats).toEqual([]);
  });

  it('is complete exactly when the launch rules have nothing to say', () => {
    expect(isCrewMemberComplete(complete())).toBe(true);
    expect(isCrewMemberComplete(emptyCrewMember('d'))).toBe(false);
  });

  it('offers no accept request for a member the rules would refuse', () => {
    // Anticipating the refusal, not discovering it: the server runs the same
    // validator, so sending this would turn a disabled button into a 422.
    expect(toAcceptRequest({ ...complete(), vowTitle: '  ' })).toBeNull();
  });

  it('trims what it sends, and omits what was never recorded', () => {
    const member = { ...complete(), pronouns: '   ', name: '  Vesna Kade  ', signatureGear: ' ' };

    const request = toAcceptRequest(member);

    expect(request?.draft.name).toBe('Vesna Kade');
    // D-131: blank is not recorded, never a default.
    expect(request && 'pronouns' in request).toBe(false);
    expect(request?.launch.signatureGear).toBeUndefined();
  });
});

describe('opening the form on what the server holds', () => {
  const character = (overrides: Record<string, unknown> = {}) => ({
    id: VESNA,
    name: 'Vesna Kade',
    callsign: 'Map',
    stats: { edge: 3, heart: 2, iron: 2, shadow: 1, wits: 1 },
    meters: {},
    momentum: { value: 2, max: 10, resetValue: 2, lastChangedBy: {} },
    impacts: {},
    markedImpacts: 0,
    assets: paths,
    vowTrackIds: [],
    hooks: [],
    pronouns: null,
    appearance: 'Weathered jacket',
    backstory: { kind: 'written', text: 'Flew charts nobody trusted.' },
    backgroundVow: { title: 'Find the lost survey', rank: 'formidable' },
    eventId: 'evt-1',
    seq: 5,
    ...overrides,
  });

  const withCrew = (characters: Record<string, unknown>[], draft?: unknown, seq = 1) =>
    ({
      ...emptyCampaignState(
        draft === undefined ? {} : ({ drafts: { crew: { snapshot: draft, seq } } } as never),
      ),
      characters: Object.fromEntries(characters.map((member) => [member.id as string, member])),
    }) as never;

  it('opens on an accepted character, ready to revise', () => {
    const crew = initialCrewForm(withCrew([character()]));

    expect(crew).toHaveLength(1);
    expect(crew[0]).toMatchObject({
      characterId: VESNA,
      name: 'Vesna Kade',
      vowRank: 'formidable',
    });
    expect(chosenAssets(crew[0]!)).toEqual(paths);
  });

  it('shows a member who exists only in the draft', () => {
    const crew = initialCrewForm(
      withCrew([], { characters: [{ draftId: 'draft-rook', name: 'Rook' }] }),
    );

    expect(crew).toHaveLength(1);
    expect(crew[0]).toMatchObject({ draftId: 'draft-rook', name: 'Rook' });
    // Nothing accepted yet, so nothing to revise.
    expect(crew[0]?.characterId).toBeUndefined();
  });

  it('prefers the accepted character when the draft is older (D-182)', () => {
    const crew = initialCrewForm(
      withCrew(
        [character()],
        { characters: [{ draftId: 'd', characterId: VESNA, name: 'An older name' }] },
        1,
      ),
    );

    expect(crew[0]?.name).toBe('Vesna Kade');
  });

  it('prefers the draft when it was saved after the acceptance (A23)', () => {
    const crew = initialCrewForm(
      withCrew(
        [character()],
        { characters: [{ draftId: 'd', characterId: VESNA, name: 'Edited since' }] },
        9,
      ),
    );

    expect(crew[0]?.name).toBe('Edited since');
    // Field by field: what the draft does not say still comes from the character.
    expect(crew[0]?.appearance).toBe('Weathered jacket');
  });

  it('decides precedence per member, so accepting one does not bury another', () => {
    // The case D-182 names Crew as the reason for. Vesna is accepted after the
    // draft was saved; Rook's unsaved work is in the same snapshot and must
    // survive it.
    const crew = initialCrewForm(
      withCrew(
        [character()],
        {
          characters: [
            { draftId: 'd-vesna', characterId: VESNA, name: 'An older name' },
            { draftId: 'd-rook', name: 'Rook half-typed' },
          ],
        },
        1,
      ),
    );

    expect(crew.map((member) => member.name)).toEqual(['Vesna Kade', 'Rook half-typed']);
  });
});

describe('what the form sends', () => {
  it('round-trips a crew through its own draft snapshot', () => {
    const crew = [complete(), { ...emptyCrewMember('draft-rook'), name: 'Rook' }];

    const snapshot = toDraftSnapshot(crew);

    expect(snapshot.characters.map((member) => member.draftId)).toEqual([
      'draft-vesna',
      'draft-rook',
    ]);
    expect(snapshot.characters[0]?.backgroundVow).toEqual({
      title: 'Find the lost survey',
      rank: 'formidable',
    });
  });

  it('is dirty exactly when what it would save has changed', () => {
    const crew = [complete()];

    expect(isDirty(crew, crew)).toBe(false);
    expect(isDirty([setVow(complete(), { title: 'Something else' })], crew)).toBe(true);
  });
});
