import { describe, expect, it } from 'vitest';

import { STARFORGED } from '@astrolabe/rules';
import { NON_CANONICAL_LAUNCH_EVENT_TYPES } from '@astrolabe/shared';
import { testEventId } from '@astrolabe/shared/test-fixtures';

import { renderSetup } from '../ai/context/incident.js';
import { renderState } from '../ai/context/render-state.js';

import { LogBuilder, VESNA, character } from './fixtures.js';
import { applyEvent, project } from './project.js';
import { emptyState } from './state.js';

/**
 * Task 2.8 for the launch catalogue: what the fold does with a revision, a
 * cold rebuild, and the events that are deliberately not canon.
 *
 * Void is deliberately absent — D-177 makes launch facts non-voidable, and
 * `cascade.test.ts` owns that refusal. What replaces it here is the mechanism
 * that does the same job: a revision supersedes, and the log keeps both.
 */

const acceptance = { provenance: 'player_written', groundedIn: [] } as const;

const STAR = 'aaaa3333-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const SECTOR = 'aaaa2222-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const SETTLEMENT = 'aaaa4444-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const OUTPOST = 'aaaa7777-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const TROUBLE = 'aaaa5555-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const ACCEPTED_TRUTH = STARFORGED.truths[0]!.id;

/** A launch log with a revision, a removal, and both non-canonical types. */
function launchLog(): LogBuilder {
  return new LogBuilder()
    .add('campaign.created', {
      name: 'Lantern Wake',
      settings: { narrationLatitude: 'color', narrationLength: 'standard', rerollCap: 2 },
    })
    .add('launch.draft_saved', {
      section: 'foundation',
      snapshot: { premise: 'A draft nobody accepted.' },
    })
    .add('creation.proposed', {
      targetKind: 'trouble',
      targetId: 'trouble:sector',
      proposal: {
        kind: 'sector',
        text: { value: 'An unaccepted Guide proposal.', reason: 'Because.', groundedIn: [] },
      },
      rationale: 'Because.',
      groundedIn: [],
    })
    .add('sector.configured', {
      sectorId: SECTOR as never,
      name: 'Lantern Reach',
      region: 'expanse',
      baseline: { settlements: 2, passages: 1 },
      starId: STAR as never,
      ...acceptance,
    })
    .add('location.added', {
      kind: 'settlement',
      id: SETTLEMENT as never,
      name: 'Ember Hold',
      location: 'deep_space',
      population: 'Hundreds',
      authority: 'Corporate',
      projects: ['Rebuilding the relay'],
      ...acceptance,
    })
    .add('truth.decided', {
      truthId: ACCEPTED_TRUTH as never,
      resolution: 'custom',
      text: 'An accepted truth the Guide may use.',
      ...acceptance,
    });
}

describe('the launch fold', () => {
  it('lets a revision supersede the earlier accepted value (D-161)', () => {
    const builder = launchLog().add('trouble.established', {
      troubleId: TROUBLE as never,
      kind: 'sector',
      text: 'The relay grid is failing.',
      ...acceptance,
    });
    const established = builder.last();
    builder.add('trouble.revised', {
      troubleId: TROUBLE as never,
      kind: 'sector',
      text: 'The relay grid is being jammed, not failing.',
      ...acceptance,
      supersedesEventId: established.id,
    });

    const trouble = project(builder.build()).launch.troubles[TROUBLE as never];

    expect(trouble?.text).toBe('The relay grid is being jammed, not failing.');
    // The superseded value is still in the log, reachable from the revision.
    expect(trouble?.supersedesEventId).toBe(established.id);
    expect(builder.build().filter((e) => e.type.startsWith('trouble.'))).toHaveLength(2);
  });

  it('removes a location rather than leaving a tombstone behind', () => {
    const builder = launchLog().add('location.added', {
      kind: 'settlement',
      id: OUTPOST as never,
      name: 'Far Watch',
      location: 'deep_space',
      population: 'A few',
      authority: 'None',
      projects: ['Listening'],
      ...acceptance,
    });
    const added = builder.last();
    builder.add('location.removed', {
      locationId: OUTPOST as never,
      supersedesEventId: added.id,
      reason: 'Duplicate.',
    });

    const locations = project(builder.build()).launch.locations;

    expect(Object.keys(locations)).toEqual([SETTLEMENT]);
  });

  it('drops a route by the event that added it, without inflating the count', () => {
    const builder = launchLog().add('route.added', {
      from: SETTLEMENT as never,
      to: { kind: 'off_map', label: 'The Drift' },
      ...acceptance,
    });
    const added = builder.last();

    expect(project(builder.build()).launch.routes).toHaveLength(1);

    builder.add('route.removed', { supersedesEventId: added.id, reason: 'Duplicate.' });

    expect(project(builder.build()).launch.routes).toEqual([]);
  });

  it('rebuilds cold to exactly what incremental projection produced', () => {
    const events = launchLog().build();

    const cold = project(events);
    const incremental = events.reduce((state, event) => applyEvent(state, event), emptyState());

    expect(cold).toEqual(incremental);
  });

  it('is unchanged by replaying the same log twice', () => {
    const events = launchLog().build();

    expect(project([...events])).toEqual(project(events));
  });
});

describe('non-canonical launch events stay out of AI context (D-161)', () => {
  const builder = launchLog();
  const state = project(builder.build());

  it('names both non-canonical types, so the list cannot silently shrink', () => {
    expect([...NON_CANONICAL_LAUNCH_EVENT_TYPES]).toEqual([
      'launch.draft_saved',
      'creation.proposed',
    ]);
  });

  it('renders the accepted truth, so the exclusions below mean something', () => {
    // Without this, a `renderSetup` that produced nothing at all would pass
    // every assertion in this block.
    expect(renderSetup(state)).toContain('An accepted truth the Guide may use.');
  });

  it('keeps an unaccepted draft out of the setup context', () => {
    expect(renderSetup(state)).not.toContain('A draft nobody accepted');
  });

  it('keeps an unaccepted proposal out of the setup context', () => {
    expect(renderSetup(state)).not.toContain('An unaccepted Guide proposal');
  });

  it('keeps both out of the play-screen state context', () => {
    // `renderState` reads no launch state at all today — it is bounded to
    // projected play structure by design (D-156). So this is a regression
    // guard against it starting to, not a filter being exercised: there is
    // no positive control to pair it with, and that is the point.
    const rendered = renderState(state);

    expect(rendered).not.toContain('A draft nobody accepted');
    expect(rendered).not.toContain('An unaccepted Guide proposal');
  });

  it('projects the draft for resumption even though context never sees it', () => {
    // A23 needs the draft back; D-161 needs it out of narration. Both.
    expect(state.launch.drafts.foundation?.snapshot.premise).toBe('A draft nobody accepted.');
  });
});

describe('one truth representation (D-183)', () => {
  const started = () =>
    new LogBuilder().add('campaign.created', {
      name: 'Lantern Wake',
      settings: { narrationLatitude: 'color', narrationLength: 'standard', rerollCap: 2 },
    });

  it('folds a Milestone 1 `truth.set` into the launch decisions', () => {
    // No command writes this type any more, but every Milestone 1 campaign has
    // them. Reading them into a second place is what made `renderState` blind
    // to a launched campaign's truths.
    const state = project(
      started()
        .add('truth.set', {
          oracleId: ACCEPTED_TRUTH,
          source: 'written',
          text: 'A slow collapse, not one cataclysm.',
        })
        .build(),
    );

    expect(state.launch.truthDecisions[ACCEPTED_TRUTH]).toMatchObject({
      truthId: ACCEPTED_TRUTH,
      resolution: 'custom',
      text: 'A slow collapse, not one cataclysm.',
      provenance: 'player_written',
    });
  });

  it('maps each legacy source onto the resolution and provenance it meant', () => {
    const decide = (source: 'picked' | 'rolled' | 'written') =>
      project(started().add('truth.set', { oracleId: ACCEPTED_TRUTH, source, text: 'x' }).build())
        .launch.truthDecisions[ACCEPTED_TRUTH];

    expect(decide('picked')).toMatchObject({
      resolution: 'selected',
      provenance: 'official_choice',
    });
    expect(decide('rolled')).toMatchObject({ resolution: 'rolled', provenance: 'oracle_roll' });
    expect(decide('written')).toMatchObject({ resolution: 'custom', provenance: 'player_written' });
  });
});

describe('a revised truth keeps its earlier answer readable (A26)', () => {
  const decided = (text: string) =>
    [
      'truth.decided',
      { truthId: ACCEPTED_TRUTH, resolution: 'custom', text, ...acceptance },
    ] as const;

  function log(...texts: readonly string[]) {
    let builder = new LogBuilder().add('campaign.created', {
      name: 'Lantern Wake',
      settings: { narrationLatitude: 'color', narrationLength: 'standard', rerollCap: 2 },
    });
    for (const text of texts) {
      const [type, payload] = decided(text);
      builder = builder.add(type, payload);
    }
    return builder;
  }

  it('records nothing until there is something superseded', () => {
    const state = project(log('First.').build());

    expect(state.launch.truthDecisions[ACCEPTED_TRUTH]?.text).toBe('First.');
    expect(state.launch.truthHistory[ACCEPTED_TRUTH]).toBeUndefined();
  });

  it('keeps every earlier answer, oldest first, under the current one', () => {
    const state = project(log('First.', 'Second.', 'Third.').build());

    expect(state.launch.truthDecisions[ACCEPTED_TRUTH]?.text).toBe('Third.');
    expect(state.launch.truthHistory[ACCEPTED_TRUTH]?.map((entry) => entry.text)).toEqual([
      'First.',
      'Second.',
    ]);
  });

  it('rebuilds the same history cold as incrementally', () => {
    // The chain is folded forward, so a cold rebuild and a replay must agree —
    // the property 2.8 asks of every launch fact.
    const events = log('First.', 'Second.').build();

    expect(project([...events])).toEqual(project(events));
  });
});

describe('a draft and its accepted fact are ordered against each other (D-182)', () => {
  const SETTINGS = {
    narrationLatitude: 'color',
    narrationLength: 'standard',
    rerollCap: 2,
  } as const;
  const started = () =>
    new LogBuilder().add('campaign.created', { name: 'Lantern Wake', settings: SETTINGS });
  /** The premise saved as a draft, then accepted with different words. */
  const draftThenAccept = () =>
    started()
      .add('launch.draft_saved', { section: 'foundation', snapshot: { premise: 'B' } })
      .add('campaign.foundation_set', { premise: 'C', settings: SETTINGS, ...acceptance });
  const acceptThenDraft = () =>
    started()
      .add('campaign.foundation_set', { premise: 'C', settings: SETTINGS, ...acceptance })
      .add('launch.draft_saved', { section: 'foundation', snapshot: { premise: 'B' } });

  it('orders an accepted fact after the draft it replaced', () => {
    // The sequence that made this necessary: save a draft, edit the words
    // again, accept *those*, reload. Without ordering the form shows the stale
    // draft while the dashboard reports the section complete from the accepted
    // one — the form and its own status contradicting each other.
    const state = project(draftThenAccept().build());

    expect(state.launch.foundation!.seq).toBeGreaterThan(state.launch.drafts.foundation!.seq);
  });

  it('orders a draft saved after acceptance ahead of it, so A23 still holds', () => {
    // The mirror case, and the reason the rule is not just "accepted wins":
    // work saved after a fact was accepted is still work, and must come back.
    const state = project(acceptThenDraft().build());

    expect(state.launch.drafts.foundation!.seq).toBeGreaterThan(state.launch.foundation!.seq);
  });
});

describe('a crew member carries its acceptance back (6.0a, D-184)', () => {
  const crewLog = () =>
    new LogBuilder().add('campaign.created', {
      name: 'Lantern Wake',
      settings: { narrationLatitude: 'color', narrationLength: 'standard', rerollCap: 2 },
    });

  const launchCharacter = (name: string) => ({
    ...character(VESNA, name, 2),
    appearance: 'Sharp-eyed, jacket a size too big.',
    backstory: { kind: 'written' as const, text: 'Flew charts nobody else trusted.' },
    backgroundVow: { title: 'Find the lost survey', rank: 'formidable' as const },
  });

  it('projects the event that accepted it, so a revision can supersede it', () => {
    // 6.0d fills `supersedesEventId` from here rather than trusting the
    // client, which is why this sequences first.
    const builder = crewLog().add('character.created', launchCharacter('Vesna Kade'));
    const created = builder.last();

    const vesna = project(builder.build()).characters[VESNA];

    expect(vesna?.eventId).toBe(created.id);
    expect(vesna?.seq).toBe(created.seq);
  });

  it('projects the provenance and grounding an accepted crew member carries (A41)', () => {
    const roll = crewLog().add('oracle.rolled', {
      oracleId: 'oracle:characters/name/given' as never,
      roll: 42,
      rowText: 'Vesna',
    });
    const rolled = roll.last();
    roll.add('character.created', {
      ...launchCharacter('Vesna Kade'),
      provenance: 'guide_proposal_edited',
      groundedIn: [rolled.id],
    });

    const vesna = project(roll.build()).characters[VESNA];

    expect(vesna?.provenance).toBe('guide_proposal_edited');
    expect(vesna?.groundedIn).toEqual([rolled.id]);
  });

  it('leaves both absent on a Milestone 1 character, which recorded neither', () => {
    const vesna = project(
      crewLog()
        .add('character.created', character(VESNA, 'Vesna Kade', 2))
        .build(),
    ).characters[VESNA];

    // `hasOwn`, not `toBeUndefined`: the key must be *absent*, because
    // `toEqual` — which the cold-rebuild comparison below uses — treats an
    // absent key and one explicitly set to `undefined` as equal, and
    // `exactOptionalPropertyTypes` treats them as different things.
    expect(Object.hasOwn(vesna!, 'provenance')).toBe(false);
    expect(Object.hasOwn(vesna!, 'groundedIn')).toBe(false);
    // The log facts are knowable for every character, legacy or not.
    expect(vesna?.eventId).toBeDefined();
    expect(vesna?.seq).toBeDefined();
  });

  it('moves the acceptance to the revision that superseded it', () => {
    const builder = crewLog().add('character.created', launchCharacter('Vesna Kade'));
    const created = builder.last();
    builder.add('character.revised', {
      characterId: VESNA,
      character: { ...launchCharacter('Vesna Kade'), appearance: 'A quieter jacket.' },
      provenance: 'player_written',
      groundedIn: [],
      supersedesEventId: created.id,
    });
    const revision = builder.last();

    const vesna = project(builder.build()).characters[VESNA];

    expect(vesna?.appearance).toBe('A quieter jacket.');
    expect(vesna?.eventId).toBe(revision.id);
    expect(vesna?.seq).toBe(revision.seq);
    expect(vesna?.provenance).toBe('player_written');
  });
});

describe('the crew revision chain is readable (6.0c, D-184)', () => {
  const crewLog = () =>
    new LogBuilder().add('campaign.created', {
      name: 'Lantern Wake',
      settings: { narrationLatitude: 'color', narrationLength: 'standard', rerollCap: 2 },
    });

  const launchCharacter = (appearance: string) => ({
    ...character(VESNA, 'Vesna Kade', 2),
    appearance,
    backstory: { kind: 'written' as const, text: 'Flew charts nobody else trusted.' },
    backgroundVow: { title: 'Find the lost survey', rank: 'formidable' as const },
  });

  const revision = (appearance: string, supersedesEventId: string) => ({
    characterId: VESNA,
    character: launchCharacter(appearance),
    provenance: 'player_written' as const,
    groundedIn: [],
    supersedesEventId: supersedesEventId as never,
  });

  it('writes no history for a revision of a character that does not exist', () => {
    // `updateCharacter` already returns the state untouched in this case, so
    // without the same guard on the history push the fold would remember a
    // version of a character it does not have.
    const builder = crewLog().add('character.revised', revision('From nowhere.', testEventId(1)));

    const state = project(builder.build());

    expect(state.characters[VESNA]).toBeUndefined();
    expect(state.launch.crewHistory[VESNA]).toBeUndefined();
  });

  it('keeps no history for a character nobody has revised', () => {
    const builder = crewLog().add('character.created', {
      ...launchCharacter('A jacket a size too big.'),
      provenance: 'guide_proposal',
      groundedIn: [],
    });

    expect(project(builder.build()).launch.crewHistory[VESNA]).toBeUndefined();
  });

  it('pushes the superseded version, with the acceptance it carried (A26, A41)', () => {
    const builder = crewLog().add('character.created', {
      ...launchCharacter('A jacket a size too big.'),
      provenance: 'guide_proposal',
      groundedIn: [],
    });
    const created = builder.last();
    builder.add('character.revised', revision('A quieter jacket.', created.id));

    const state = project(builder.build());

    // The current version is the revision.
    expect(state.characters[VESNA]?.appearance).toBe('A quieter jacket.');
    // The superseded one is still readable, with its own acceptance — not the
    // revision's. This is the whole point: `supersedesEventId` was being
    // written and nothing could read the chain back.
    const history = state.launch.crewHistory[VESNA];
    expect(history).toHaveLength(1);
    expect(history?.[0]?.appearance).toBe('A jacket a size too big.');
    expect(history?.[0]?.eventId).toBe(created.id);
    expect(history?.[0]?.provenance).toBe('guide_proposal');
  });

  it('keeps every superseded version, oldest first', () => {
    const builder = crewLog().add('character.created', launchCharacter('First.'));
    builder.add('character.revised', revision('Second.', builder.last().id));
    builder.add('character.revised', revision('Third.', builder.last().id));

    const state = project(builder.build());

    expect(state.launch.crewHistory[VESNA]?.map((entry) => entry.appearance)).toEqual([
      'First.',
      'Second.',
    ]);
    expect(state.characters[VESNA]?.appearance).toBe('Third.');
  });

  it('records a Milestone 1 character’s first revision with no provenance', () => {
    // A legacy character recorded none, so its history entry has none either —
    // absent, rather than a provenance invented to fill the field.
    const builder = crewLog().add('character.created', character(VESNA, 'Vesna Kade', 2));
    builder.add('character.revised', revision('Now with an appearance.', builder.last().id));

    const entry = project(builder.build()).launch.crewHistory[VESNA]?.[0];

    expect(entry).toBeDefined();
    expect(Object.hasOwn(entry!, 'provenance')).toBe(false);
  });

  it('rebuilds cold to exactly what incremental projection produced', () => {
    const builder = crewLog().add('character.created', launchCharacter('First.'));
    builder.add('character.revised', revision('Second.', builder.last().id));
    const events = builder.build();

    const cold = project(events);
    const incremental = events.reduce((state, event) => applyEvent(state, event), emptyState());

    expect(cold).toEqual(incremental);
    expect(cold.launch.crewHistory[VESNA]).toHaveLength(1);
  });
});

describe('removing a crew member leaves nothing dangling (6.0d)', () => {
  const VOW = '77777777-7777-4777-8777-777777777777';

  const crewLog = () =>
    new LogBuilder()
      .add('campaign.created', {
        name: 'Lantern Wake',
        settings: { narrationLatitude: 'color', narrationLength: 'standard', rerollCap: 2 },
      })
      .add('character.created', {
        ...character(VESNA, 'Vesna Kade', 2),
        appearance: 'Sharp-eyed.',
        backstory: { kind: 'written' as const, text: 'Flew charts nobody trusted.' },
        backgroundVow: { title: 'Find the lost survey', rank: 'formidable' as const },
        provenance: 'player_written' as const,
        groundedIn: [],
      })
      .add('track.created', {
        kind: 'vow',
        trackId: VOW as never,
        title: 'Find the lost survey',
        rank: 'formidable',
        characterId: VESNA,
      });

  const removal = (builder: LogBuilder) =>
    builder.add('character.removed', {
      characterId: VESNA,
      supersedesEventId: builder.at(2).id,
      reason: 'Replaced by a different concept.',
    });

  it('takes the character’s own vow tracks with them', () => {
    // Nothing else can drop a track: void is bounded to the current session
    // (D-84) and every pre-launch event has none, so leaving it would strand
    // a vow on a crew member who is not there.
    const before = project(crewLog().build());
    expect(before.tracks[VOW as never]).toBeDefined();
    expect(before.characters[VESNA]?.vowTrackIds).toEqual([VOW]);

    const after = project(removal(crewLog()).build());

    expect(after.characters[VESNA]).toBeUndefined();
    expect(after.tracks[VOW as never]).toBeUndefined();
  });

  it('keeps what was removed answerable (A40)', () => {
    const state = project(removal(crewLog()).build());

    const history = state.launch.crewHistory[VESNA];
    expect(history).toHaveLength(1);
    expect(history?.[0]?.name).toBe('Vesna Kade');
    expect(history?.[0]?.backgroundVow?.title).toBe('Find the lost survey');
  });

  it('changes nothing when the character is not there', () => {
    const builder = new LogBuilder()
      .add('campaign.created', {
        name: 'Lantern Wake',
        settings: { narrationLatitude: 'color', narrationLength: 'standard', rerollCap: 2 },
      })
      .add('character.removed', {
        characterId: VESNA,
        supersedesEventId: testEventId(1),
        reason: 'Never existed.',
      });

    expect(project(builder.build()).launch.crewHistory[VESNA]).toBeUndefined();
  });

  it('rebuilds cold to exactly what incremental projection produced', () => {
    const events = removal(crewLog()).build();

    const cold = project(events);
    const incremental = events.reduce((state, event) => applyEvent(state, event), emptyState());

    expect(cold).toEqual(incremental);
  });
});

describe('a revised vow reaches its track (6.0d, D-188)', () => {
  const VOW = '77777777-7777-4777-8777-777777777777';

  const withVow = () =>
    new LogBuilder()
      .add('campaign.created', {
        name: 'Lantern Wake',
        settings: { narrationLatitude: 'color', narrationLength: 'standard', rerollCap: 2 },
      })
      .add('track.created', {
        kind: 'vow',
        trackId: VOW as never,
        title: 'Find the lost survey',
        rank: 'formidable',
        characterId: VESNA,
      });

  it('replaces the words and the rank, and leaves progress alone', () => {
    const builder = withVow().add('track.advanced', {
      trackId: VOW as never,
      ticks: 4,
      cause: { kind: 'ai_judgement', reason: 'A lead panned out.' },
    });
    const before = project(builder.build()).tracks[VOW as never];
    expect(before?.ticks).toBe(4);

    builder.add('track.revised', {
      trackId: VOW as never,
      title: 'Find the lost survey, and whoever buried it',
      rank: 'extreme',
    });

    const after = project(builder.build()).tracks[VOW as never];

    expect(after?.title).toBe('Find the lost survey, and whoever buried it');
    expect(after?.rank).toBe('extreme');
    // Rename, not re-swear.
    expect(after?.ticks).toBe(4);
    expect(after?.kind).toBe('vow');
  });

  it('changes nothing when the track is not there', () => {
    const builder = withVow().add('track.revised', {
      trackId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc' as never,
      title: 'A track nobody created.',
    });

    expect(project(builder.build()).tracks[VOW as never]?.title).toBe('Find the lost survey');
  });
});

describe('a crew draft comes back the way it was saved (6.0e, A23, D-182)', () => {
  const crewLog = () =>
    new LogBuilder().add('campaign.created', {
      name: 'Lantern Wake',
      settings: { narrationLatitude: 'color', narrationLength: 'standard', rerollCap: 2 },
    });

  it('restores a half-built crew member, unaccepted', () => {
    const builder = crewLog().add('launch.draft_saved', {
      section: 'crew',
      snapshot: {
        characters: [
          { draftId: 'draft-vesna', name: 'Vesna Kade', appearance: '' },
          { draftId: 'draft-rook', name: 'Rook' },
        ],
      },
    });

    const state = project(builder.build());

    expect(state.launch.drafts.crew?.snapshot.characters).toEqual([
      { draftId: 'draft-vesna', name: 'Vesna Kade', appearance: '' },
      { draftId: 'draft-rook', name: 'Rook' },
    ]);
    // A draft is durable and not canon (D-161): nothing became a character.
    expect(Object.keys(state.characters)).toEqual([]);
  });

  it('orders the draft against each accepted crew member on its own', () => {
    // D-182 names Crew as the reason a draft is not cleared on acceptance: one
    // snapshot holds the whole crew, so accepting one member must not discard
    // in-progress edits to the others. Precedence is therefore per member —
    // the draft's single `seq` against each character's own — and this is the
    // read that makes it possible.
    const builder = crewLog()
      .add('launch.draft_saved', {
        section: 'crew',
        snapshot: { characters: [{ draftId: 'draft-vesna', name: 'Vesna half-typed' }] },
      })
      .add('character.created', {
        ...character(VESNA, 'Vesna Kade', 2),
        appearance: 'Sharp-eyed.',
        backstory: { kind: 'written' as const, text: 'Flew charts nobody trusted.' },
        backgroundVow: { title: 'Find the lost survey', rank: 'formidable' as const },
      });

    const state = project(builder.build());

    expect(state.launch.drafts.crew!.seq).toBeLessThan(state.characters[VESNA]!.seq);
  });

  it('keeps only the latest snapshot, as every section does', () => {
    const builder = crewLog()
      .add('launch.draft_saved', {
        section: 'crew',
        snapshot: { characters: [{ draftId: 'draft-vesna', name: 'First' }] },
      })
      .add('launch.draft_saved', {
        section: 'crew',
        snapshot: { characters: [{ draftId: 'draft-vesna', name: 'Second' }] },
      });

    const drafts = project(builder.build()).launch.drafts;

    expect(drafts.crew?.snapshot.characters).toHaveLength(1);
    expect(drafts.crew?.snapshot.characters[0]?.name).toBe('Second');
  });
});

describe('the starship revision chain is readable (7.0f, A40)', () => {
  const SHIP = 'aaaa8888-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const ship = (name: string) => ({
    starshipId: SHIP as never,
    name,
    appearance: 'A patched hull.',
    history: 'Won in a wager.',
    quirks: ['Its clocks run slow.'],
    integrity: { value: 5, min: 0, max: 5 },
    assetId: 'asset:command-vehicle/starship' as never,
  });
  const shipLog = () =>
    new LogBuilder()
      .add('campaign.created', {
        name: 'Lantern Wake',
        settings: { narrationLatitude: 'color', narrationLength: 'standard', rerollCap: 2 },
      })
      .add('starship.established', {
        ...ship('First Wake'),
        provenance: 'guide_proposal',
        groundedIn: [],
      });
  const revise = (builder: LogBuilder, name: string) =>
    builder.add('starship.revised', {
      starship: ship(name),
      ...acceptance,
      supersedesEventId: builder.last().id as never,
    });

  it('starts empty, and a ship never revised has no history', () => {
    expect(emptyState().launch.starshipHistory).toEqual([]);
    expect(project(shipLog().build()).launch.starshipHistory).toEqual([]);
  });

  it('keeps every superseded version, oldest first, with its own acceptance', () => {
    const builder = shipLog();
    const established = builder.last();
    revise(builder, 'Second Wake');
    revise(builder, 'Lantern Wake');

    const state = project(builder.build());

    expect(state.launch.starship?.name).toBe('Lantern Wake');
    expect(state.launch.starshipHistory.map((entry) => entry.name)).toEqual([
      'First Wake',
      'Second Wake',
    ]);
    // The superseded version keeps the provenance it was accepted with.
    expect(state.launch.starshipHistory[0]).toMatchObject({
      eventId: established.id,
      provenance: 'guide_proposal',
    });
  });

  it('reads a module list an earlier event stored, and drops it (D-191)', () => {
    const builder = new LogBuilder().add('starship.established', {
      ...ship('First Wake'),
      modules: [{ assetId: 'asset:module/sensor-array' as never, ownerCharacterId: VESNA }],
      ...acceptance,
    });

    expect(project(builder.build()).launch.starship).not.toHaveProperty('modules');
  });

  it('folds the same incrementally as from cold', () => {
    const builder = shipLog();
    revise(builder, 'Second Wake');
    const events = builder.build();

    const incremental = events.reduce(applyEvent, emptyState());

    expect(incremental.launch.starshipHistory).toEqual(project(events).launch.starshipHistory);
  });
});
