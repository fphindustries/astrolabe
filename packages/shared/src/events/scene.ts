import * as z from 'zod';

import { EntityIdSchema, SceneIdSchema } from '../ids.js';

/**
 * D-71: Milestone 1 builds the scene data model and binds the scene header
 * to it, but a session opens one scene and stays in it. AI-proposed scene
 * transitions (D-43) are out of Milestone 1, so nothing writes a second
 * `scene.started` within a session yet.
 *
 * `scene.header_updated` — the AI maintaining "where are we and what's at
 * stake" as play moves (design record section 8) — lands with the scene
 * header itself.
 */
export const SceneStartedSchema = z.object({
  sceneId: SceneIdSchema,
  title: z.string().min(1),
  /** The location entity the scene takes place at, where one is established. */
  locationId: EntityIdSchema.optional(),
});
