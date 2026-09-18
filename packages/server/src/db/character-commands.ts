import {
  STARFORGED,
  STARTING_MOMENTUM,
  grantedAssets,
  startingMeters,
  validateCharacterDraft,
  validateLaunchCharacterDraft,
  type ChallengeRank,
  type CharacterDraft,
  type CharacterId,
  type CharacterProblem,
  type TrackId,
} from '@astrolabe/rules';
import type {
  Actor,
  CampaignId,
  CharacterState,
  CommandId,
  EventId,
  PayloadFor,
  SessionId,
} from '@astrolabe/shared';
import type { Sql } from 'postgres';

import { project } from '../projection/project.js';

import { requireLaunchOpen } from './launch-commands.js';
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

/** A command naming a crew member the campaign does not have. */
export class UnknownCharacterError extends Error {
  constructor() {
    super('That character does not exist in this campaign.');
    this.name = 'UnknownCharacterError';
  }
}

export interface ReviseCharacterRequest {
  readonly campaignId: CampaignId;
  readonly commandId: CommandId;
  readonly actor: Actor;
  readonly characterId: CharacterId;
  readonly draft: CharacterDraft;
  readonly backgroundVow: { readonly title: string; readonly rank: ChallengeRank };
  readonly launch: {
    readonly appearance: string;
    readonly backstory:
      { readonly kind: 'written'; readonly text: string } | { readonly kind: 'discover_in_play' };
    readonly signatureGear?: string;
  };
  readonly hooks?: readonly string[];
  readonly pronouns?: string;
}

/**
 * Revise an accepted crew member before launch (6.0d, D-161, D-177).
 *
 * A revision, not a correction: the earlier version stays in the log and in
 * `crewHistory`, and `supersedesEventId` is read from the projected character
 * rather than accepted from the caller — a client that could name what it
 * supersedes could rewrite a different revision's place in the chain.
 *
 * **The background vow travels with it (D-188).** D-105 wrote the character
 * and its vow track as one command because they are one decision; the same
 * holds when the vow changes. A vow whose words moved gets a `track.revised`
 * in this command, and a character who had no vow track gets the
 * `track.created` they were missing — otherwise the sheet and the launch
 * record would disagree permanently, with no way to undo the original.
 */
export async function reviseCharacter(
  sql: Sql,
  request: ReviseCharacterRequest,
): Promise<CreatedCharacter> {
  const state = project(await readEvents(sql, request.campaignId));
  requireLaunchOpen(state, 'A character changes by amendment after launch.');
  const current = state.characters[request.characterId];
  if (current === undefined) throw new UnknownCharacterError();

  const hooks = (request.hooks ?? []).map((hook) => hook.trim()).filter((hook) => hook !== '');
  const pronouns = request.pronouns?.trim() ?? '';
  const backgroundVow = {
    title: request.backgroundVow.title.trim(),
    rank: request.backgroundVow.rank,
  };
  const problems = validateLaunchCharacterDraft(
    {
      ...request.draft,
      appearance: request.launch.appearance,
      backstory: request.launch.backstory,
      backgroundVow,
      ...(request.launch.signatureGear === undefined
        ? {}
        : { signatureGear: request.launch.signatureGear }),
      ...(hooks.length === 0 ? {} : { hooks }),
      ...(pronouns === '' ? {} : { pronouns }),
    },
    STARFORGED,
  );
  if (problems.length > 0) throw new LaunchCharacterRejectedError(problems);

  const events: NewEvent[] = [
    {
      type: 'character.revised',
      payload: {
        characterId: request.characterId,
        character: {
          characterId: request.characterId,
          name: request.draft.name.trim(),
          callsign: request.draft.callsign.trim(),
          stats: request.draft.stats,
          // Carried, not recomputed. A revision restates the launch fields; it
          // is not a reason to reset a meter, and `startingMeters` here would
          // be a silent reset for anything that had already moved.
          meters: meterSnapshots(current),
          momentum: current.momentum.value,
          assets: request.draft.assets,
          appearance: request.launch.appearance.trim(),
          backstory: request.launch.backstory,
          backgroundVow,
          ...(request.launch.signatureGear === undefined
            ? {}
            : { signatureGear: request.launch.signatureGear.trim() }),
          ...(hooks.length > 0 ? { hooks } : {}),
          ...(pronouns !== '' ? { pronouns } : {}),
        },
        provenance: 'player_written',
        groundedIn: [],
        supersedesEventId: current.eventId,
      },
      sessionId: null,
      subjectCharacterId: request.characterId,
    },
  ];

  // D-188. The first vow track is the background vow: before launch a
  // character has at most one, and the shared inciting vow is created at
  // activation, after which this command is refused outright.
  const vowTrackId = current.vowTrackIds[0];
  let createdVowTrackId: TrackId | undefined;
  if (vowTrackId === undefined) {
    createdVowTrackId = uuidv7() as TrackId;
    events.push({
      type: 'track.created',
      payload: {
        kind: 'vow',
        trackId: createdVowTrackId,
        title: backgroundVow.title,
        rank: backgroundVow.rank,
        characterId: request.characterId,
      },
      sessionId: null,
      subjectCharacterId: request.characterId,
    });
  } else if (
    current.backgroundVow?.title !== backgroundVow.title ||
    current.backgroundVow.rank !== backgroundVow.rank
  ) {
    events.push({
      type: 'track.revised',
      payload: { trackId: vowTrackId, title: backgroundVow.title, rank: backgroundVow.rank },
      sessionId: null,
      subjectCharacterId: request.characterId,
    });
  }

  const result = await appendCommand(sql, {
    campaignId: request.campaignId,
    commandId: request.commandId,
    kind: 'character.revise',
    actor: request.actor,
    events,
    response: {
      characterId: request.characterId,
      ...(createdVowTrackId !== undefined ? { vowTrackId: createdVowTrackId } : {}),
    },
  });

  return {
    characterId: request.characterId,
    ...(createdVowTrackId !== undefined ? { vowTrackId: createdVowTrackId } : {}),
    result,
  };
}

export interface RemoveCharacterRequest {
  readonly campaignId: CampaignId;
  readonly commandId: CommandId;
  readonly actor: Actor;
  readonly characterId: CharacterId;
  readonly reason: string;
}

/**
 * Remove a crew member before launch (6.0d).
 *
 * No crew floor is enforced here. A crew of zero is a legal thing to pass
 * through — a player who removes their only character to build a better one
 * does exactly that — and `validateLaunchReadiness` already refuses to launch
 * from there with `crew_count_invalid`. Refusing the removal as well would put
 * a readiness rule inside a command, which is what D-176 exists to prevent.
 *
 * What removal must not do is strand anything. The projection arm drops the
 * character's own vow tracks, and a module still naming them as its owner
 * surfaces as `module_owner_unknown` from the starship validator rather than
 * silently — blocking launch until the player resolves it, which is the right
 * place for it to surface.
 */
export async function removeCharacter(
  sql: Sql,
  request: RemoveCharacterRequest,
): Promise<{ readonly characterId: CharacterId; readonly result: AppendResult }> {
  const state = project(await readEvents(sql, request.campaignId));
  requireLaunchOpen(state, 'A launched campaign keeps its crew.');
  const current = state.characters[request.characterId];
  if (current === undefined) throw new UnknownCharacterError();

  const result = await appendCommand(sql, {
    campaignId: request.campaignId,
    commandId: request.commandId,
    kind: 'character.remove',
    actor: request.actor,
    events: [
      {
        type: 'character.removed',
        payload: {
          characterId: request.characterId,
          supersedesEventId: current.eventId,
          reason: request.reason.trim(),
        },
        sessionId: null,
        subjectCharacterId: request.characterId,
      },
    ],
    response: { characterId: request.characterId },
  });

  return { characterId: request.characterId, result };
}

/** `CharacterState` meters carry provenance; the event payload does not. */
function meterSnapshots(character: CharacterState): PayloadFor<'character.created'>['meters'] {
  const of = (meter: 'health' | 'spirit' | 'supply') => ({
    value: character.meters[meter].value,
    min: character.meters[meter].min,
    max: character.meters[meter].max,
  });
  return { health: of('health'), spirit: of('spirit'), supply: of('supply') };
}
