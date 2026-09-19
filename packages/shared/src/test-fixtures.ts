import type { CharacterId, TrackId } from '@astrolabe/rules';

import type { EnvelopeFields } from './envelope.js';
import {
  EVENT_TYPES,
  type AstrolabeEvent,
  type EventType,
  type PayloadFor,
} from './events/index.js';
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
export const STATION = 'aaaa0000-aaaa-4aaa-8aaa-aaaaaaaaaaaa' as EntityId;

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

/**
 * One valid payload for every event type in the catalogue, drawn from the
 * golden session wherever a beat supplies one.
 *
 * Typed as `{ [T in EventType]: PayloadFor<T> }` rather than loosely, so
 * adding an event type fails the compile here until it has a sample — which
 * is what lets tests assert properties across the *whole* catalogue instead
 * of across whichever types someone remembered.
 */
export const SAMPLE_PAYLOADS: { [T in EventType]: PayloadFor<T> } = {
  'campaign.created': {
    name: 'The Lantern Wake',
    settings: { narrationLatitude: 'color', narrationLength: 'standard', rerollCap: 2 },
  },
  'character.created': {
    characterId: VESNA,
    name: 'Vesna Kade',
    callsign: 'Vesna',
    stats: { edge: 3, heart: 2, iron: 1, shadow: 2, wits: 1 },
    meters: {
      health: { value: 5, min: 0, max: 5 },
      spirit: { value: 5, min: 0, max: 5 },
      supply: { value: 5, min: 0, max: 5 },
    },
    momentum: 7,
    assets: ['asset:path/pilot'],
    pronouns: 'she/her',
  },
  'character.proposed': {
    concept: 'A pilot who flew evacuation runs and never stopped running.',
    name: {
      value: 'Vesna Kade',
      reason: 'Adapted from the rolled given name.',
      groundedIn: [testEventId(90)],
    },
    callsign: { value: 'Vesna', reason: 'Her crew shortened it.', groundedIn: [testEventId(91)] },
    stats: {
      value: { edge: 3, heart: 2, iron: 1, shadow: 2, wits: 1 },
      reason: 'A pilot lives on edge.',
    },
    assets: [{ assetId: 'asset:path/ace', reason: 'She flies.' }],
    backgroundVow: {
      title: 'Find the ship that left us behind',
      rank: 'dangerous',
      reason: 'From the concept.',
    },
    hooks: [
      {
        text: 'She still hears the evacuation channel.',
        reason: 'From the backstory prompt.',
        groundedIn: [testEventId(92)],
      },
    ],
  },
  'session.began': { sessionId: SESSION_ID, number: 2 },
  'session.ended': {
    summary: 'The crew boarded the relay station and found it was not empty.',
    openThreads: ["the survivor's intent", 'the failing power', 'where the recorder is'],
  },
  'scene.started': { sceneId: SCENE_ID, title: 'The relay station', locationId: STATION },
  'move.invoked': {
    moveId: 'move:adventure/face_danger',
    actorCharacterId: ROOK,
    using: { using: 'stat', stat: 'iron' },
    adds: [{ amount: 2, label: 'iron' }],
    actionText: 'Rook forces the sealed bulkhead.',
  },
  'dice.rolled': {
    kind: 'action',
    actionDie: 3,
    adds: [{ amount: 2, label: 'iron' }],
    actionScore: 5,
    challengeDice: [8, 4],
    tier: 'miss',
    isMatch: false,
    rng: { source: 'seeded', seed: 7 },
  },
  'momentum.burned': {
    characterId: VESNA,
    rollEventId: testEventId(5),
    tierBefore: 'weak_hit',
    tierAfter: 'strong_hit',
  },
  'move.choice_made': {
    moveId: 'move:suffer/endure-harm',
    tier: 'weak_hit',
    choiceId: 'eh-weak',
    optionIds: ['lose-momentum-for-health'],
    rollEventId: testEventId(5),
  },
  'move.method_chosen': {
    moveId: 'move:suffer/pay_the_price',
    optionId: 'table',
  },
  'move.chained': {
    fromMoveId: 'move:adventure/face_danger',
    toMoveId: 'move:suffer/pay_the_price',
    mode: 'offer',
    reason: 'miss',
  },
  'oracle.rolled': {
    oracleId: 'oracle:moves/pay_the_price',
    roll: 78,
    rowText: 'You are harmed.',
  },
  'amount.proposed': {
    moveId: 'move:suffer/endure-harm',
    characterId: ROOK,
    meter: 'health',
    amount: -2,
    injury: "A ruptured conduit sprays sparks across Rook's arm.",
    reason: 'A serious burn.',
  },
  'amount.committed': {
    moveId: 'move:suffer/endure-harm',
    characterId: ROOK,
    meter: 'health',
    amount: -1,
    proposalEventId: testEventId(93),
  },
  'state.changed': {
    cause: {
      kind: 'move_outcome',
      moveId: 'move:adventure/gather_information',
      tier: 'weak_hit',
    },
    changes: [
      { delta: { kind: 'momentum', characterId: JUNO, delta: 1 }, clause: 'take +1 momentum' },
    ],
  },
  'state.overridden': {
    target: { kind: 'momentum', characterId: JUNO },
    from: 3,
    to: 4,
    reason: 'a ruling from last session left this one too low',
  },
  'track.created': {
    kind: 'clock',
    trackId: CLOCK_TRACK,
    title: 'Station power failing',
    segments: 4,
    cause: {
      kind: 'ai_judgement',
      reason: 'forcing the bulkhead tripped emergency load-shedding',
    },
  },
  'track.advanced': {
    trackId: CLOCK_TRACK,
    ticks: 1,
    cause: {
      kind: 'ai_judgement',
      reason: 'forcing the bulkhead tripped emergency load-shedding',
    },
  },
  'track.revised': {
    trackId: VOW_TRACK,
    title: "Recover the flight recorder of Meridian's Hope, whatever it costs",
    rank: 'formidable',
  },
  'entity.established': {
    entityId: SURVIVOR,
    kind: 'npc',
    name: 'Sura Vance',
    fields: { role: 'technician', disposition: 'wary' },
    provenance: {
      establishedBy: 'ai',
      recipeId: 'recipe:npc',
      groundedIn: [testEventId(11), testEventId(12)],
    },
  },
  'narration.written': {
    role: 'beat',
    text: 'The bulkhead gives with a shriek of tortured metal.',
    groundedIn: [],
  },
  'narration.correction_requested': {
    targetEventId: testEventId(20),
    note: 'Rook is a veteran — annoyed rather than rattled.',
  },
  'narration.revised': {
    targetEventId: testEventId(20),
    text: 'The bulkhead gives, and Rook shakes the sparks off his sleeve, annoyed.',
  },
  'narration.withdrawn': {
    role: 'beat',
    attempt: 1,
    checker: 'authority_check',
    model: 'claude-haiku-4-5',
    latitude: 'color',
    rejectedText: 'The pain gets folded and stowed the way everything has been for thirty years.',
    violations: [
      {
        rule: 'player_interior',
        character: 'Rook',
        segment: 0,
        quote: 'the way everything has been for thirty years',
        why: 'A disposition with a history.',
      },
    ],
  },
  'event.voided': {
    targetEventId: testEventId(4),
    kind: 'player_void',
    reason: 'Rook is forcing the bulkhead, not slipping past it',
    cascaded: [testEventId(3), testEventId(4)],
  },
  'ai.completed': {
    provider: 'anthropic',
    model: 'claude-opus-5',
    purpose: 'beat',
    inputTokens: 1200,
    outputTokens: 180,
    latencyMs: 900,
  },
  'ai.failed': {
    provider: 'anthropic',
    model: 'claude-opus-5',
    purpose: 'beat',
    errorKind: 'unavailable',
    message: 'The provider could not be reached.',
    attempts: 1,
  },
  'truth.set': {
    oracleId: 'oracle:cataclysm',
    source: 'rolled',
    text: 'The Sun Plague extinguished the stars in our home galaxy.',
    roll: 12,
  },
  'sector.route_added': {
    fromLocationId: STATION,
    toLocationId: SURVIVOR,
  },
  'incident.proposed': {
    options: [
      {
        title: 'Recover the flight recorder of a lost colony ship',
        rank: 'formidable',
        situation: 'A colony ship went silent on a crossing, and its recorder beacon still pings.',
        reason: 'Adapted from the rolled incident, set on the relay route.',
        groundedIn: [testEventId(92)],
        drawsOn: { truths: ['oracle:cataclysm'], locations: [STATION], characters: [VESNA] },
      },
    ],
  },
  'move.suggested': {
    actorCharacterId: VESNA,
    actionText: 'Juno jacks into the docking port and pulls the station logs.',
    moveId: 'move:adventure/gather-information',
    rollOption: { using: 'stat', stat: 'wits' },
    triggerText: 'When you search for clues, conduct an investigation',
    reason: 'Pulling the logs is an investigation.',
    confidence: 'high',
  },
  'actions.suggested': {
    suggestions: [
      {
        characterId: VESNA,
        actionText: "Vesna traces the power draw with the Lantern Wake's sensors.",
        moveId: 'move:adventure/gather-information',
        reason: 'The live circuit is the only sign anyone is aboard.',
        anchors: [
          'The player set a complication: one life-support circuit is still drawing power.',
        ],
      },
      {
        characterId: ROOK,
        actionText: 'Rook secures the airlock before anyone goes deeper.',
        moveId: 'move:adventure/secure-an-advantage',
        reason: 'The crew is about to split up inside a derelict.',
        anchors: ['The scene: The derelict relay station, at Varga Relay.'],
      },
      {
        characterId: JUNO,
        actionText: 'The crew pushes toward the station core.',
        moveId: 'move:exploration/undertake-an-expedition',
        reason: 'The flight recorder is somewhere past the core.',
        anchors: ['Vow (formidable) "Recover the flight recorder": 0 of 10 progress boxes.'],
      },
    ],
  },
  'session.summary_proposed': {
    summary: 'The crew boarded the relay station and found it was not empty.',
    openThreads: ["the survivor's intent", 'the failing power'],
  },
  'move.trigger_noted': {
    moveId: 'move:adventure/secure-an-advantage',
    actionText: 'Rook kicks the drone off the ledge.',
    triggerText: 'When you assess a situation, make preparations',
    reason: 'Kicking the drone away is acting against a threat, not preparing.',
    confidence: 'medium',
  },
  'complication.offered': {
    options: [
      {
        text: 'The station was abandoned, yet one life-support circuit is still drawing power.',
        groundedIn: [testEventId(1), testEventId(2)],
      },
    ],
  },
  'complication.set': {
    text: 'The station was abandoned, yet one life-support circuit is still drawing power.',
    source: 'offered',
    offeredEventId: testEventId(3),
    optionIndex: 0,
  },
  'launch.draft_saved': { section: 'foundation', snapshot: { premise: 'A distant signal.' } },
  'creation.proposed': {
    targetKind: 'truth',
    targetId: 'oracle:cataclysm',
    proposal: { truthId: 'oracle:cataclysm', text: 'A slow collapse, not one blast.' },
    rationale: 'Grounded.',
    groundedIn: [],
  },
  'campaign.foundation_set': {
    premise: 'A distant signal.',
    settings: { narrationLatitude: 'color', narrationLength: 'standard', rerollCap: 2 },
    provenance: 'player_written',
    groundedIn: [],
  },
  'truth.decided': {
    truthId: 'oracle:cataclysm',
    resolution: 'leave_open',
    provenance: 'player_written',
    groundedIn: [],
  },
  'character.revised': {
    characterId: VESNA,
    character: {
      characterId: VESNA,
      name: 'Vesna Kade',
      callsign: 'Vesna',
      stats: { edge: 3, heart: 2, iron: 1, shadow: 2, wits: 1 },
      meters: {
        health: { value: 5, min: 0, max: 5 },
        spirit: { value: 5, min: 0, max: 5 },
        supply: { value: 5, min: 0, max: 5 },
      },
      momentum: 2,
      assets: ['asset:path/pilot'],
      appearance: 'Tall',
      backstory: { kind: 'written', text: 'A past.' },
      backgroundVow: { title: 'Find answers', rank: 'dangerous' },
    },
    provenance: 'player_written',
    groundedIn: [],
  },
  'character.removed': {
    characterId: VESNA,
    supersedesEventId: testEventId(1),
    reason: 'Replaced.',
  },
  'starship.established': {
    starshipId: STATION,
    name: 'Lantern Wake',
    appearance: 'Worn hull',
    history: 'Salvaged',
    quirks: ['Late clocks'],
    integrity: { value: 5, min: 0, max: 5 },
    assetId: 'asset:command-vehicle/starship',
    provenance: 'player_written',
    groundedIn: [],
  },
  'starship.revised': {
    starship: {
      starshipId: STATION,
      name: 'Lantern Wake',
      appearance: 'Worn hull',
      history: 'Salvaged',
      quirks: ['Late clocks'],
      integrity: { value: 5, min: 0, max: 5 },
      assetId: 'asset:command-vehicle/starship',
    },
    provenance: 'player_written',
    groundedIn: [],
  },
  'sector.configured': {
    sectorId: SURVIVOR,
    name: 'Outlands',
    region: 'outlands',
    baseline: { settlements: 3, passages: 2 },
    provenance: 'player_written',
    groundedIn: [],
  },
  'location.added': {
    kind: 'settlement',
    id: STATION,
    name: 'Deepwater Anchorage',
    location: 'deep_space',
    population: 'Hundreds',
    authority: 'Council',
    projects: ['Repairs'],
    provenance: 'player_written',
    groundedIn: [],
  },
  'location.revised': {
    kind: 'other',
    id: STATION,
    name: 'Kessel Drift',
    description: 'Ice and wreckage',
    provenance: 'player_written',
    groundedIn: [],
  },
  'location.removed': {
    locationId: STATION,
    supersedesEventId: testEventId(1),
    reason: 'Duplicate.',
  },
  'route.added': { from: STATION, to: SURVIVOR, provenance: 'player_written', groundedIn: [] },
  'route.revised': {
    from: STATION,
    to: { kind: 'off_map', label: 'The Reach' },
    provenance: 'player_written',
    groundedIn: [],
  },
  // `supersedesEventId` names the event that *added* the route. `testEventId(1)`
  // is not arbitrary: mutates-state.test.ts appends its `route.added` setup
  // under exactly this id so the removal has something to match.
  'route.removed': { supersedesEventId: testEventId(1), reason: 'Duplicate.' },
  'sector.layout_changed': { coordinates: { [STATION]: { x: 1, y: 2 } } },
  'starting_settlement.selected': { settlementId: STATION },
  'trouble.established': {
    troubleId: SURVIVOR,
    kind: 'sector',
    text: 'A signal is wrong.',
    provenance: 'player_written',
    groundedIn: [],
  },
  'trouble.revised': {
    troubleId: SURVIVOR,
    kind: 'sector',
    text: 'A signal is wrong.',
    provenance: 'player_written',
    groundedIn: [],
  },
  'connection.established': {
    connectionId: SURVIVOR,
    npcId: STATION,
    npcName: 'Sura',
    role: 'Broker',
    rank: 'dangerous',
    trackId: VOW_TRACK,
    participants: [VESNA],
    automaticStrongHit: true,
    provenance: 'player_written',
    groundedIn: [],
  },
  'connection.revised': {
    connectionId: SURVIVOR,
    npcId: STATION,
    npcName: 'Sura',
    role: 'Broker',
    rank: 'dangerous',
    trackId: VOW_TRACK,
    participants: [VESNA],
    automaticStrongHit: true,
    provenance: 'player_written',
    groundedIn: [],
  },
  'incident.accepted': {
    incidentId: SURVIVOR,
    text: 'Recover the recorder.',
    citedFactEventIds: [],
    rank: 'formidable',
    rollerId: VESNA,
    participants: [VESNA],
    openingScene: { title: 'A beacon', locationId: STATION },
    provenance: 'player_written',
    groundedIn: [],
  },
  'incident.revised': {
    incidentId: SURVIVOR,
    text: 'Recover the recorder.',
    citedFactEventIds: [],
    rank: 'formidable',
    rollerId: VESNA,
    participants: [VESNA],
    openingScene: { title: 'A beacon', locationId: STATION },
    provenance: 'player_written',
    groundedIn: [],
  },
  'campaign.activated': {
    launchFactEventIds: [testEventId(1)],
    sessionId: SESSION_ID,
    sceneId: SCENE_ID,
    pendingVow: {
      incidentId: SURVIVOR,
      rank: 'formidable',
      rollerId: VESNA,
      participants: [VESNA],
    },
    readinessVersion: 1,
  },
  'launch.fact_amended': {
    subject: 'trouble',
    replacement: {
      kind: 'sector',
      troubleId: SURVIVOR,
      text: 'The relay grid is being jammed, not failing.',
    },
    reason: 'Correction.',
    supersedesEventId: testEventId(1),
  },
};

/** Every sample as a complete, valid event, in catalogue order. */
export function sampleEvents(): readonly AstrolabeEvent[] {
  return EVENT_TYPES.map((type, index) =>
    testEvent(type, SAMPLE_PAYLOADS[type], { seq: index + 1 }),
  );
}
