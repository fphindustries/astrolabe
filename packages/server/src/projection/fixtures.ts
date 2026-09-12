import type { CharacterId } from '@astrolabe/rules';
import type { AstrolabeEvent, EventType, PayloadFor } from '@astrolabe/shared';
import {
  AI_ACTOR,
  CLOCK_TRACK,
  JUNO,
  PLAYER_ACTOR,
  ROOK,
  SCENE_ID,
  SESSION_ID,
  STATION,
  SURVIVOR,
  VESNA,
  VOW_TRACK,
  testEvent,
  type EventOverrides,
} from '@astrolabe/shared/test-fixtures';

/**
 * A log builder for the projector's tests.
 *
 * Sequence numbers, event ids and command ids are assigned in order as
 * events are added, so a test states the events it cares about and nothing
 * else. That matters here more than usual: these tests are mostly of the
 * form "given this sequence, expect this state", and hand-built envelopes
 * would bury the sequence under bookkeeping.
 */
export class LogBuilder {
  private readonly events: AstrolabeEvent[] = [];

  add<T extends EventType>(
    type: T,
    payload: PayloadFor<T>,
    overrides: Omit<EventOverrides, 'seq'> = {},
  ): this {
    this.events.push(testEvent(type, payload, { ...overrides, seq: this.events.length + 1 }));
    return this;
  }

  /** The event added at 1-based position `seq`. */
  at(seq: number): AstrolabeEvent {
    const event = this.events[seq - 1];
    if (event === undefined) {
      throw new Error(`No event at seq ${seq}`);
    }
    return event;
  }

  /**
   * The event just added. Prefer this to `at(n)` when a test needs to refer
   * back to something it appended: counting positions couples the test to
   * the prelude's length, which is how the first draft of the void tests
   * ended up voiding the wrong event and still passing its own assertions.
   */
  last(): AstrolabeEvent {
    return this.at(this.events.length);
  }

  get length(): number {
    return this.events.length;
  }

  build(): readonly AstrolabeEvent[] {
    return [...this.events];
  }
}

export function log(): LogBuilder {
  return new LogBuilder();
}

const METERS = {
  health: { value: 5, min: 0, max: 5 },
  spirit: { value: 5, min: 0, max: 5 },
  supply: { value: 5, min: 0, max: 5 },
} as const;

export function character(id: CharacterId, name: string, momentum: number) {
  return {
    characterId: id,
    name,
    callsign: name.split(' ')[0] ?? name,
    stats: { edge: 2, heart: 2, iron: 2, shadow: 2, wits: 2 },
    meters: METERS,
    momentum,
    assets: [],
  } satisfies PayloadFor<'character.created'>;
}

/**
 * The golden session's opening position: the campaign, the crew with their
 * stated momentum, session 2 and its scene, the active vow, and the
 * survivor NPC Beat 6 establishes.
 */
export function goldenSessionPrelude(): LogBuilder {
  return log()
    .add('campaign.created', {
      name: 'Lantern Wake',
      settings: { narrationLatitude: 'color', narrationLength: 'standard', rerollCap: 2 },
    })
    .add('character.created', character(VESNA, 'Vesna Kade', 7))
    .add('character.created', character(ROOK, 'Rook Ilari', 2))
    .add('character.created', character(JUNO, 'Juno Marr', 3))
    .add('session.began', { sessionId: SESSION_ID, number: 2 })
    .add('scene.started', { sceneId: SCENE_ID, title: 'The relay station', locationId: STATION })
    .add('track.created', {
      kind: 'vow',
      trackId: VOW_TRACK,
      title: "Recover the flight recorder of Meridian's Hope",
      rank: 'formidable',
    });
}

export { AI_ACTOR, CLOCK_TRACK, JUNO, PLAYER_ACTOR, ROOK, SCENE_ID, SESSION_ID };
export { STATION, SURVIVOR, VESNA, VOW_TRACK };
