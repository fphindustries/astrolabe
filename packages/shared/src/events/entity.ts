import * as z from 'zod';

import { EntityIdSchema, EventIdSchema, RecipeIdSchema } from '../ids.js';

/**
 * A10 / Beat 6: an AI-created NPC appears as a tracked entity badged as
 * AI-established.
 *
 * `provenance.establishedBy` is that badge. `groundedIn` lists the
 * `oracle.rolled` events the entity was built from — Beat 6's five rolls
 * for role, goal, first look, disposition and name, one of them the
 * survivor of a visible reroll — which is how the NPC card links back to
 * its chips. `recipeId` names the declared recipe the server rolled (D-65),
 * so the golden session can assert the grounding was reproducible.
 *
 * `fields` is deliberately open: an NPC's slots come from its recipe, and
 * pinning a schema per entity kind here would mean editing `shared` every
 * time a recipe gained a slot. The recipe is the contract.
 */
export const EntityEstablishedSchema = z.object({
  entityId: EntityIdSchema,
  kind: z.enum(['npc', 'location', 'faction', 'ship']),
  name: z.string().min(1),
  fields: z.record(z.string(), z.string()),
  provenance: z.object({
    establishedBy: z.enum(['ai', 'player']),
    recipeId: RecipeIdSchema.optional(),
    groundedIn: z.array(EventIdSchema),
  }),
});
