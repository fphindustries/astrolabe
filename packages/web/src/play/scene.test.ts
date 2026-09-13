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
});
