import { describe, expect, it } from 'vitest';

import { STARFORGED } from '@astrolabe/rules';
import { NON_CANONICAL_LAUNCH_EVENT_TYPES } from '@astrolabe/shared';

import { renderSetup } from '../ai/context/incident.js';
import { renderState } from '../ai/context/render-state.js';

import { LogBuilder } from './fixtures.js';
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
      targetId: TROUBLE,
      proposal: 'An unaccepted Guide proposal.',
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
    const rendered = renderState(state);

    expect(rendered).not.toContain('A draft nobody accepted');
    expect(rendered).not.toContain('An unaccepted Guide proposal');
  });

  it('projects the draft for resumption even though context never sees it', () => {
    // A23 needs the draft back; D-161 needs it out of narration. Both.
    expect(state.launch.drafts.foundation?.premise).toBe('A draft nobody accepted.');
  });
});
