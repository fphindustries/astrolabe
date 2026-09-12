import type { CharacterId, TrackId } from '@astrolabe/rules';

import type { EnvelopeFields } from './envelope.js';
import type { AstrolabeEvent, EventType, PayloadFor } from './events/index.js';
import {
  LOCAL_PLAYER_ID,
  type CampaignId,
  type CommandId,
  type EntityId,
  type EventId,
  type SceneId,
  type SessionId,
} from './ids.js';

/**
 * Fixture helpers for tests in this package and in `server`.
 *
 * Kept in `src` rather than a test file so the projector's own tests can
 * import them: building a valid envelope by hand for every case would bury
 * what each test is actually asserting.
 */

export const CAMPAIGN_ID = '11111111-1111-4111-8111-111111111111' as CampaignId;
export const SESSION_ID = '22222222-2222-4222-8222-222222222222' as SessionId;
export const SCENE_ID = '33333333-3333-4333-8333-333333333333' as SceneId;

export const VESNA = '44444444-4444-4444-8444-444444444444' as CharacterId;
export const ROOK = '55555555-5555-4555-8555-555555555555' as CharacterId;
export const JUNO = '66666666-6666-4666-8666-666666666666' as CharacterId;

export const VOW_TRACK = '77777777-7777-4777-8777-777777777777' as TrackId;
export const CLOCK_TRACK = '88888888-8888-4888-8888-888888888888' as TrackId;
export const SURVIVOR = '99999999-9999-4999-8999-999999999999' as EntityId;

/** Deterministic ids, so a fixture log reads the same on every run. */
export function testEventId(n: number): EventId {
  return `aaaaaaaa-0000-4000-8000-${String(n).padStart(12, '0')}` as EventId;
}

export function testCommandId(n: number): CommandId {
  return `bbbbbbbb-0000-4000-8000-${String(n).padStart(12, '0')}` as CommandId;
}

export interface EventOverrides extends Partial<EnvelopeFields> {
  readonly seq?: number;
}

/**
 * Build one valid event. Defaults put it in the golden session's campaign,
 * session and scene, authored by the system, so a test only states the
 * fields it cares about.
 */
export function testEvent<T extends EventType>(
  type: T,
  payload: PayloadFor<T>,
  overrides: EventOverrides = {},
): AstrolabeEvent {
  const seq = overrides.seq ?? 1;
  return {
    campaignId: CAMPAIGN_ID,
    seq,
    id: testEventId(seq),
    commandId: testCommandId(seq),
    causedBy: null,
    sessionId: SESSION_ID,
    sceneId: SCENE_ID,
    actor: { kind: 'system' },
    subjectCharacterId: null,
    version: 1,
    visibility: 'table',
    occurredAt: '2026-09-12T19:00:00.000Z',
    ...overrides,
    type,
    payload,
  } as AstrolabeEvent;
}

/**
 * The same envelope, but with the payload left `unknown` — for the negative
 * tests, which need to hand the schema a payload the compiler would
 * otherwise reject before zod ever saw it.
 */
export function rawEvent(type: string, payload: unknown, overrides: EventOverrides = {}): unknown {
  const seq = overrides.seq ?? 1;
  return {
    campaignId: CAMPAIGN_ID,
    seq,
    id: testEventId(seq),
    commandId: testCommandId(seq),
    causedBy: null,
    sessionId: SESSION_ID,
    sceneId: SCENE_ID,
    actor: { kind: 'system' },
    subjectCharacterId: null,
    version: 1,
    visibility: 'table',
    occurredAt: '2026-09-12T19:00:00.000Z',
    ...overrides,
    type,
    payload,
  };
}

export const PLAYER_ACTOR = { kind: 'player', playerId: LOCAL_PLAYER_ID } as const;
export const AI_ACTOR = { kind: 'ai' } as const;
export const SYSTEM_ACTOR = { kind: 'system' } as const;
