import { describe, expect, it } from 'vitest';
import type { OracleTable } from '@astrolabe/rules';
import type { CampaignState, EntityId } from '@astrolabe/shared';

import { sectorLocations, sectorRouteViews, unansweredTruths } from './campaign-setup.js';

function truth(id: string): OracleTable {
  return {
    id: id as never,
    name: id,
    dice: '1d100',
    kind: 'text',
    rows: [],
    suggests: [],
  } as never;
}

function emptyState(): CampaignState {
  return {
    campaign: null,
    session: null,
    scene: null,
    characters: {},
    tracks: {},
    entities: {},
    canon: { sessionSummaries: [] },
    truths: {},
    sector: { routes: [] },
    launch: {
      phase: 'draft',
      drafts: {},
      truthDecisions: {},
      locations: {},
      routes: [],
      layout: {},
      troubles: {},
      amendments: [],
    },
    tokenUsage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
  };
}

describe('unansweredTruths', () => {
  it('excludes a truth already answered', () => {
    const truths = [truth('oracle:a'), truth('oracle:b')];
    const answered = { 'oracle:a': { text: 'x', source: 'written' as const } } as never;
    expect(unansweredTruths(truths, answered).map((t) => t.id)).toEqual(['oracle:b']);
  });

  it('returns every truth when none are answered', () => {
    const truths = [truth('oracle:a')];
    expect(unansweredTruths(truths, {})).toEqual(truths);
  });
});

describe('sectorLocations', () => {
  it('lists only entities of kind location', () => {
    const state = {
      ...emptyState(),
      entities: {
        loc1: {
          id: 'loc1' as EntityId,
          kind: 'location',
          name: 'Station',
          fields: {},
          provenance: { establishedBy: 'player', groundedIn: [], eventId: 'e1' as never },
        },
        npc1: {
          id: 'npc1' as EntityId,
          kind: 'npc',
          name: 'Sura',
          fields: {},
          provenance: { establishedBy: 'ai', groundedIn: [], eventId: 'e2' as never },
        },
      },
    } as never;
    expect(sectorLocations(state).map((l) => l.name)).toEqual(['Station']);
  });
});

describe('sectorRouteViews', () => {
  it('resolves location ids to names', () => {
    const state = {
      ...emptyState(),
      entities: {
        a: {
          id: 'a' as EntityId,
          kind: 'location',
          name: 'Station',
          fields: {},
          provenance: { establishedBy: 'player', groundedIn: [], eventId: 'e1' as never },
        },
        b: {
          id: 'b' as EntityId,
          kind: 'location',
          name: 'Outpost',
          fields: {},
          provenance: { establishedBy: 'player', groundedIn: [], eventId: 'e2' as never },
        },
      },
      sector: { routes: [{ from: 'a' as EntityId, to: 'b' as EntityId }] },
    } as never;
    expect(sectorRouteViews(state)).toEqual([{ from: 'Station', to: 'Outpost' }]);
  });
});
