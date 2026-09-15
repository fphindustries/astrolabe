import { describe, expect, it } from 'vitest';

import type { EntityId, EntityState, SceneId, SessionId } from '@astrolabe/shared';

import { toSessionView } from './session.js';

const relay: EntityState = {
  id: 'ent-relay' as EntityId,
  kind: 'location',
  name: 'Varga Relay',
  fields: {},
  provenance: { establishedBy: 'player', groundedIn: [], eventId: 'evt-1' as never },
};
const npc: EntityState = { ...relay, id: 'ent-npc' as EntityId, kind: 'npc', name: 'Sura' };
const tokenUsage = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };
const session = {
  id: 'ses-1' as SessionId,
  number: 1,
  startedAt: '2026-09-14T00:00:00Z' as never,
  tokenUsage,
};

describe('toSessionView (D-146)', () => {
  it("offers a first session the campaign's locations to place its scene", () => {
    expect(
      toSessionView({ session: null, scene: null, entities: { [relay.id]: relay, [npc.id]: npc } }),
    ).toEqual({ kind: 'first', locations: [{ id: relay.id, name: 'Varga Relay' }] });
  });

  it('plays while a session is open', () => {
    expect(toSessionView({ session, scene: null, entities: {} })).toEqual({ kind: 'open' });
  });

  it('carries the last scene forward into the next session', () => {
    expect(
      toSessionView({
        session: { ...session, endedAt: '2026-09-14T03:00:00Z' as never },
        scene: {
          id: 'scn-1' as SceneId,
          title: 'The derelict relay station',
          locationId: relay.id,
        },
        entities: { [relay.id]: relay },
      }),
    ).toEqual({
      kind: 'next',
      number: 2,
      sceneTitle: 'The derelict relay station',
      locationName: 'Varga Relay',
    });
  });
});
