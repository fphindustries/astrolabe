import { describe, expect, it } from 'vitest';

import { STARFORGED, type AssetId, type CharacterId } from '@astrolabe/rules';

import { emptyCampaignState } from './state-fixture.js';
import {
  CREW_SLOTS,
  addHook,
  addPrompt,
  canAddCrew,
  crewOverview,
  crewSummary,
  applyProposal,
  chosenAssets,
  editedFields,
  proposalGrounding,
  proposalReason,
  proposedFields,
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
  type CrewProposal,
} from './crew-form.js';

/** The launch-field half of a complete member, for reuse in the proposal tests. */
function completeFields() {
  const member = complete();
  return {
    name: member.name,
    callsign: member.callsign,
    appearance: member.appearance,
    backstoryText: member.backstoryText,
    vowTitle: member.vowTitle,
    vowRank: member.vowRank,
    slotSelections: member.slotSelections,
  };
}

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

describe('the Guide’s proposal (6.3, D-185)', () => {
  const proposal = (overrides: Record<string, unknown> = {}) =>
    ({
      concept: 'A pilot who trusts charts more than institutions.',
      name: { value: 'Vesna Kade', reason: 'Both name rolls.', groundedIn: ['evt-given'] },
      callsign: { value: 'Map', reason: 'Her crew shortened it.', groundedIn: ['evt-callsign'] },
      appearance: { value: 'Weathered flight jacket.', reason: 'A working pilot.' },
      backstory: {
        value: { kind: 'written', text: 'Flew charts nobody else trusted.' },
        reason: 'From both prompts.',
        groundedIn: ['evt-backstory-1', 'evt-backstory-2'],
      },
      stats: {
        value: { edge: 3, heart: 2, iron: 2, shadow: 1, wits: 1 },
        reason: 'A pilot lives on edge.',
      },
      assets: [
        { assetId: paths[0], reason: 'She flies.' },
        { assetId: paths[1], reason: 'She navigates.' },
        { assetId: companion, reason: 'Someone rides along.' },
      ],
      backgroundVow: {
        title: 'Find the lost survey',
        rank: 'formidable',
        reason: 'The heart of the concept.',
      },
      hooks: [
        {
          text: 'She still hears the channel.',
          reason: 'The first prompt.',
          groundedIn: ['evt-backstory-1'],
        },
      ],
      ...overrides,
    }) as never as CrewProposal;

  it('offers pronouns and gear only when the Guide gave them', () => {
    // D-131: an absent field stays the player's, untouched and unmarked,
    // rather than being overwritten with a blank.
    expect(proposedFields(proposal())).not.toContain('pronouns');
    expect(proposedFields(proposal())).not.toContain('gear');
    expect(
      proposedFields(proposal({ pronouns: { value: 'she/her', reason: 'The concept says so.' } })),
    ).toContain('pronouns');
  });

  it('applies the whole proposal, which is beat 3', () => {
    const member = applyProposal(emptyCrewMember('d'), proposal(), proposedFields(proposal()));

    expect(member.name).toBe('Vesna Kade');
    expect(member.appearance).toBe('Weathered flight jacket.');
    expect(member.backstoryText).toBe('Flew charts nobody else trusted.');
    expect(chosenAssets(member)).toEqual([paths[0], paths[1], companion]);
    expect(isCrewMemberComplete(member)).toBe(true);
  });

  it('applies only the fields asked for, which is beat 5', () => {
    // "Juno starts manually, and asks the Guide for help only with hooks and a
    // background vow." Everything the player wrote stays theirs.
    const written = {
      ...emptyCrewMember('d'),
      name: 'Juno Marr',
      appearance: 'Grease to the elbow.',
    };

    const member = applyProposal(written, proposal(), ['hooks', 'vow']);

    expect(member.name).toBe('Juno Marr');
    expect(member.appearance).toBe('Grease to the elbow.');
    expect(member.vowTitle).toBe('Find the lost survey');
    expect(member.hooks).toEqual(['She still hears the channel.']);
  });

  it('keeps the player’s written backstory when the Guide discovers it in play', () => {
    const written = { ...emptyCrewMember('d'), backstoryText: 'Words the player typed.' };

    const member = applyProposal(
      written,
      proposal({
        backstory: {
          value: { kind: 'discover_in_play' },
          reason: 'The concept says so.',
          groundedIn: [],
        },
      }),
      ['backstory'],
    );

    expect(member.backstoryMode).toBe('discover_in_play');
    expect(member.backstoryText).toBe('Words the player typed.');
  });

  it('records the rolls behind the proposal, whichever fields were taken', () => {
    const member = applyProposal(
      emptyCrewMember('d'),
      proposal(),
      ['hooks'],
      [{ eventId: 'evt-backstory-1' as never, text: 'A debt unpaid.' }],
    );

    expect(toAcceptRequest({ ...member, ...completeFields() })?.groundedIn).toEqual([
      'evt-backstory-1',
    ]);
  });

  it('marks the fields the player changed, and keeps the rest the Guide’s (beat 3, A41)', () => {
    const applied = proposedFields(proposal());
    const kept = applyProposal(emptyCrewMember('d'), proposal(), applied);

    expect(editedFields(kept, proposal(), applied)).toEqual([]);

    // Beat 3 exactly: he changes the final asset and keeps everything else.
    const edited = selectSlot(kept, CREW_SLOTS[2]!.id, paths[2] as AssetId);

    expect(editedFields(edited, proposal(), applied)).toEqual(['assets']);
  });

  it('stops calling a field edited once it is put back', () => {
    // The mark is about the character, not about the player's history: a field
    // edited back to the Guide's value is the Guide's value again.
    const applied = proposedFields(proposal());
    const kept = applyProposal(emptyCrewMember('d'), proposal(), applied);
    const away = { ...kept, name: 'Someone else' };

    expect(editedFields(away, proposal(), applied)).toEqual(['name']);
    expect(editedFields({ ...away, name: 'Vesna Kade' }, proposal(), applied)).toEqual([]);
  });

  it('carries each field’s own reason and grounding for the review to show', () => {
    expect(proposalReason(proposal(), 'vow')).toBe('The heart of the concept.');
    expect(proposalGrounding(proposal(), 'backstory')).toEqual([
      'evt-backstory-1',
      'evt-backstory-2',
    ]);
    // Appearance is read off the concept, so it cites nothing rather than
    // citing an empty roll.
    expect(proposalGrounding(proposal(), 'appearance')).toEqual([]);
  });
});

describe('the crew overview (6.4, A27)', () => {
  const readiness = (blockers: { path: string; message: string }[] = []) =>
    ({
      ready: false,
      problems: blockers,
      sections: {
        foundation: { status: 'complete', blockers: [] },
        truths: { status: 'complete', blockers: [] },
        crew: { status: blockers.length === 0 ? 'complete' : 'in_progress', blockers },
        starship: { status: 'not_started', blockers: [] },
        sector: { status: 'not_started', blockers: [] },
        connection_troubles: { status: 'not_started', blockers: [] },
        incident_launch: { status: 'not_started', blockers: [] },
      },
    }) as never;

  const acceptedMember = { ...complete(), characterId: VESNA };

  it('takes the server’s word about an accepted character (D-176)', () => {
    // The client runs the same validator, but only the server's answer counts
    // for something it has actually accepted — the two disagreeing is what
    // D-176 exists to prevent.
    const rows = crewOverview(
      [acceptedMember],
      readiness([
        {
          path: `characters.${VESNA}.appearance`,
          message: 'A launch character needs an appearance.',
        },
      ]),
    );

    expect(rows[0]).toMatchObject({ statusText: 'Needs attention', statusFrom: 'server' });
    expect(rows[0]?.problems).toEqual(['A launch character needs an appearance.']);
    expect(rows[0]?.complete).toBe(false);
  });

  it('checks an unaccepted member here, because the server knows nothing about it', () => {
    const rows = crewOverview([emptyCrewMember('d')], readiness());

    expect(rows[0]).toMatchObject({ statusText: 'In progress', statusFrom: 'draft' });
    expect(rows[0]?.problems.length).toBeGreaterThan(0);
  });

  it('says when unaccepted work is ready to accept, without calling it complete', () => {
    // "Complete" is a claim about the campaign, and a member nobody has
    // accepted is not part of it yet.
    const rows = crewOverview([complete()], readiness());

    expect(rows[0]).toMatchObject({ statusText: 'Ready to accept', complete: false });
  });

  it('ignores another character’s blockers', () => {
    const rows = crewOverview(
      [acceptedMember],
      readiness([{ path: 'characters.someone-else.name', message: 'Not about Vesna.' }]),
    );

    expect(rows[0]?.problems).toEqual([]);
    expect(rows[0]?.statusText).toBe('Complete');
  });

  it('carries the earlier versions of a revised character (A26, 6.0c)', () => {
    const rows = crewOverview([acceptedMember], readiness(), {
      [VESNA]: [{ name: 'An earlier name', callsign: 'Map', provenance: 'guide_proposal' }],
    });

    expect(rows[0]?.history).toHaveLength(1);
    expect(rows[0]?.history[0]?.name).toBe('An earlier name');
  });

  it('states the minimum in this campaign’s own numbers (beat 5)', () => {
    const three = crewOverview([acceptedMember, acceptedMember, acceptedMember], readiness());

    expect(crewSummary(three)).toContain('One complete character is the launch minimum');
    expect(crewSummary(three)).toContain('3 is this campaign’s choice'.replace('’', "'"));
    expect(crewSummary(three)).toContain('room for 3 more');
  });

  it('stops offering another at six, and says so rather than going quiet', () => {
    const full = crewOverview(
      Array.from({ length: 6 }, () => acceptedMember),
      readiness(),
    );

    expect(canAddCrew(full)).toBe(false);
    expect(crewSummary(full)).toContain('full at 6');
    expect(canAddCrew(crewOverview([acceptedMember], readiness()))).toBe(true);
  });
});
