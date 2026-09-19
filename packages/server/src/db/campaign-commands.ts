import {
  DEFAULT_CAMPAIGN_SETTINGS,
  type Actor,
  type CampaignId,
  type CampaignSettings,
  type CommandId,
} from '@astrolabe/shared';
import type { Sql } from 'postgres';

import { appendCommand, type AppendResult } from './event-store.js';

/**
 * Creating a campaign (task 4.1) with its settings (task 4.5).
 *
 * `campaign.created`'s payload already carries `settings`
 * (`CampaignSettingsSchema`), so there is nothing to write separately —
 * a campaign without settings is not a state worth reaching. Unlike
 * character creation, there is no `rules`-side draft to validate: a
 * campaign name has no rule content behind it, and the settings values are
 * validated by `CampaignSettingsSchema` itself when the event is written.
 *
 * **`campaignId` is supplied by the caller, not minted here.** Every other
 * command mints its own IDs server-side (`character-commands.ts`'s
 * `characterId`), safely, because `appendCommand`'s idempotency check is
 * keyed on `(campaignId, commandId)` and `campaignId` is already fixed by
 * the time those commands run. This one is different: it is the command
 * that *creates* the campaign row, so `campaignId` is itself part of what a
 * retry must reproduce. Minting it fresh on every call (as `uuidv7()` would)
 * defeats `appendCommand`'s replay detection entirely — the `campaigns`
 * insert would use a different id each time and never collide, silently
 * writing a second full campaign rather than replaying the first. Requiring
 * the caller to mint and resend the same `campaignId`, exactly as it already
 * does for `commandId`, means a retry collides on `campaigns.id` instead —
 * a thrown error, not a silent duplicate.
 *
 * **Known limitation, not fixed here (out of group 4's scope):** that
 * collision surfaces as a raw `campaigns_pkey` unique-violation, not as
 * `appendCommand`'s usual replay-with-the-original-response path.
 * `isCommandReplay` (`event-store.ts`) only recognises a violation on
 * `commands_pkey`, and the `campaigns` insert runs *before* the `commands`
 * insert it guards — so a genuine retry never reaches the check that would
 * treat it as a replay. Making the first command of a campaign fully
 * replay-safe is a change to `appendCommand` itself (section 2), not
 * something this command should carry.
 */

/**
 * A settings override with each field optionally `undefined`, matching what
 * `CampaignSettingsSchema.partial()` actually infers to (zod types an
 * omittable field as `T | undefined`, not just `T` on an optional key) —
 * `Partial<CampaignSettings>` looks equivalent but isn't, under this
 * project's `exactOptionalPropertyTypes`.
 */
export interface CampaignSettingsOverride {
  readonly narrationLatitude?: CampaignSettings['narrationLatitude'] | undefined;
  readonly narrationLength?: CampaignSettings['narrationLength'] | undefined;
  readonly rerollCap?: CampaignSettings['rerollCap'] | undefined;
}

export interface CreateCampaignRequest {
  readonly campaignId: CampaignId;
  readonly commandId: CommandId;
  readonly actor: Actor;
  readonly name: string;
  readonly settings?: CampaignSettingsOverride;
}

export interface CreatedCampaign {
  readonly campaignId: CampaignId;
  readonly result: AppendResult;
}

export async function createCampaign(
  sql: Sql,
  request: CreateCampaignRequest,
): Promise<CreatedCampaign> {
  const { campaignId } = request;
  const name = request.name.trim();
  const settings: CampaignSettings = {
    narrationLatitude:
      request.settings?.narrationLatitude ?? DEFAULT_CAMPAIGN_SETTINGS.narrationLatitude,
    narrationLength: request.settings?.narrationLength ?? DEFAULT_CAMPAIGN_SETTINGS.narrationLength,
    rerollCap: request.settings?.rerollCap ?? DEFAULT_CAMPAIGN_SETTINGS.rerollCap,
  };

  const result = await appendCommand(sql, {
    campaignId,
    commandId: request.commandId,
    kind: 'campaign.create',
    actor: request.actor,
    createCampaign: { name },
    events: [{ type: 'campaign.created', payload: { name, settings } }],
    response: { campaignId },
  });

  return { campaignId, result };
}
