import {
  rollOracle,
  STARFORGED,
  type CharacterId,
  type OracleId,
  type RandomSource,
  type TrackId,
} from '@astrolabe/rules';
import {
  DEFAULT_CAMPAIGN_SETTINGS,
  type Actor,
  type CampaignId,
  type CampaignSettings,
  type ChallengeRank,
  type CommandId,
  type EntityId,
  type EventId,
} from '@astrolabe/shared';
import type { Sql } from 'postgres';

import { project } from '../projection/project.js';
import { cryptoRandomSource } from '../random-source.js';

import { UnknownProposalError } from './character-commands.js';
import {
  appendCommand,
  readEvents,
  readEventsByCommand,
  type AppendResult,
} from './event-store.js';
import { uuidv7 } from './uuid.js';

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

export class TruthRejectedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TruthRejectedError';
  }
}

/**
 * Answering one setting truth (task 4.2, D-31): pick, roll, or write.
 * `oracleId` names which of `STARFORGED.truths` this answers — the "one
 * truth per question" constraint is checked here against the projection,
 * never in `rules`, which sees no campaign state (section 3's convention).
 *
 * **The server rolls, not the client** (design record §9, §4): a `'rolled'`
 * request carries no die result — this is where `rollOracle` actually
 * runs, via the real, non-seeded `RandomSource` (`cryptoRandomSource`,
 * overridable only for tests). A `'picked'` request names a row by index
 * rather than sending text, so the stored answer is always one of the
 * book's own options, never client-supplied text masquerading as one — the
 * same reasoning `createCharacter` revalidating a draft the client already
 * validated is built on.
 */
export interface SetTruthRequest {
  readonly campaignId: CampaignId;
  readonly commandId: CommandId;
  readonly actor: Actor;
  readonly oracleId: OracleId;
  readonly source: 'picked' | 'rolled' | 'written';
  /** Required when `source` is `'picked'`: an index into the truth table's rows. */
  readonly rowIndex?: number;
  /** Required when `source` is `'written'`. */
  readonly text?: string;
  /** Test-only override of the real RNG; defaults to `cryptoRandomSource()`. */
  readonly rng?: RandomSource;
}

export interface SetTruth {
  readonly text: string;
  readonly result: AppendResult;
}

export async function setTruth(sql: Sql, request: SetTruthRequest): Promise<SetTruth> {
  const table = STARFORGED.truths.find((t) => t.id === request.oracleId);
  if (table === undefined) {
    throw new TruthRejectedError(`"${request.oracleId}" is not a setting truth.`);
  }

  const state = project(await readEvents(sql, request.campaignId));
  if (state.truths[request.oracleId] !== undefined) {
    throw new TruthRejectedError(`"${request.oracleId}" has already been answered.`);
  }

  let text: string;
  let roll: number | undefined;
  switch (request.source) {
    case 'written': {
      const written = request.text?.trim() ?? '';
      if (written.length === 0) {
        throw new TruthRejectedError('A written truth needs its own text.');
      }
      text = written;
      break;
    }
    case 'picked': {
      const row = table.rows[request.rowIndex ?? -1];
      if (row === undefined) {
        throw new TruthRejectedError(`"${request.oracleId}" has no option at that index.`);
      }
      text = row.text;
      break;
    }
    case 'rolled': {
      const rolled = rollOracle(request.rng ?? cryptoRandomSource(), table);
      text = rolled.row.text;
      roll = rolled.roll;
      break;
    }
  }

  const result = await appendCommand(sql, {
    campaignId: request.campaignId,
    commandId: request.commandId,
    kind: 'truth.set',
    actor: request.actor,
    events: [
      {
        type: 'truth.set',
        payload: {
          oracleId: request.oracleId,
          source: request.source,
          text,
          ...(roll !== undefined ? { roll } : {}),
        },
      },
    ],
    response: { text },
  });

  return { text, result };
}

/**
 * Adding a location to the sector (task 4.3, D-102): the player writes the
 * name and description directly, rather than the oracle-grounded
 * generation D-32 eventually calls for — deferred until the oracle-recipe
 * API (task 8.1) and the AI provider (group 7) both exist. Reuses
 * `entity.established` unchanged (`kind: 'location'`,
 * `provenance.establishedBy: 'player'`), the same event AI-established
 * NPCs will use later — no new event type for locations themselves, only
 * for the routes between them (D-103).
 */
export interface AddSectorLocationRequest {
  readonly campaignId: CampaignId;
  readonly commandId: CommandId;
  readonly actor: Actor;
  readonly name: string;
  readonly description: string;
}

export interface AddedSectorLocation {
  readonly locationId: EntityId;
  readonly result: AppendResult;
}

export async function addSectorLocation(
  sql: Sql,
  request: AddSectorLocationRequest,
): Promise<AddedSectorLocation> {
  const locationId = uuidv7() as EntityId;
  const name = request.name.trim();
  const description = request.description.trim();

  const result = await appendCommand(sql, {
    campaignId: request.campaignId,
    commandId: request.commandId,
    kind: 'sector.add_location',
    actor: request.actor,
    events: [
      {
        type: 'entity.established',
        payload: {
          entityId: locationId,
          kind: 'location',
          name,
          fields: description.length > 0 ? { description } : {},
          provenance: { establishedBy: 'player', groundedIn: [] },
        },
      },
    ],
    response: { locationId },
  });

  return { locationId, result };
}

/**
 * Adding a route between two sector locations (task 4.3, D-103). Both
 * endpoints must already be established locations — checked against the
 * projection, since "is this id a location" is campaign state, not rules
 * content.
 */
export interface AddSectorRouteRequest {
  readonly campaignId: CampaignId;
  readonly commandId: CommandId;
  readonly actor: Actor;
  readonly fromLocationId: EntityId;
  readonly toLocationId: EntityId;
}

export class SectorRouteRejectedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SectorRouteRejectedError';
  }
}

export async function addSectorRoute(
  sql: Sql,
  request: AddSectorRouteRequest,
): Promise<{ result: AppendResult }> {
  const state = project(await readEvents(sql, request.campaignId));
  for (const id of [request.fromLocationId, request.toLocationId]) {
    const entity = state.entities[id];
    if (entity === undefined || entity.kind !== 'location') {
      throw new SectorRouteRejectedError(`"${id}" is not an established location.`);
    }
  }

  const result = await appendCommand(sql, {
    campaignId: request.campaignId,
    commandId: request.commandId,
    kind: 'sector.add_route',
    actor: request.actor,
    events: [
      {
        type: 'sector.route_added',
        payload: { fromLocationId: request.fromLocationId, toLocationId: request.toLocationId },
      },
    ],
  });

  return { result };
}

export class IncitingVowRejectedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'IncitingVowRejectedError';
  }
}

/**
 * The chosen inciting incident becomes the first vow (task 4.4, D-34): a
 * `track.created` event with `kind: 'vow'`, following the same shape
 * `character-commands.ts`'s background vow already writes. No
 * `characterId` by default — the golden session's own inciting vow
 * ("recover the flight recorder of Meridian's Hope") belongs to the crew,
 * not to one character (`harness/golden-beats.ts` writes it the same way).
 *
 * The title and rank are always the player's to send. When they started
 * from the Guide's proposed incidents (task 4.6, D-132), `proposalCommandId`
 * names that proposal: the server resolves it and records it as the vow's
 * cause, never taking causality from the client (D-124). Edited or not, the
 * words sworn are the ones sent.
 */
export interface SwearIncitingVowRequest {
  readonly campaignId: CampaignId;
  readonly commandId: CommandId;
  readonly actor: Actor;
  readonly title: string;
  readonly rank: ChallengeRank;
  readonly characterId?: CharacterId;
  readonly proposalCommandId?: CommandId;
}

export interface SwornIncitingVow {
  readonly vowTrackId: TrackId;
  readonly result: AppendResult;
}

export async function swearIncitingVow(
  sql: Sql,
  request: SwearIncitingVowRequest,
): Promise<SwornIncitingVow> {
  const title = request.title.trim();
  if (title.length === 0) {
    throw new IncitingVowRejectedError('An inciting incident needs its own words.');
  }

  let causedBy: EventId | undefined;
  if (request.proposalCommandId !== undefined) {
    const proposal = (
      await readEventsByCommand(sql, request.campaignId, request.proposalCommandId)
    ).find((event) => event.type === 'incident.proposed');
    if (proposal === undefined) {
      throw new UnknownProposalError();
    }
    causedBy = proposal.id;
  }

  const vowTrackId = uuidv7() as TrackId;

  const result = await appendCommand(sql, {
    campaignId: request.campaignId,
    commandId: request.commandId,
    kind: 'campaign.swear_inciting_vow',
    actor: request.actor,
    ...(causedBy !== undefined ? { causedBy } : {}),
    events: [
      {
        type: 'track.created',
        payload: {
          kind: 'vow',
          trackId: vowTrackId,
          title,
          rank: request.rank,
          ...(request.characterId !== undefined ? { characterId: request.characterId } : {}),
        },
      },
    ],
    response: { vowTrackId },
  });

  return { vowTrackId, result };
}
