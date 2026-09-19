import {
  STARFORGED,
  STARTING_MOMENTUM,
  startingMeters,
  validateCharacterDraft,
  validateLaunchCharacterDraft,
  type ChallengeRank,
  type CharacterDraft,
  type CharacterId,
  type AssetId,
  type Backstory,
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
  readonly backgroundVow?: { readonly title: string; readonly rank: ChallengeRank };
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
   * here to the `creation.proposed` event it holds, which becomes the cause;
   * a command that holds no proposal is refused rather than ignored. A
   * Milestone 1 campaign's `character.proposed` is still accepted, because
   * D-185 keeps that type readable forever — it is simply no longer written.
   */
  readonly proposalCommandId?: CommandId;
  /**
   * The `oracle.rolled` events this character was built on (A41, D-166).
   *
   * A rolled backstory prompt is inspiration, not the backstory — the player
   * writes that in their own words — but the roll is what the accepted fact
   * was built from, so it is cited rather than forgotten. The launch
   * workspace resolves these into the chips a player reads (6.0b).
   */
  readonly groundedIn?: readonly EventId[];
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
  // A launch character is judged by the launch validator alone, which runs
  // the same base checks: judging it by the Milestone 1 one first threw a
  // `CharacterRejectedError` the launch route does not map, a 500 for what is
  // a 422 refusal. The retired Starship grant hid that for a command vehicle;
  // a bad stat array always hit it (found in 7.3).
  if (request.launch === undefined) {
    const problems = validateCharacterDraft(request.draft, STARFORGED);
    if (problems.length > 0) {
      throw new CharacterRejectedError(problems);
    }
  } else {
    const launchProblems = validateLaunchCharacterDraft(
      {
        ...request.draft,
        appearance: request.launch.appearance,
        backstory: request.launch.backstory,
        backgroundVow:
          request.backgroundVow === undefined
            ? { title: '', rank: 'troublesome' }
            : { title: request.backgroundVow.title, rank: request.backgroundVow.rank },
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

  let causedBy: EventId | undefined;
  let proposed:
    Extract<PayloadFor<'creation.proposed'>, { readonly targetKind: 'character' }> | undefined;
  if (request.proposalCommandId !== undefined) {
    const proposal = (
      await readEventsByCommand(sql, request.campaignId, request.proposalCommandId)
    ).find(
      (event) =>
        event.type === 'character.proposed' ||
        (event.type === 'creation.proposed' && event.payload.targetKind === 'character'),
    );
    if (proposal === undefined) {
      throw new UnknownProposalError();
    }
    causedBy = proposal.id;
    if (proposal.type === 'creation.proposed' && proposal.payload.targetKind === 'character') {
      proposed = proposal.payload;
    }
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
        // The chosen slots only. The starship was granted here until 7.3; it
        // is the crew's shared aggregate now (D-164, D-193).
        assets: request.draft.assets,
        ...(hooks.length > 0 ? { hooks } : {}),
        ...(pronouns !== '' ? { pronouns } : {}),
        ...(request.launch === undefined
          ? {}
          : {
              // Recorded on the launch path only: a Milestone 1 character
              // carries neither field, and 6.0a made both optional so it stays
              // readable exactly as written.
              provenance:
                proposed === undefined
                  ? ('player_written' as const)
                  : proposalProvenance(proposed, {
                      name: request.draft.name.trim(),
                      callsign: request.draft.callsign.trim(),
                      stats: request.draft.stats,
                      assets: request.draft.assets,
                      appearance: request.launch.appearance.trim(),
                      backstory: request.launch.backstory,
                      backgroundVow: request.backgroundVow ?? { title: '', rank: 'troublesome' },
                      hooks,
                      pronouns,
                      signatureGear: request.launch.signatureGear?.trim() ?? '',
                    }),
              groundedIn: request.groundedIn ?? [],
              appearance: request.launch.appearance.trim(),
              backstory: request.launch.backstory,
              backgroundVow:
                request.backgroundVow === undefined
                  ? undefined
                  : {
                      title: request.backgroundVow.title,
                      rank: request.backgroundVow.rank,
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
        rank: request.backgroundVow.rank,
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
  /** The rolls this version was built on (A41). */
  readonly groundedIn?: readonly EventId[];
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
        groundedIn: request.groundedIn ?? [],
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

/**
 * Whether the accepted character is the Guide's proposal or the player's edit
 * of it (D-185, A41).
 *
 * Decided here by comparing, not taken from the client: whether the player
 * changed something is a fact about the player, and a screen has every
 * incentive to get it wrong by accident. This is `acceptedProposal`'s rule for
 * truths, applied to the one target whose proposal has more than one field.
 *
 * Only the fields the proposal actually offered are compared. The Guide leaves
 * pronouns null unless the concept stated them (D-131), and a player who then
 * writes their own has not edited anything the Guide proposed.
 */
function proposalProvenance(
  proposal: Extract<PayloadFor<'creation.proposed'>, { readonly targetKind: 'character' }>,
  accepted: {
    readonly name: string;
    readonly callsign: string;
    readonly stats: Readonly<Record<string, number>>;
    readonly assets: readonly AssetId[];
    readonly appearance: string;
    readonly backstory: Backstory;
    readonly backgroundVow: { readonly title: string; readonly rank: ChallengeRank };
    readonly hooks: readonly string[];
    readonly pronouns: string;
    readonly signatureGear: string;
  },
): 'guide_proposal' | 'guide_proposal_edited' {
  const offered = proposal.proposal;
  const sameBackstory =
    offered.backstory.value.kind === accepted.backstory.kind &&
    (accepted.backstory.kind === 'discover_in_play' ||
      (offered.backstory.value.kind === 'written' &&
        offered.backstory.value.text === accepted.backstory.text));
  const unchanged =
    offered.name.value === accepted.name &&
    offered.callsign.value === accepted.callsign &&
    offered.appearance.value === accepted.appearance &&
    sameBackstory &&
    JSON.stringify(offered.stats.value) === JSON.stringify(accepted.stats) &&
    JSON.stringify(offered.assets.map((asset) => asset.assetId)) ===
      JSON.stringify([...accepted.assets]) &&
    offered.backgroundVow.title === accepted.backgroundVow.title &&
    offered.backgroundVow.rank === accepted.backgroundVow.rank &&
    JSON.stringify(offered.hooks.map((hook) => hook.text)) ===
      JSON.stringify([...accepted.hooks]) &&
    (offered.pronouns === undefined || offered.pronouns.value === accepted.pronouns) &&
    (offered.signatureGear === undefined || offered.signatureGear.value === accepted.signatureGear);
  return unchanged ? 'guide_proposal' : 'guide_proposal_edited';
}
