import {
  STARFORGED,
  STARTING_MOMENTUM,
  grantedAssets,
  startingMeters,
  validateCharacterDraft,
  validateLaunchCharacterDraft,
  type CharacterDraft,
  type CharacterId,
  type CharacterProblem,
  type TrackId,
} from '@astrolabe/rules';
import type { Actor, CampaignId, CommandId, EventId, SessionId } from '@astrolabe/shared';
import type { Sql } from 'postgres';

import { project } from '../projection/project.js';

import {
  appendCommand,
  readEvents,
  readEventsByCommand,
  type AppendResult,
  type NewEvent,
} from './event-store.js';
import { uuidv7 } from './uuid.js';

/**
 * Creating a character (task 3.5).
 *
 * The draft is validated against the rules **here as well as in the
 * client**, using the same pure function from `rules`. The client validates
 * so a player sees a problem as they type; the server validates because it
 * is authoritative and a client is not to be trusted about what the rules
 * say.
 */

export class CharacterRejectedError extends Error {
  constructor(readonly problems: readonly CharacterProblem[]) {
    super(problems.map((p) => p.message).join(' '));
    this.name = 'CharacterRejectedError';
  }
}

export class LaunchCharacterRejectedError extends Error {
  constructor(
    readonly problems: readonly {
      readonly code: string;
      readonly field: string;
      readonly message: string;
    }[],
  ) {
    super(problems.map((problem) => problem.message).join(' '));
    this.name = 'LaunchCharacterRejectedError';
  }
}

/**
 * D-124, D-132: a `proposalCommandId` that names no proposal of the right
 * kind in the campaign — a character proposal for a character, an incident
 * proposal for the inciting vow.
 */
export class UnknownProposalError extends Error {
  constructor() {
    super('That proposal does not exist in this campaign.');
    this.name = 'UnknownProposalError';
  }
}

export interface CreateCharacterRequest {
  readonly campaignId: CampaignId;
  readonly commandId: CommandId;
  readonly actor: Actor;
  readonly draft: CharacterDraft;
  /**
   * The background vow from character creation (design record section 6).
   * Optional: a character can be created without one and swear their first
   * vow in play.
   */
  readonly backgroundVow?: { readonly title: string; readonly rank: string };
  /**
   * D-89: the starship is a default asset and occupies no slot. Set false
   * for a character the fiction says has no ship of their own — ownership
   * is narrative and changes nothing mechanically, so this only affects
   * whether the asset appears on their sheet.
   */
  readonly grantCommandVehicle?: boolean;
  /** D-124: backstory hooks, proposed or written by hand. Blank ones are dropped. */
  readonly hooks?: readonly string[];
  /** D-131: the player's words. Blank means not recorded; the event schema caps the length. */
  readonly pronouns?: string;
  /** Full Campaign Launch-only character fields. */
  readonly launch?: {
    readonly appearance: string;
    readonly backstory:
      { readonly kind: 'written'; readonly text: string } | { readonly kind: 'discover_in_play' };
    readonly signatureGear?: string;
  };
  /**
   * D-124: the proposal command this character was accepted from. Resolved
   * here to its `character.proposed` event, which becomes the cause; a
   * command that holds no proposal is refused rather than ignored.
   */
  readonly proposalCommandId?: CommandId;
}

export interface CreatedCharacter {
  readonly characterId: CharacterId;
  readonly vowTrackId?: TrackId;
  readonly result: AppendResult;
}

/**
 * Write a character, and the background vow if there is one, as one command.
 *
 * One command rather than two because they are one decision: a character
 * created without the vow they were conceived around is not a state worth
 * being able to reach, and a failure part-way through should leave neither.
 */
export async function createCharacter(
  sql: Sql,
  request: CreateCharacterRequest,
): Promise<CreatedCharacter> {
  const problems = validateCharacterDraft(request.draft, STARFORGED);
  if (problems.length > 0) {
    throw new CharacterRejectedError(problems);
  }

  if (request.launch !== undefined) {
    const launchProblems = validateLaunchCharacterDraft(
      {
        ...request.draft,
        appearance: request.launch.appearance,
        backstory: request.launch.backstory,
        backgroundVow:
          request.backgroundVow === undefined
            ? { title: '', rank: 'troublesome' }
            : { title: request.backgroundVow.title, rank: request.backgroundVow.rank as never },
        ...(request.launch.signatureGear === undefined
          ? {}
          : { signatureGear: request.launch.signatureGear }),
        ...(request.hooks === undefined ? {} : { hooks: request.hooks }),
        ...(request.pronouns === undefined ? {} : { pronouns: request.pronouns }),
      },
      STARFORGED,
    );
    if (launchProblems.length > 0) throw new LaunchCharacterRejectedError(launchProblems);
  }

  const granted = request.grantCommandVehicle === false ? [] : grantedAssets(STARFORGED);

  let causedBy: EventId | undefined;
  if (request.proposalCommandId !== undefined) {
    const proposal = (
      await readEventsByCommand(sql, request.campaignId, request.proposalCommandId)
    ).find((event) => event.type === 'character.proposed');
    if (proposal === undefined) {
      throw new UnknownProposalError();
    }
    causedBy = proposal.id;
  }
  const hooks = (request.hooks ?? []).map((hook) => hook.trim()).filter((hook) => hook !== '');
  const pronouns = request.pronouns?.trim() ?? '';

  const state = project(await readEvents(sql, request.campaignId));
  if (request.launch !== undefined && Object.keys(state.characters).length >= 6) {
    throw new LaunchCharacterRejectedError([
      {
        code: 'crew_count_invalid',
        field: 'characters',
        message: 'Campaign Launch supports at most six characters.',
      },
    ]);
  }
  const sessionId: SessionId | null = state.session?.id ?? null;
  const characterId = uuidv7() as CharacterId;

  const events: NewEvent[] = [
    {
      type: 'character.created',
      payload: {
        characterId,
        name: request.draft.name.trim(),
        callsign: request.draft.callsign.trim(),
        stats: request.draft.stats,
        // Starting values and their bounds come from the imported rules and
        // are snapshotted onto the character, because the projector may not
        // read rules content.
        meters: startingMeters(STARFORGED.gameRules),
        momentum: STARTING_MOMENTUM,
        // The chosen slots plus anything granted outright (D-89). Granted
        // assets are deduplicated against the draft, so a client that sends
        // the starship back with the rest of the sheet is not penalised.
        assets: [...new Set([...request.draft.assets, ...granted])],
        ...(hooks.length > 0 ? { hooks } : {}),
        ...(pronouns !== '' ? { pronouns } : {}),
        ...(request.launch === undefined
          ? {}
          : {
              appearance: request.launch.appearance.trim(),
              backstory: request.launch.backstory,
              backgroundVow:
                request.backgroundVow === undefined
                  ? undefined
                  : {
                      title: request.backgroundVow.title,
                      rank: request.backgroundVow.rank as never,
                    },
              ...(request.launch.signatureGear === undefined
                ? {}
                : { signatureGear: request.launch.signatureGear.trim() }),
            }),
      },
      sessionId,
      subjectCharacterId: characterId,
    },
  ];

  let vowTrackId: TrackId | undefined;
  if (request.backgroundVow !== undefined) {
    vowTrackId = uuidv7() as TrackId;
    events.push({
      type: 'track.created',
      payload: {
        kind: 'vow',
        trackId: vowTrackId,
        title: request.backgroundVow.title,
        rank: request.backgroundVow.rank as never,
        characterId,
      },
      sessionId,
      subjectCharacterId: characterId,
    });
  }

  const result = await appendCommand(sql, {
    campaignId: request.campaignId,
    commandId: request.commandId,
    kind: 'character.create',
    actor: request.actor,
    ...(causedBy !== undefined ? { causedBy } : {}),
    events,
    response: { characterId, ...(vowTrackId !== undefined ? { vowTrackId } : {}) },
  });

  return {
    characterId,
    ...(vowTrackId !== undefined ? { vowTrackId } : {}),
    result,
  };
}
