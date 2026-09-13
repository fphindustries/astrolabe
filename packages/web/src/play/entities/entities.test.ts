import { describe, expect, it } from 'vitest';

import type { EntityId, EntityState } from '@astrolabe/shared';

import { entityCards } from './entities.js';

function entity(overrides: Partial<EntityState> = {}): EntityState {
  return {
    id: 'ent-1' as EntityId,
    kind: 'npc',
    name: 'Sura Vance',
    fields: { role: 'life-support technician' },
    provenance: { establishedBy: 'ai', groundedIn: [], eventId: 'evt-1' as never },
    ...overrides,
  };
}

describe('entityCards', () => {
  it('includes NPCs and locations, badged by who established them', () => {
    const npcId = 'ent-npc' as EntityId;
    const locationId = 'ent-location' as EntityId;
    const cards = entityCards({
      [npcId]: entity({ id: npcId, kind: 'npc', name: 'Sura Vance' }),
      [locationId]: entity({
        id: locationId,
        kind: 'location',
        name: 'The derelict relay station',
        provenance: { establishedBy: 'player', groundedIn: [], eventId: 'evt-2' as never },
      }),
    });

    expect(cards).toEqual([
      { id: npcId, kind: 'npc', name: 'Sura Vance', establishedBy: 'ai' },
      { id: locationId, kind: 'location', name: 'The derelict relay station', establishedBy: 'player' },
    ]);
  });

  it('excludes factions and ships', () => {
    const cards = entityCards({
      ['ent-faction' as EntityId]: entity({
        id: 'ent-faction' as EntityId,
        kind: 'faction',
        name: 'The Rime Callers',
      }),
      ['ent-ship' as EntityId]: entity({ id: 'ent-ship' as EntityId, kind: 'ship', name: 'Lantern Wake' }),
    });

    expect(cards).toEqual([]);
  });
});
