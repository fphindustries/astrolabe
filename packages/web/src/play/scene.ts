import type { EntityId, EntityState, SceneState } from '@astrolabe/shared';

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
}

const NO_SCENE: SceneHeaderView = { title: 'No scene yet' };

export function toSceneHeaderView(
  scene: SceneState | null,
  entities: Readonly<Record<EntityId, EntityState>>,
): SceneHeaderView {
  if (scene === null) {
    return NO_SCENE;
  }
  const location = scene.locationId === undefined ? undefined : entities[scene.locationId];
  return {
    title: scene.title,
    ...(location !== undefined ? { locationName: location.name } : {}),
  };
}
