import type { Actor, CampaignId, CommandId, EventId, SceneId, SessionId } from '@astrolabe/shared';
import { LOCAL_PLAYER_ID } from '@astrolabe/shared';
import type { CharacterId, TrackId } from '@astrolabe/rules';
import type { Sql } from 'postgres';

import { appendCommand, type NewEvent } from '../db/event-store.js';
import {
  overrideState,
  requestNarrationCorrection,
  reviseNarration,
} from '../db/amend-commands.js';
import { uuidv7 } from '../db/uuid.js';
import { voidEvent } from '../db/void-command.js';

/**
 * A scripted run of the golden session's mechanical beats, written through
 * the real store.
 *
 * This is the end-to-end check the milestone has no UI for yet: every part
 * of section 2 — the sequence, idempotent commands, the projector, the
 * narrative log, the void cascade and both amendments — is exercised by
 * playing a session the way the app eventually will.
 *
 * The dice and oracle results are fixed rather than rolled. Nothing here is
 * testing the rules engine, which has its own tests; what is being checked
 * is that a plausible session's worth of events projects to the state the
 * golden session describes.
 *
 * It is also the seed of D-72's committed session fixture: once the AI
 * provider exists, a recap built from this log is a recap built from real
 * events.
 */

const PLAYER: Actor = { kind: 'player', playerId: LOCAL_PLAYER_ID };
const AI: Actor = { kind: 'ai' };
const SYSTEM: Actor = { kind: 'system' };

const id = <T>(): T => uuidv7() as T;

export interface GoldenRun {
  readonly campaignId: CampaignId;
  readonly sessionId: SessionId;
  readonly characters: {
    readonly vesna: CharacterId;
    readonly rook: CharacterId;
    readonly juno: CharacterId;
  };
  readonly clockId: TrackId;
  readonly vowId: TrackId;
  /** Narrated in beat order, so the harness can report what it did. */
  readonly notes: readonly string[];
}

function crew(characterId: CharacterId, name: string, callsign: string, momentum: number) {
  return {
    type: 'character.created',
    payload: {
      characterId,
      name,
      callsign,
      stats: { edge: 2, heart: 2, iron: 3, shadow: 1, wits: 2 },
      meters: {
        health: { value: 5, min: 0, max: 5 },
        spirit: { value: 5, min: 0, max: 5 },
        supply: { value: 5, min: 0, max: 5 },
      },
      momentum,
      assets: [],
    },
  } satisfies NewEvent;
}

/** Play the whole script. Returns the ids a caller needs to inspect the result. */
export async function playGoldenBeats(sql: Sql): Promise<GoldenRun> {
  const campaignId = id<CampaignId>();
  const sessionId = id<SessionId>();
  const sceneId = id<SceneId>();
  const vesna = id<CharacterId>();
  const rook = id<CharacterId>();
  const juno = id<CharacterId>();
  const vowId = id<TrackId>();
  const clockId = id<TrackId>();
  const notes: string[] = [];

  const inSession = { sessionId, sceneId };

  // --- Setup: the campaign, the crew, the vow ---------------------------
  await appendCommand(sql, {
    campaignId,
    commandId: id<CommandId>(),
    kind: 'campaign.create',
    actor: PLAYER,
    createCampaign: { name: 'Lantern Wake' },
    events: [
      {
        type: 'campaign.created',
        payload: {
          name: 'Lantern Wake',
          settings: { narrationLatitude: 'color', narrationLength: 'standard', rerollCap: 2 },
        },
      },
      crew(vesna, 'Vesna Kade', 'Vesna', 7),
      crew(rook, 'Rook Ilari', 'Rook', 2),
      crew(juno, 'Juno Marr', 'Juno', 3),
    ],
  });
  notes.push('Setup — the crew of the Lantern Wake, momentum +7 / +2 / +3.');

  // --- Beat 1: the session opens ----------------------------------------
  await appendCommand(sql, {
    campaignId,
    commandId: id<CommandId>(),
    kind: 'session.begin',
    actor: PLAYER,
    events: [
      { type: 'session.began', payload: { sessionId, number: 2 } },
      {
        type: 'track.created',
        payload: {
          kind: 'vow',
          trackId: vowId,
          title: "Recover the flight recorder of Meridian's Hope",
          rank: 'formidable',
        },
        sessionId,
      },
      {
        type: 'scene.started',
        payload: { sceneId, title: 'The derelict relay station' },
        sessionId,
      },
    ],
  });
  notes.push('Beat 1 — session 2 begins at the relay station, formidable vow active.');

  // --- Beat 3: Juno gathers information, weak hit -----------------------
  await appendCommand(sql, {
    campaignId,
    commandId: id<CommandId>(),
    kind: 'move',
    actor: PLAYER,
    events: [
      {
        type: 'move.invoked',
        payload: {
          moveId: 'move:adventure/gather_information',
          actorCharacterId: juno,
          using: { using: 'stat', stat: 'wits' },
          adds: [{ amount: 2, label: 'wits' }],
          actionText: 'Juno jacks into the docking port and pulls the station logs.',
        },
        ...inSession,
        subjectCharacterId: juno,
      },
      {
        type: 'dice.rolled',
        payload: {
          kind: 'action',
          actionDie: 3,
          adds: [{ amount: 2, label: 'wits' }],
          actionScore: 5,
          challengeDice: [6, 3],
          tier: 'weak_hit',
          isMatch: false,
          rng: { source: 'seeded', seed: 101 },
        },
        ...inSession,
        actor: SYSTEM,
      },
      {
        type: 'state.changed',
        payload: {
          cause: {
            kind: 'move_outcome',
            moveId: 'move:adventure/gather_information',
            tier: 'weak_hit',
          },
          changes: [
            { delta: { kind: 'momentum', characterId: juno, delta: 1 }, clause: '+1 momentum' },
          ],
        },
        ...inSession,
        actor: SYSTEM,
      },
    ],
  });
  notes.push('Beat 3 — Juno: Gather Information, weak hit, +1 momentum.');

  // --- Beat 5: Rook aids Vesna, then Vesna burns momentum ---------------
  await appendCommand(sql, {
    campaignId,
    commandId: id<CommandId>(),
    kind: 'move',
    actor: PLAYER,
    events: [
      {
        type: 'move.invoked',
        payload: {
          moveId: 'move:adventure/secure_an_advantage',
          actorCharacterId: rook,
          // D-62: the flag, not a move of its own.
          aidingAllyId: vesna,
          using: { using: 'stat', stat: 'iron' },
          adds: [{ amount: 3, label: 'iron' }],
          actionText: 'Rook covers the airlock while Vesna runs the scan.',
        },
        ...inSession,
        subjectCharacterId: rook,
      },
      {
        type: 'dice.rolled',
        payload: {
          kind: 'action',
          actionDie: 5,
          adds: [{ amount: 3, label: 'iron' }],
          actionScore: 8,
          challengeDice: [2, 4],
          tier: 'strong_hit',
          isMatch: false,
          rng: { source: 'seeded', seed: 102 },
        },
        ...inSession,
        actor: SYSTEM,
      },
      {
        type: 'state.changed',
        payload: {
          cause: {
            kind: 'move_outcome',
            moveId: 'move:adventure/secure_an_advantage',
            tier: 'strong_hit',
          },
          // Both benefits already resolved to Vesna at write time.
          changes: [
            { delta: { kind: 'momentum', characterId: vesna, delta: 2 }, clause: '+2 momentum' },
            {
              delta: { kind: 'bonus_next_move', characterId: vesna, amount: 1 },
              clause: '+1 on your next move',
            },
          ],
        },
        ...inSession,
        actor: SYSTEM,
      },
    ],
  });
  notes.push(
    'Beat 5 — Rook: Secure an Advantage aiding Vesna, strong hit. Both benefits go to her.',
  );

  const vesnaScan = await appendCommand(sql, {
    campaignId,
    commandId: id<CommandId>(),
    kind: 'move',
    actor: PLAYER,
    events: [
      {
        type: 'move.invoked',
        payload: {
          moveId: 'move:adventure/gather_information',
          actorCharacterId: vesna,
          using: { using: 'stat', stat: 'wits' },
          adds: [
            { amount: 2, label: 'wits' },
            { amount: 1, label: 'bonus from Secure an Advantage' },
          ],
          actionText: "Vesna traces the power draw with the Lantern Wake's sensors.",
        },
        ...inSession,
        subjectCharacterId: vesna,
      },
      {
        type: 'dice.rolled',
        payload: {
          kind: 'action',
          actionDie: 2,
          adds: [
            { amount: 2, label: 'wits' },
            { amount: 1, label: 'bonus from Secure an Advantage' },
          ],
          actionScore: 5,
          challengeDice: [6, 3],
          tier: 'weak_hit',
          isMatch: false,
          // A8: momentum of 9 would beat both dice.
          burnOffer: { wouldBecome: 'strong_hit', momentum: 9, resetsTo: 2 },
          rng: { source: 'seeded', seed: 103 },
        },
        ...inSession,
        actor: SYSTEM,
      },
    ],
  });
  const vesnaRollId = vesnaScan.events[1]?.id as EventId;

  await appendCommand(sql, {
    campaignId,
    commandId: id<CommandId>(),
    kind: 'momentum.burn',
    actor: PLAYER,
    causedBy: vesnaRollId,
    events: [
      {
        type: 'momentum.burned',
        payload: {
          characterId: vesna,
          rollEventId: vesnaRollId,
          tierBefore: 'weak_hit',
          tierAfter: 'strong_hit',
        },
        ...inSession,
        subjectCharacterId: vesna,
      },
      {
        type: 'state.changed',
        payload: {
          cause: { kind: 'momentum_burn' },
          // The reset value is derived at projection time, not stored.
          changes: [{ delta: { kind: 'momentum_reset', characterId: vesna } }],
        },
        ...inSession,
        actor: SYSTEM,
      },
    ],
  });
  notes.push('Beat 5 — Vesna burns momentum to upgrade the weak hit. Momentum resets.');

  // --- Beat 6: the AI establishes the survivor, after a visible reroll ---
  const firstTry = await appendCommand(sql, {
    campaignId,
    commandId: id<CommandId>(),
    kind: 'establish',
    actor: AI,
    events: [
      {
        type: 'entity.established',
        payload: {
          entityId: id(),
          kind: 'npc',
          name: 'Corin Adeyemi',
          fields: { role: 'station chief', disposition: 'hostile' },
          provenance: { establishedBy: 'ai', recipeId: 'recipe:npc', groundedIn: [] },
        },
        ...inSession,
      },
    ],
  });

  // D-18: the result contradicts the evacuation logs, so the AI rerolls it
  // visibly. The discarded entity stays in the log, struck through.
  await voidEvent(sql, {
    campaignId,
    commandId: id<CommandId>(),
    actor: AI,
    targetEventId: firstTry.events[0]?.id as EventId,
    reason: 'a station chief contradicts the evacuation logs Juno pulled',
    kind: 'reroll',
  });

  await appendCommand(sql, {
    campaignId,
    commandId: id<CommandId>(),
    kind: 'establish',
    actor: AI,
    events: [
      {
        type: 'entity.established',
        payload: {
          entityId: id(),
          kind: 'npc',
          name: 'Sura Vance',
          fields: { role: 'life-support technician', disposition: 'wary' },
          provenance: { establishedBy: 'ai', recipeId: 'recipe:npc', groundedIn: [] },
        },
        ...inSession,
      },
    ],
  });
  notes.push('Beat 6 — an NPC is established, after one oracle result is visibly rerolled.');

  // --- Beat 7: the wrong stat, voided and redone ------------------------
  const wrongStat = await appendCommand(sql, {
    campaignId,
    commandId: id<CommandId>(),
    kind: 'move',
    actor: PLAYER,
    events: [
      {
        type: 'move.invoked',
        payload: {
          moveId: 'move:adventure/face_danger',
          actorCharacterId: rook,
          using: { using: 'stat', stat: 'edge' },
          adds: [{ amount: 2, label: 'edge' }],
          actionText: 'Rook forces the sealed bulkhead.',
        },
        ...inSession,
        subjectCharacterId: rook,
      },
      {
        type: 'dice.rolled',
        payload: {
          kind: 'action',
          actionDie: 6,
          adds: [{ amount: 2, label: 'edge' }],
          actionScore: 8,
          challengeDice: [3, 4],
          tier: 'strong_hit',
          isMatch: false,
          rng: { source: 'seeded', seed: 104 },
        },
        ...inSession,
        actor: SYSTEM,
      },
      {
        type: 'state.changed',
        payload: {
          cause: {
            kind: 'move_outcome',
            moveId: 'move:adventure/face_danger',
            tier: 'strong_hit',
          },
          changes: [
            { delta: { kind: 'momentum', characterId: rook, delta: 1 }, clause: '+1 momentum' },
          ],
        },
        ...inSession,
        actor: SYSTEM,
      },
    ],
  });

  await voidEvent(sql, {
    campaignId,
    commandId: id<CommandId>(),
    actor: PLAYER,
    targetEventId: wrongStat.events[1]?.id as EventId,
    reason: 'Rook is forcing the bulkhead, not slipping past it — +iron, not +edge',
  });

  await appendCommand(sql, {
    campaignId,
    commandId: id<CommandId>(),
    kind: 'move',
    actor: PLAYER,
    events: [
      {
        type: 'move.invoked',
        payload: {
          moveId: 'move:adventure/face_danger',
          actorCharacterId: rook,
          using: { using: 'stat', stat: 'iron' },
          adds: [{ amount: 3, label: 'iron' }],
          actionText: 'Rook forces the sealed bulkhead.',
        },
        ...inSession,
        subjectCharacterId: rook,
      },
      {
        type: 'dice.rolled',
        payload: {
          kind: 'action',
          actionDie: 2,
          adds: [{ amount: 3, label: 'iron' }],
          actionScore: 5,
          challengeDice: [8, 6],
          tier: 'miss',
          isMatch: false,
          rng: { source: 'seeded', seed: 105 },
        },
        ...inSession,
        actor: SYSTEM,
      },
    ],
  });

  // Pay the Price chains into Endure Harm; the AI proposed -2 and the
  // player adjusted it to -1 (A13).
  await appendCommand(sql, {
    campaignId,
    commandId: id<CommandId>(),
    kind: 'move',
    actor: PLAYER,
    events: [
      {
        type: 'state.changed',
        payload: {
          cause: { kind: 'move_outcome', moveId: 'move:suffer/endure_harm', tier: 'weak_hit' },
          changes: [
            {
              delta: { kind: 'meter', characterId: rook, meter: 'health', delta: -1 },
              clause: 'Endure Harm',
            },
          ],
        },
        ...inSession,
        actor: SYSTEM,
      },
    ],
  });
  notes.push('Beat 7 — the +edge roll is voided and redone with +iron: a miss, and -1 health.');

  // --- Beat 8: the AI ticks a clock, with its reason --------------------
  await appendCommand(sql, {
    campaignId,
    commandId: id<CommandId>(),
    kind: 'clock',
    actor: AI,
    events: [
      {
        type: 'track.created',
        payload: {
          kind: 'clock',
          trackId: clockId,
          title: 'Station power failing',
          segments: 4,
          cause: {
            kind: 'ai_judgement',
            reason: 'forcing the bulkhead tripped emergency load-shedding',
          },
        },
        ...inSession,
      },
      {
        type: 'track.advanced',
        payload: {
          trackId: clockId,
          ticks: 1,
          cause: {
            kind: 'ai_judgement',
            reason: 'forcing the bulkhead tripped emergency load-shedding',
          },
        },
        ...inSession,
      },
    ],
  });
  notes.push('Beat 8 — the AI creates and ticks a four-segment clock, with a stated reason.');

  // --- Beat 9: a narration correction and a manual override -------------
  const narrated = await appendCommand(sql, {
    campaignId,
    commandId: id<CommandId>(),
    kind: 'narrate',
    actor: AI,
    events: [
      {
        type: 'narration.written',
        payload: {
          role: 'beat',
          text: 'The conduit ruptures and Rook, shaken, backs away from the sparks.',
          groundedIn: [],
        },
        ...inSession,
      },
      {
        type: 'ai.completed',
        payload: {
          provider: 'anthropic',
          model: 'claude-opus-5',
          purpose: 'beat',
          inputTokens: 1840,
          outputTokens: 210,
        },
        ...inSession,
      },
    ],
  });
  const passageId = narrated.events[0]?.id as EventId;

  const flagged = await requestNarrationCorrection(sql, {
    campaignId,
    commandId: id<CommandId>(),
    actor: PLAYER,
    targetEventId: passageId,
    note: 'Rook is a veteran — annoyed rather than rattled.',
  });
  await reviseNarration(sql, {
    campaignId,
    commandId: id<CommandId>(),
    actor: AI,
    targetEventId: passageId,
    text: 'The conduit ruptures. Rook shakes the sparks off his sleeve and swears at the door.',
    causedBy: flagged.events[0]?.id as EventId,
  });

  await overrideState(sql, {
    campaignId,
    commandId: id<CommandId>(),
    actor: PLAYER,
    target: { kind: 'momentum', characterId: juno },
    to: 5,
    reason: 'a ruling from last session left this one too low',
  });
  notes.push('Beat 9 — a passage is corrected, and Juno’s momentum is overridden by hand.');

  return {
    campaignId,
    sessionId,
    characters: { vesna, rook, juno },
    clockId,
    vowId,
    notes,
  };
}
