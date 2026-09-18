import {
  STARFORGED,
  STARSHIP_ASSET_ID,
  STARTING_MOMENTUM,
  startingMeters,
  validateCharacterDraft,
  type CharacterDraft,
  type CharacterId,
} from '@astrolabe/rules';
import type { Actor, CampaignId, CommandId } from '@astrolabe/shared';
import type { Sql } from 'postgres';

import { appendCommand } from '../db/event-store.js';
import { uuidv7 } from '../db/uuid.js';

/**
 * A character exactly as Milestone 1 wrote one: the chosen assets plus the
 * Starship granted to every character (D-89).
 *
 * 7.3 retired that grant, so `createCharacter` no longer writes it. The
 * built-in fixtures are Milestone 1 campaigns until 10.1 rebuilds them on a
 * launched ship (D-169), and they are what proves the compatibility path runs
 * on real legacy data: the fold keeps the grant off each sheet and the crew
 * shares one ship (D-193). So they write the historical shape directly, as a
 * database from before 7.3 already holds it. Fixture-only; nothing a player
 * reaches writes this.
 */
export async function createLegacyCharacter(
  sql: Sql,
  request: {
    readonly campaignId: CampaignId;
    readonly commandId: CommandId;
    readonly actor: Actor;
    readonly draft: CharacterDraft;
    readonly pronouns?: string;
  },
): Promise<CharacterId> {
  const problems = validateCharacterDraft(request.draft, STARFORGED);
  if (problems.length > 0)
    throw new Error(`Fixture character is invalid: ${problems.map((p) => p.message).join(' ')}`);
  const characterId = uuidv7() as CharacterId;
  const result = await appendCommand(sql, {
    campaignId: request.campaignId,
    commandId: request.commandId,
    kind: 'character.create',
    actor: request.actor,
    events: [
      {
        type: 'character.created',
        payload: {
          characterId,
          name: request.draft.name,
          callsign: request.draft.callsign,
          stats: request.draft.stats,
          meters: startingMeters(STARFORGED.gameRules),
          momentum: STARTING_MOMENTUM,
          assets: [...request.draft.assets, STARSHIP_ASSET_ID],
          ...(request.pronouns === undefined ? {} : { pronouns: request.pronouns }),
        },
        subjectCharacterId: characterId,
      },
    ],
    response: { characterId },
  });
  return (result.response as { readonly characterId: CharacterId }).characterId;
}
