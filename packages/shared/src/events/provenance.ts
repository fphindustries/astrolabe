import * as z from 'zod';

import { EventIdSchema } from '../ids.js';

/**
 * How an accepted launch fact came to be, and what it was built on.
 *
 * These lived in `launch.ts` until group 6. They moved here because D-184 puts
 * a crew member's acceptance on `character.created`, and `launch.ts` already
 * imports `CharacterCreatedSchema` — so the launch catalogue cannot be where
 * the character catalogue reads its provenance from without a cycle. Nothing
 * about the meaning changed; `launch.ts` and `character.ts` both import from
 * here, and the package root re-exports it as before.
 */
export const LaunchProvenanceSchema = z.enum([
  'player_written',
  'official_choice',
  'oracle_roll',
  'guide_proposal',
  'guide_proposal_edited',
]);
/** How an accepted launch fact came to be — A41's badge, in one word. */
export type LaunchProvenance = z.infer<typeof LaunchProvenanceSchema>;

export const AcceptanceSchema = z.object({
  provenance: LaunchProvenanceSchema,
  groundedIn: z.array(EventIdSchema),
  supersedesEventId: EventIdSchema.optional(),
});
