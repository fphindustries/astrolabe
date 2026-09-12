import * as z from 'zod';

import type { DeepReadonly } from '../readonly.js';

/**
 * Campaign settings the AI and the rules engine both read.
 *
 * `narrationLatitude` takes D-07's three values verbatim.
 * `narrationLength` is D-11's *campaign-level adjustment*, not an absolute
 * length — length itself scales to the dramatic weight of the moment, and
 * this shifts the whole scale. `rerollCap` is D-29's per-roll cap on AI
 * oracle rerolls, counted per individual roll (D-69).
 */
export const CampaignSettingsSchema = z.object({
  narrationLatitude: z.enum(['minimal', 'color', 'full_voice']),
  narrationLength: z.enum(['shorter', 'standard', 'longer']),
  rerollCap: z.int().nonnegative(),
});

export type CampaignSettings = DeepReadonly<z.infer<typeof CampaignSettingsSchema>>;

export const DEFAULT_CAMPAIGN_SETTINGS: CampaignSettings = {
  narrationLatitude: 'color',
  narrationLength: 'standard',
  rerollCap: 2,
};

/**
 * The first event in every campaign. The campaign's own ID is on the
 * envelope, so it is not repeated here.
 */
export const CampaignCreatedSchema = z.object({
  name: z.string().min(1),
  settings: CampaignSettingsSchema,
});
