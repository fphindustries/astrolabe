import type { CampaignState, EntityId } from '@astrolabe/shared';

/**
 * The sector map's geometry (8.4, D-165, D-197): pure functions, tested where
 * they live, so the SVG in `SectorMap.tsx` only draws.
 *
 * **Nothing here has a mechanical meaning.** A position is presentation state
 * (A34): it changes no distance, travel time or rule. Settlements and other
 * locations are the nodes; planets and the star are details (D-165), and an
 * off-map exit has no position of its own, only the edge nearest its node.
 */

export const MAP_WIDTH = 1000;
export const MAP_HEIGHT = 600;
/** How far a node stays from the edge, so its label is never cut off. */
export const MAP_MARGIN = 60;
/** One arrow-key press, in map units. */
export const KEY_STEP = 20;

export interface Point {
  readonly x: number;
  readonly y: number;
}

export interface MapNode extends Point {
  readonly id: EntityId;
  readonly name: string;
  readonly kind: 'settlement' | 'other';
  readonly starting: boolean;
}

export type Layout = Readonly<Record<string, Point>>;

export function clamp(point: Point): Point {
  return {
    x: Math.min(MAP_WIDTH - MAP_MARGIN, Math.max(MAP_MARGIN, Math.round(point.x))),
    y: Math.min(MAP_HEIGHT - MAP_MARGIN, Math.max(MAP_MARGIN, Math.round(point.y))),
  };
}

/** Move a point by one key press in a direction, staying on the map. */
export function step(point: Point, key: string): Point | undefined {
  const delta: Readonly<Record<string, Point>> = {
    ArrowLeft: { x: -KEY_STEP, y: 0 },
    ArrowRight: { x: KEY_STEP, y: 0 },
    ArrowUp: { x: 0, y: -KEY_STEP },
    ArrowDown: { x: 0, y: KEY_STEP },
  };
  const d = delta[key];
  return d === undefined ? undefined : clamp({ x: point.x + d.x, y: point.y + d.y });
}

/**
 * Where a node with no saved position goes: around an ellipse, by its order
 * among the unplaced nodes, so the same sector always opens the same way and
 * no two new nodes start on top of each other.
 */
export function defaultPosition(index: number, count: number): Point {
  const angle = (2 * Math.PI * index) / Math.max(count, 1) - Math.PI / 2;
  return clamp({
    x: MAP_WIDTH / 2 + (MAP_WIDTH / 2 - MAP_MARGIN * 2) * Math.cos(angle),
    y: MAP_HEIGHT / 2 + (MAP_HEIGHT / 2 - MAP_MARGIN * 1.5) * Math.sin(angle),
  });
}

/**
 * The map's nodes: every accepted settlement and other location, at the local
 * position if the player has moved it, else the saved one, else a default.
 */
export function mapNodes(state: CampaignState, local: Layout = {}): readonly MapNode[] {
  const places = Object.values(state.launch.locations).filter(
    (location) => location.kind === 'settlement' || location.kind === 'other',
  );
  // Default positions are decided against the saved layout alone. Counting a
  // node the player has just moved would renumber the rest, so dragging one
  // place would move the others (found in the browser).
  const unplaced = places.filter((place) => state.launch.layout[place.id] === undefined);
  return places.map((place) => {
    const at =
      local[place.id] ??
      state.launch.layout[place.id] ??
      defaultPosition(unplaced.indexOf(place), unplaced.length);
    return {
      id: place.id,
      name: place.name,
      kind: place.kind as 'settlement' | 'other',
      starting: state.launch.startingSettlementId === place.id,
      x: at.x,
      y: at.y,
    };
  });
}

/**
 * Where an off-map exit is drawn: on the map edge nearest its node. It has no
 * coordinates of its own to save, because it is a direction, not a place.
 */
export function exitPoint(from: Point): Point {
  const distances = [
    { edge: 'left', d: from.x },
    { edge: 'right', d: MAP_WIDTH - from.x },
    { edge: 'top', d: from.y },
    { edge: 'bottom', d: MAP_HEIGHT - from.y },
  ].sort((a, b) => a.d - b.d);
  switch (distances[0]!.edge) {
    case 'left':
      return { x: 0, y: from.y };
    case 'right':
      return { x: MAP_WIDTH, y: from.y };
    case 'top':
      return { x: from.x, y: 0 };
    default:
      return { x: from.x, y: MAP_HEIGHT };
  }
}

export interface PassageView {
  /** Stable key: the passage's own event. */
  readonly key: string;
  readonly from: EntityId;
  readonly to: EntityId | { readonly kind: 'off_map'; readonly label: string };
  /** In words, for the list that does everything the map does (A34). */
  readonly text: string;
}

/** Every passage in words, so none has to be found by looking at the map. */
export function passageViews(state: CampaignState): readonly PassageView[] {
  const nameOf = (id: EntityId) => state.launch.locations[id]?.name ?? 'an unknown place';
  return state.launch.routes.map((route) => ({
    key: route.eventId,
    from: route.from,
    to: route.to,
    text:
      typeof route.to === 'string'
        ? `${nameOf(route.from)} to ${nameOf(route.to)}`
        : `${nameOf(route.from)} to an off-map exit: ${route.to.label}`,
  }));
}

/** The complete layout to save: every node's position, not only the moved ones. */
export function layoutToSave(nodes: readonly MapNode[]): Record<string, Point> {
  return Object.fromEntries(nodes.map((node) => [node.id, { x: node.x, y: node.y }]));
}

/** Whether the map shows positions that are not saved yet. */
export function isLayoutDirty(state: CampaignState, nodes: readonly MapNode[]): boolean {
  return nodes.some((node) => {
    const saved = state.launch.layout[node.id];
    return saved === undefined || saved.x !== node.x || saved.y !== node.y;
  });
}

/** Map a point in screen pixels into map units, given the SVG's box. */
export function toMapPoint(
  client: Point,
  box: {
    readonly left: number;
    readonly top: number;
    readonly width: number;
    readonly height: number;
  },
): Point {
  return clamp({
    x: ((client.x - box.left) / box.width) * MAP_WIDTH,
    y: ((client.y - box.top) / box.height) * MAP_HEIGHT,
  });
}
