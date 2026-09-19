import type {
  CampaignState,
  EntityId,
  EntityState,
  SceneState,
  SessionState,
} from '@astrolabe/shared';

/**
 * Pure view-model for the scene header (task 5.3). Bound to `SceneState` as
 * it exists today (`title`, `locationId`) — no `stakes`/`unresolved` field:
 * A1 only needs location, vow and meters, and Beat 2's stakes land in
 * scene-opening narration prose (task 5.4), not the header. There is no
 * writer for a header-authored-by-the-AI field until group 7 exists.
 */

export interface SceneHeaderView {
  readonly title: string;
  readonly locationName?: string;
  /** D-141: an open scene with no frame yet can ask for one. */
  readonly canFrame?: boolean;
}

const NO_SCENE: SceneHeaderView = { title: 'No scene yet' };

/**
 * A scene's location is an entity, or, for Session 1's opening scene, a
 * launch location: activation opens it at the starting settlement, which is a
 * launch fact and not an entity (D-168, 9.0i). Both are looked up by id.
 */
export function toSceneHeaderView(
  scene: SceneState | null,
  entities: Readonly<Record<EntityId, EntityState>>,
  session: SessionState | null = null,
  launchLocations: CampaignState['launch']['locations'] = {},
): SceneHeaderView {
  if (scene === null) {
    return NO_SCENE;
  }
  const location =
    scene.locationId === undefined
      ? undefined
      : (entities[scene.locationId] ?? launchLocations[scene.locationId]);
  return {
    title: scene.title,
    ...(location !== undefined ? { locationName: location.name } : {}),
    ...(session !== null && session.endedAt === undefined && scene.framedBy === undefined
      ? { canFrame: true }
      : {}),
  };
}
