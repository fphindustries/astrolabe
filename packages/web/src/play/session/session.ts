import type { CampaignState, EntityId } from '@astrolabe/shared';

/**
 * Whether play can go on, and if not, what Begin Session offers (D-146).
 * Pure, like `scene.ts`.
 *
 * - `open`: a session is open, and the composer plays.
 * - `first`: the campaign has never had a session, so the player names its
 *   scene and may place it at a sector location.
 * - `next`: the last session ended, and the next one carries its scene forward.
 */
export type SessionView =
  | { readonly kind: 'open' }
  | {
      readonly kind: 'first';
      readonly locations: readonly { readonly id: EntityId; readonly name: string }[];
    }
  | {
      readonly kind: 'next';
      readonly number: number;
      readonly sceneTitle: string | undefined;
      readonly locationName: string | undefined;
    };

export function toSessionView(
  state: Pick<CampaignState, 'session' | 'scene' | 'entities'>,
): SessionView {
  const { session, scene, entities } = state;
  if (session === null) {
    return {
      kind: 'first',
      locations: Object.values(entities)
        .filter((e) => e.kind === 'location')
        .map((e) => ({ id: e.id, name: e.name })),
    };
  }
  if (session.endedAt === undefined) {
    return { kind: 'open' };
  }
  return {
    kind: 'next',
    number: session.number + 1,
    sceneTitle: scene?.title,
    locationName: scene?.locationId === undefined ? undefined : entities[scene.locationId]?.name,
  };
}
