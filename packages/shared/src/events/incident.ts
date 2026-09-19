import * as z from 'zod';

import { CharacterIdSchema, EntityIdSchema, EventIdSchema, OracleIdSchema } from '../ids.js';

import { ChallengeRankSchema } from './track.js';

/**
 * The Guide's proposed inciting incidents (task 4.6, D-34, D-132): a
 * suggestion, like `character.proposed`, and nothing until the player swears
 * a vow that names it as its cause.
 *
 * Each option cites the server-rolled `oracle.rolled` events in the same
 * command that ground it (D-123), and names what it draws on from the
 * campaign as ids: answered truths, sector locations, and whatever crew
 * exists when it is asked (D-133).
 */
export const IncidentOptionSchema = z.object({
  title: z.string().min(1),
  rank: ChallengeRankSchema,
  situation: z.string().min(1),
  reason: z.string().min(1),
  groundedIn: z.array(EventIdSchema).min(1),
  drawsOn: z.object({
    truths: z.array(OracleIdSchema),
    locations: z.array(EntityIdSchema),
    characters: z.array(CharacterIdSchema),
    /**
     * The remaining accepted launch facts an option cited (D-168): the shared
     * starship, a trouble, the local connection. Optional because Milestone 1
     * proposals predate them.
     */
    launchFacts: z.array(EntityIdSchema).optional(),
  }),
});

export const IncidentProposedSchema = z.object({
  options: z.array(IncidentOptionSchema).min(1),
});
