import type { CharacterId, MoveId, OutcomeTier, StatId, TrackId } from '@astrolabe/rules';
import {
  LOCAL_PLAYER_ID,
  type Actor,
  type CampaignId,
  type EntityId,
  type SceneId,
  type SessionId,
} from '@astrolabe/shared';
import type { Sql } from 'postgres';

import { StubProvider } from '../ai/stub.js';
import { appendCommand } from '../db/event-store.js';
import { endSession, proposeSessionSummary } from '../db/session-commands.js';
import { setComplication } from '../db/complication-commands.js';
import { applyMoveChoice, invokeMove } from '../db/move-commands.js';
import { prepareBeatNarration, runBeatNarration } from '../db/narration-commands.js';

import { fixtureUuid } from './ids.js';
import { playLanternWakeLaunch } from './lantern-wake-launch.js';
import { actionRoll } from './loaded-dice.js';

/**
 * `session-1`: D-72's committed session, and the state the golden session's
 * Setup finds (D-122).
 *
 * The Lantern Wake campaign with its truths, a three-location sector, the
 * crew, and the formidable vow. Session 1 is played and ended: the crew
 * pick up the *Meridian's Hope* beacon and trace it to a derelict relay at
 * the edge of the sector. It ends with momentum at Vesna +7, Rook +2 and
 * Juno +3, which is where the golden session begins, and with a summary and
 * open threads for Beat 1's recap to be built from.
 *
 * Everything that has a command goes through it: creation validates the
 * characters, moves resolve through the rules engine with loaded dice, and
 * passages go through beat narration with a scripted stub, and the session
 * begins through Begin a Session (D-146). One step is appended directly:
 * the second scene, when the crew reaches Varga Relay, which is D-146's
 * fixture exception to D-71 so that session 2 carries the relay scene
 * forward. The session ends through End a Session (D-149), from a scripted
 * proposal committed unedited.
 */

export const SESSION_ONE = 'session-1';

export const SESSION_ONE_CAMPAIGN_ID = fixtureUuid<CampaignId>(SESSION_ONE, 'campaign');

const PLAYER: Actor = { kind: 'player', playerId: LOCAL_PLAYER_ID };

const GATHER_INFORMATION = 'move:adventure/gather-information' as MoveId;
const FACE_DANGER = 'move:adventure/face-danger' as MoveId;
const SECURE_AN_ADVANTAGE = 'move:adventure/secure-an-advantage' as MoveId;

export interface SessionOneRun {
  readonly campaignId: CampaignId;
  readonly sessionId: SessionId;
  readonly characters: {
    readonly vesna: CharacterId;
    readonly rook: CharacterId;
    readonly juno: CharacterId;
  };
  readonly vowId: TrackId;
  readonly locations: {
    readonly anchorage: EntityId;
    readonly drift: EntityId;
    readonly relay: EntityId;
  };
}

export interface SessionOneOptions {
  /** Keys every stable id, so two fixtures built on session 1 can sit side by side. */
  readonly fixture: string;
  readonly campaignName: string;
}

export async function playSessionOne(
  sql: Sql,
  { fixture, campaignName }: SessionOneOptions = {
    fixture: SESSION_ONE,
    campaignName: 'Lantern Wake',
  },
): Promise<SessionOneRun> {
  const key = <T extends string>(name: string): T => fixtureUuid<T>(fixture, name);
  const campaignId = key<CampaignId>('campaign');
  const base = { campaignId, actor: PLAYER };

  // --- The launch (D-205) -------------------------------------------------
  // The golden launch through HTTP: the campaign, its truths, the crew, the
  // ship, the Outlands, and Session 1 begun by activation at Deepwater
  // Anchorage, whose first beat is the vow Vesna swears.
  const launch = await playLanternWakeLaunch(sql, { fixture, campaignId, campaignName });
  const { vesna, rook, juno } = launch.characters;
  const { anchorage, drift, relay } = launch.locations;
  const { sessionId, vowId } = launch;

  const ai = new StubProvider({
    fallback: () => {
      throw new Error(`Fixture ${fixture} made an AI call it did not script.`);
    },
  });
  // Passes every passage: the scripted passages are written to pass D-128.
  const checker = new StubProvider();

  const move = async (
    label: string,
    request: {
      readonly moveId: MoveId;
      readonly actorCharacterId: CharacterId;
      readonly stat: StatId;
      readonly actionText: string;
    },
    dice: readonly [number, readonly [number, number]],
    expected: OutcomeTier,
  ) => {
    const rng = actionRoll(dice[0], dice[1]);
    const invoked = await invokeMove(sql, {
      ...base,
      commandId: key(`${label}:move`),
      moveId: request.moveId,
      actorCharacterId: request.actorCharacterId,
      using: { using: 'stat', stat: request.stat },
      adds: [],
      actionText: request.actionText,
      rng,
    });
    if (invoked.roll.tier !== expected || rng.remaining !== 0) {
      throw new Error(
        `Fixture ${fixture}, ${label}: scripted a ${expected}, the rules scored ` +
          `${invoked.roll.tier} with ${rng.remaining} die/dice left over.`,
      );
    }
    return invoked;
  };

  // Passages are scripted as D-127 segments and pass its checks like any
  // other: a character acts only in a segment citing their declared action
  // (F2, after the move itself at F1), and world segments name no one.
  const narrate = async (
    label: string,
    segments: readonly (readonly [
      about: string,
      character: string | null,
      basis: readonly string[],
      text: string,
    ])[],
  ) => {
    ai.enqueue({
      kind: 'structured',
      value: {
        segments: segments.map(([about, character, basis, text]) => ({
          about,
          character,
          basis,
          text,
        })),
      },
    });
    const prepared = await prepareBeatNarration(sql, {
      ...base,
      commandId: key(`${label}:narration`),
      afterCommandId: key(`${label}:move`),
    });
    if (prepared.kind !== 'run') {
      throw new Error(`Fixture ${fixture}, ${label}: the beat was already narrated.`);
    }
    const result = await runBeatNarration(sql, ai, checker, prepared, {
      delta: () => {},
      reset: () => {},
    });
    if (!result.ok) {
      throw new Error(`Fixture ${fixture}, ${label}: narration failed — ${result.message}`);
    }
  };

  await move(
    'juno-archive',
    {
      moveId: GATHER_INFORMATION,
      actorCharacterId: juno,
      stat: 'wits',
      actionText:
        "Juno digs the Meridian's Hope distress beacon out of the anchorage's signal archive.",
    },
    [2, [3, 8]],
    'weak_hit',
  );
  // D-143: a Gather Information weak hit calls for a complication before it is narrated.
  await setComplication(sql, {
    ...base,
    commandId: key('juno-archive:complication'),
    moveCommandId: key('juno-archive:move'),
    text: 'The beacon in the archive is not the original: something has been repeating it.',
  });
  await narrate('juno-archive', [
    ['world', null, [], "The anchorage's archive is a landfill of half-corrupted captures."],
    ['character_does', 'Juno', ['F2'], 'Juno digs through it for the beacon.'],
    [
      'world',
      null,
      ['F3'],
      "It is there, looping under forty years of static: the Meridian's Hope, still calling. " +
        'But the capture is clipped, and whoever filed it scrubbed the origin coordinates on purpose.',
    ],
  ]);

  await move(
    'vesna-triangulate',
    {
      moveId: GATHER_INFORMATION,
      actorCharacterId: vesna,
      stat: 'wits',
      actionText: "Vesna runs the clipped signal against the Lantern Wake's star charts.",
    },
    [5, [4, 2]],
    'strong_hit',
  );
  await narrate('vesna-triangulate', [
    [
      'character_does',
      'Vesna',
      ['F2'],
      "Vesna layers the fragment over the Lantern Wake's charts until the drift in the signal " +
        'lines up with something real.',
    ],
    [
      'world',
      null,
      ['F3'],
      "It isn't coming from the colony ship at all. It is being repeated by Varga Relay, a " +
        'station on the far side of Kessel Drift that has been dark for a generation.',
    ],
  ]);

  // Vesna secures her advantage before the Drift, taking the +1 rather than
  // momentum: the swear's +2 came first (D-205), and the Drift's roll spends
  // the +1, so session 1 still ends at Vesna +7 and nothing carries forward.
  const advantage = await move(
    'vesna-approach',
    {
      moveId: SECURE_AN_ADVANTAGE,
      actorCharacterId: vesna,
      stat: 'edge',
      actionText: "Vesna plots a line through the Drift's slow currents before committing to it.",
    },
    [3, [2, 9]],
    'weak_hit',
  );
  if (advantage.pendingChoice === undefined) {
    throw new Error(`Fixture ${fixture}, vesna-approach: expected a weak-hit choice.`);
  }
  await applyMoveChoice(sql, {
    ...base,
    commandId: key('vesna-approach:choice'),
    rollEventId: advantage.pendingChoice.rollEventId,
    choiceId: advantage.pendingChoice.choiceId,
    optionIds: ['bonus'],
  });
  await narrate('vesna-approach', [
    ['character_does', 'Vesna', ['F2'], "Vesna plots a line through the Drift's slow currents."],
    [
      'world',
      null,
      ['F3'],
      'The ice moves in long, lazy tides. There is a gap in it, if the ship is quick.',
    ],
  ]);

  await move(
    'vesna-drift',
    {
      moveId: FACE_DANGER,
      actorCharacterId: vesna,
      stat: 'edge',
      actionText:
        "Vesna threads the Lantern Wake through the ice of Kessel Drift and into the relay's sensor shadow.",
    },
    [4, [5, 1]],
    'strong_hit',
  );
  await narrate('vesna-drift', [
    [
      'character_does',
      'Vesna',
      ['F2'],
      "Vesna threads the Lantern Wake through the Drift and tucks it into the relay's blind side.",
    ],
    [
      'world',
      null,
      ['F3'],
      'Ice grinds along the hull plating and slides away. Close enough now to see the scorched ' +
        'docking collar of Varga Relay, and the one row of windows that are not dark.',
    ],
  ]);

  // D-146's fixture exception: the crew reaches the relay, and the scene
  // follows them there, so session 2 carries it forward.
  const relaySceneId = key<SceneId>('scene:relay');
  await appendCommand(sql, {
    ...base,
    commandId: key('scene:relay'),
    kind: 'scene.start',
    events: [
      {
        type: 'scene.started',
        payload: { sceneId: relaySceneId, title: 'The derelict relay station', locationId: relay },
        sessionId,
        sceneId: relaySceneId,
      },
    ],
  });

  // --- Ending session 1 (D-149) -------------------------------------------
  // The Guide's proposal, scripted, then committed unedited.
  const summary =
    "The crew of the Lantern Wake found the Meridian's Hope distress beacon in the " +
    'Deepwater Anchorage archive. Vesna traced it to Varga Relay, a derelict station at ' +
    'the edge of the sector that is repeating the signal, and brought the ship through ' +
    'Kessel Drift to hold in the relay’s sensor shadow.';
  const openThreads = [
    'Who scrubbed the beacon’s origin coordinates, and why?',
    'Why is a dead relay still repeating the signal?',
    'One row of windows on Varga Relay is lit.',
  ];
  ai.enqueue({ kind: 'structured', value: { summary, openThreads } });
  const proposal = await proposeSessionSummary(sql, ai, checker, {
    ...base,
    commandId: key('session:1:summary'),
  });
  if (!proposal.ok) {
    throw new Error(`Fixture ${fixture}: the session summary failed — ${proposal.message}`);
  }
  await endSession(sql, {
    ...base,
    commandId: key('session:1:end'),
    proposalEventId: proposal.eventId,
    summary,
    openThreads,
  });

  return {
    campaignId,
    sessionId,
    characters: { vesna, rook, juno },
    vowId,
    locations: { anchorage, drift, relay },
  };
}
