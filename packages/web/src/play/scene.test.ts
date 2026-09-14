import { describe, expect, it } from 'vitest';

import type { EntityId, EntityState } from '@astrolabe/shared';

import { toSceneHeaderView } from './scene.js';

function entity(overrides: Partial<EntityState> = {}): EntityState {
  return {
    id: 'ent-1' as EntityId,
    kind: 'location',
    name: 'The derelict relay station',
    fields: {},
    provenance: { establishedBy: 'player', groundedIn: [], eventId: 'evt-1' as never },
    ...overrides,
  };
}

describe('toSceneHeaderView', () => {
  it('shows a placeholder before any scene has started', () => {
    expect(toSceneHeaderView(null, {})).toEqual({ title: 'No scene yet' });
  });

  it('shows the title alone when the scene has no location', () => {
    const view = toSceneHeaderView({ id: 'scene-1' as never, title: 'The relay station' }, {});
    expect(view).toEqual({ title: 'The relay station' });
  });

  it('resolves the location name from projected entities', () => {
    const locationId = 'ent-1' as EntityId;
    const entities: Readonly<Record<EntityId, EntityState>> = { [locationId]: entity() };
    const view = toSceneHeaderView(
      { id: 'scene-1' as never, title: 'The relay station', locationId },
      entities,
    );
    expect(view).toEqual({
      title: 'The relay station',
      locationName: 'The derelict relay station',
    });
  });

  it('omits locationName when the referenced entity is not (yet) projected', () => {
    const view = toSceneHeaderView(
      { id: 'scene-1' as never, title: 'The relay station', locationId: 'ent-missing' as EntityId },
      {},
    );
    expect(view).toEqual({ title: 'The relay station' });
  });

  it('offers to frame an open scene with no frame, and only that (D-141)', () => {
    const scene = { id: 'scene-1' as never, title: 'The relay station' };
    const open = {
      id: 's2' as never,
      number: 2,
      startedAt: '2026-01-01T00:00:00.000Z' as never,
      tokenUsage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    };
    expect(toSceneHeaderView(scene, {}, open).canFrame).toBe(true);
    expect(
      toSceneHeaderView({ ...scene, framedBy: 'evt-1' as never }, {}, open).canFrame,
    ).toBeUndefined();
    expect(
      toSceneHeaderView(scene, {}, { ...open, endedAt: '2026-01-02T00:00:00.000Z' as never })
        .canFrame,
    ).toBeUndefined();
    expect(toSceneHeaderView(scene, {}, null).canFrame).toBeUndefined();
  });
});
