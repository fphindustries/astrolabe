import { describe, expect, it } from 'vitest';

import type { EntityId, EventId } from '@astrolabe/shared';

import { emptyCampaignState } from './state-fixture.js';
import {
  KEY_STEP,
  MAP_HEIGHT,
  MAP_MARGIN,
  MAP_WIDTH,
  clamp,
  defaultPosition,
  exitPoint,
  isLayoutDirty,
  layoutToSave,
  mapNodes,
  passageViews,
  step,
  toMapPoint,
} from './sector-map.js';

/** 8.4: the map's geometry, which has no mechanical meaning (A34, D-165). */

const A = 'aaaa1111-aaaa-4aaa-8aaa-aaaaaaaaaaaa' as EntityId;
const B = 'aaaa2222-aaaa-4aaa-8aaa-aaaaaaaaaaaa' as EntityId;
const P = 'aaaa3333-aaaa-4aaa-8aaa-aaaaaaaaaaaa' as EntityId;
const accepted = {
  provenance: 'player_written' as const,
  groundedIn: [],
  eventId: 'e' as EventId,
  seq: 1,
};
const settlement = (id: EntityId, name: string) => ({
  kind: 'settlement' as const,
  id,
  name,
  location: 'deep_space' as const,
  population: 'Few',
  authority: 'None',
  projects: ['Wait'],
  ...accepted,
});
const state = emptyCampaignState({
  locations: {
    [A]: settlement(A, 'Ember Hold'),
    [B]: { kind: 'other', id: B, name: 'Kessel Drift', description: 'Ice', ...accepted },
    [P]: { kind: 'planet', id: P, name: 'Hollow', planetClass: 'ice', details: {}, ...accepted },
  },
  layout: { [A]: { x: 100, y: 120 } },
  routes: [
    { from: A, to: B, ...accepted, eventId: 'r1' as EventId },
    { from: A, to: { kind: 'off_map', label: 'The Drift' }, ...accepted, eventId: 'r2' as EventId },
  ],
  startingSettlementId: A,
});

describe('the sector map (8.4)', () => {
  it('draws settlements and other locations, and never a planet (D-165)', () => {
    const nodes = mapNodes(state);
    expect(nodes.map((node) => node.name).sort()).toEqual(['Ember Hold', 'Kessel Drift']);
    expect(nodes.find((node) => node.id === A)).toMatchObject({ x: 100, y: 120, starting: true });
  });

  it('places an unsaved node by default, the same way every time', () => {
    const [first, second] = [mapNodes(state), mapNodes(state)];
    expect(first.find((node) => node.id === B)).toEqual(second.find((node) => node.id === B));
    expect(defaultPosition(0, 2)).not.toEqual(defaultPosition(1, 2));
  });

  it('prefers a position the player moved over the saved one', () => {
    const nodes = mapNodes(state, { [A]: { x: 300, y: 300 } });
    expect(nodes.find((node) => node.id === A)).toMatchObject({ x: 300, y: 300 });
    expect(isLayoutDirty(state, nodes)).toBe(true);
  });

  it('moves only the node the player moved, never its unsaved neighbours', () => {
    const unsaved = emptyCampaignState({ ...state.launch, layout: {} });
    const before = mapNodes(unsaved).find((node) => node.id === B);
    const after = mapNodes(unsaved, { [A]: { x: 300, y: 300 } }).find((node) => node.id === B);
    expect(after).toEqual(before);
  });

  it('moves a node one step per arrow key, and never off the map', () => {
    expect(step({ x: 500, y: 300 }, 'ArrowRight')).toEqual({ x: 500 + KEY_STEP, y: 300 });
    expect(step({ x: MAP_MARGIN, y: 300 }, 'ArrowLeft')).toEqual({ x: MAP_MARGIN, y: 300 });
    expect(step({ x: 500, y: 300 }, 'Enter')).toBeUndefined();
    expect(clamp({ x: -50, y: 9999 })).toEqual({ x: MAP_MARGIN, y: MAP_HEIGHT - MAP_MARGIN });
  });

  it('draws an off-map exit at the map edge nearest its node', () => {
    expect(exitPoint({ x: 100, y: 300 })).toEqual({ x: 0, y: 300 });
    expect(exitPoint({ x: 900, y: 300 })).toEqual({ x: MAP_WIDTH, y: 300 });
    expect(exitPoint({ x: 500, y: 550 })).toEqual({ x: 500, y: MAP_HEIGHT });
  });

  it('states every passage in words, exits included (A34)', () => {
    expect(passageViews(state).map((passage) => passage.text)).toEqual([
      'Ember Hold to Kessel Drift',
      'Ember Hold to an off-map exit: The Drift',
    ]);
  });

  it('saves the whole layout, not only what moved', () => {
    expect(Object.keys(layoutToSave(mapNodes(state))).sort()).toEqual([A, B].sort());
  });

  it('maps a pointer position into map units', () => {
    const box = { left: 10, top: 20, width: 500, height: 300 };
    expect(toMapPoint({ x: 260, y: 170 }, box)).toEqual({ x: 500, y: 300 });
  });
});
