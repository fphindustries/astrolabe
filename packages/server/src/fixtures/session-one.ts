import type { AssetId, CharacterId, MoveId, OutcomeTier, StatId, TrackId } from '@astrolabe/rules';
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
import {
  addSectorLocation,
  addSectorRoute,
  createCampaign,
  setTruth,
  swearIncitingVow,
} from '../db/campaign-commands.js';
import { createCharacter } from '../db/character-commands.js';
import { appendCommand } from '../db/event-store.js';
import { applyMoveChoice, invokeMove } from '../db/move-commands.js';
import { prepareBeatNarration, runBeatNarration } from '../db/narration-commands.js';

import { fixtureUuid } from './ids.js';
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
 * passages go through beat narration with a scripted stub. Only session
 * begin and end are appended directly, because 9.1 and 9.4 have not built
 * their commands yet. When they land, those two steps should switch over.
 */

export const SESSION_ONE = 'session-1';

export const SESSION_ONE_CAMPAIGN_ID = fixtureUuid<CampaignId>(SESSION_ONE, 'campaign');

const PLAYER: Actor = { kind: 'player', playerId: LOCAL_PLAYER_ID };
const AI: Actor = { kind: 'ai' };

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

  // --- The campaign and its truths ---------------------------------------
  await createCampaign(sql, {
    ...base,
    commandId: key('campaign:create'),
    name: campaignName,
    settings: { narrationLatitude: 'color', narrationLength: 'standard', rerollCap: 2 },
  });
  for (const oracle of ['oracle:cataclysm', 'oracle:communities', 'oracle:iron'] as const) {
    await setTruth(sql, {
      ...base,
      commandId: key(`truth:${oracle}`),
      oracleId: oracle as never,
      source: 'picked',
      rowIndex: 0,
    });
  }

  // --- The sector ---------------------------------------------------------
  const location = async (name: string, description: string) =>
    (
      await addSectorLocation(sql, {
        ...base,
        commandId: key(`location:${name}`),
        name,
        description,
      })
    ).locationId;
  const anchorage = await location(
    'Deepwater Anchorage',
    'A ring of lashed-together hulls where the crew trades and refuels.',
  );
  const drift = await location(
    'Kessel Drift',
    'A slow river of broken ice and old wreckage between the anchorage and the rim.',
  );
  const relay = await location(
    'Varga Relay',
    'A derelict relay station at the edge of the sector, dark for a generation.',
  );
  for (const [name, from, to] of [
    ['anchorage-drift', anchorage, drift],
    ['drift-relay', drift, relay],
  ] as const) {
    await addSectorRoute(sql, {
      ...base,
      commandId: key(`route:${name}`),
      fromLocationId: from,
      toLocationId: to,
    });
  }

  // --- The crew and the vow ----------------------------------------------
  const character = async (
    name: string,
    callsign: string,
    stats: Record<StatId, number>,
    assets: readonly string[],
  ) =>
    (
      await createCharacter(sql, {
        ...base,
        commandId: key(`character:${callsign}`),
        draft: { name, callsign, stats, assets: assets as readonly AssetId[] },
      })
    ).characterId;
  const vesna = await character(
    'Vesna Kade',
    'Vesna',
    { edge: 3, heart: 2, iron: 1, shadow: 1, wits: 2 },
    ['asset:path/ace', 'asset:path/navigator', 'asset:module/sensor-array'],
  );
  const rook = await character(
    'Rook Ilari',
    'Rook',
    { edge: 2, heart: 1, iron: 3, shadow: 1, wits: 2 },
    ['asset:path/veteran', 'asset:path/armored', 'asset:path/gunner'],
  );
  const juno = await character(
    'Juno Marr',
    'Juno',
    { edge: 1, heart: 1, iron: 2, shadow: 2, wits: 3 },
    ['asset:path/gearhead', 'asset:path/scavenger', 'asset:companion/utility-bot'],
  );

  const { vowTrackId: vowId } = await swearIncitingVow(sql, {
    ...base,
    commandId: key('vow:inciting'),
    title: "Recover the flight recorder of Meridian's Hope",
    rank: 'formidable',
  });

  // --- Session 1 ------------------------------------------------------------
  const sessionId = key<SessionId>('session:1');
  const sceneId = key<SceneId>('scene:anchorage');
  await appendCommand(sql, {
    ...base,
    commandId: key('session:1:begin'),
    kind: 'session.begin',
    events: [
      { type: 'session.began', payload: { sessionId, number: 1 } },
      {
        type: 'scene.started',
        payload: { sceneId, title: 'A beacon at Deepwater Anchorage', locationId: anchorage },
        sessionId,
      },
    ],
  });

  const ai = new StubProvider({
    fallback: () => {
      throw new Error(`Fixture ${fixture} made an AI call it did not script.`);
    },
  });

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

  const narrate = async (label: string, text: string) => {
    ai.enqueue({ kind: 'text', text });
    const prepared = await prepareBeatNarration(sql, {
      ...base,
      commandId: key(`${label}:narration`),
      afterCommandId: key(`${label}:move`),
    });
    if (prepared.kind !== 'run') {
      throw new Error(`Fixture ${fixture}, ${label}: the beat was already narrated.`);
    }
    const result = await runBeatNarration(sql, ai, prepared, { delta: () => {}, reset: () => {} });
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
  await narrate(
    'juno-archive',
    "The anchorage's archive is a landfill of half-corrupted captures, and Juno works it with a " +
      "salvager's patience. The beacon is there, looping under forty years of static: the " +
      "Meridian's Hope, still calling. But the capture is clipped, and whoever filed it scrubbed " +
      'the origin coordinates on purpose.',
  );

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
  await narrate(
    'vesna-triangulate',
    "Vesna layers the fragment over the Lantern Wake's charts until the drift in the signal lines " +
      "up with something real. It isn't coming from the colony ship at all. It is being repeated " +
      'by Varga Relay, a station on the far side of Kessel Drift that has been dark for a ' +
      'generation.',
  );

  await move(
    'vesna-drift',
    {
      moveId: FACE_DANGER,
      actorCharacterId: vesna,
      stat: 'edge',
      actionText: 'Vesna threads the Lantern Wake through the ice of Kessel Drift.',
    },
    [4, [5, 1]],
    'strong_hit',
  );
  await narrate(
    'vesna-drift',
    'Vesna takes the Lantern Wake into the Drift at a speed Rook calls unreasonable and Juno ' +
      'calls fine. Ice grinds along the hull plating and slides away. The ship comes out the ' +
      'other side clean, with Varga Relay a cold smudge on the forward scopes.',
  );

  const advantage = await move(
    'vesna-approach',
    {
      moveId: SECURE_AN_ADVANTAGE,
      actorCharacterId: vesna,
      stat: 'edge',
      actionText:
        "Vesna parks the Lantern Wake in the relay's sensor shadow before they go closer.",
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
    optionIds: ['momentum'],
  });
  await narrate(
    'vesna-approach',
    "Vesna tucks the Lantern Wake behind a tumbling slab of ice in the relay's blind side. From " +
      'there the station is close enough to see the scorched docking collar and the one row of ' +
      'windows that are not dark.',
  );

  // --- Ending session 1 -----------------------------------------------------
  await appendCommand(sql, {
    ...base,
    commandId: key('session:1:end'),
    kind: 'session.end',
    events: [
      {
        type: 'session.ended',
        payload: {
          summary:
            "The crew of the Lantern Wake found the Meridian's Hope distress beacon in the " +
            'Deepwater Anchorage archive. Vesna traced it to Varga Relay, a derelict station at ' +
            'the edge of the sector that is repeating the signal, and brought the ship through ' +
            'Kessel Drift to hold in the relay’s sensor shadow.',
          openThreads: [
            'Who scrubbed the beacon’s origin coordinates, and why?',
            'Why is a dead relay still repeating the signal?',
            'One row of windows on Varga Relay is lit.',
          ],
        },
        sessionId,
        actor: AI,
      },
    ],
  });

  return {
    campaignId,
    sessionId,
    characters: { vesna, rook, juno },
    vowId,
    locations: { anchorage, drift, relay },
  };
}
