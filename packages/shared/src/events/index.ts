import * as z from 'zod';

import { EnvelopeFieldsSchema, type EnvelopeFields } from '../envelope.js';
import type { DeepMutable, DeepReadonly } from '../readonly.js';

import { AiCompletedSchema, AiFailedSchema } from './ai.js';
import { AmountCommittedSchema, AmountProposedSchema } from './amount.js';
import { CampaignCreatedSchema } from './campaign.js';
import { ComplicationOfferedSchema, ComplicationSetSchema } from './complication.js';
import { CharacterCreatedSchema, CharacterProposedSchema } from './character.js';
import { EntityEstablishedSchema } from './entity.js';
import { IncidentProposedSchema } from './incident.js';
import {
  DiceRolledSchema,
  MomentumBurnedSchema,
  MoveChainedSchema,
  MoveChoiceMadeSchema,
  MoveInvokedSchema,
  MoveMethodChosenSchema,
  MoveSuggestedSchema,
  ActionsSuggestedSchema,
  MoveTriggerNotedSchema,
} from './move.js';
import {
  NarrationCorrectionRequestedSchema,
  NarrationRevisedSchema,
  NarrationWithdrawnSchema,
  NarrationWrittenSchema,
} from './narration.js';
import { OracleRolledSchema } from './oracle.js';
import { SceneStartedSchema } from './scene.js';
import { SectorRouteAddedSchema } from './sector.js';
import { SessionBeganSchema, SessionEndedSchema, SessionSummaryProposedSchema } from './session.js';
import { StateChangedSchema, StateOverriddenSchema } from './state.js';
import { TrackAdvancedSchema, TrackCreatedSchema } from './track.js';
import { TruthSetSchema } from './truth.js';
import { EventVoidedSchema } from './void.js';

/**
 * The event catalogue: every type Milestone 1's event log can hold, mapped
 * to the schema that validates its payload.
 *
 * The original eighteen are the spine — what the projector and the
 * section 2 harness need. The rest land with the features that write them,
 * as planned: `truth.set` and `sector.route_added` with campaign setup
 * (4.2, 4.3), the move flow's choices, chains, oracle rolls and committed
 * amounts with group 6, and `amount.proposed` and `ai.failed` with the AI
 * provider (group 7, D-113, D-118), and `character.proposed` with concept-first
 * creation (3.3, D-124), and `narration.withdrawn` with the authority check
 * (7.15, D-128), and `incident.proposed` with AI-proposed inciting incidents
 * (4.6, D-132), and `move.suggested` with the AI move suggestion (7.12,
 * D-135), and `move.trigger_noted` with the trigger-mismatch note (7.13,
 * D-136). The remaining types (complications, the
 * scene header) are designed in `docs/design-event-log.md` and land the
 * same way, so their payloads are shaped by a real caller rather than
 * guessed at a month early.
 *
 * That is safe because this map is the single definition: adding a type
 * here fails the compile at every exhaustive switch over `EventType`, which
 * is the behaviour we want from a projector.
 */
export const PAYLOAD_SCHEMAS = {
  'campaign.created': CampaignCreatedSchema,
  'character.created': CharacterCreatedSchema,
  'character.proposed': CharacterProposedSchema,
  'session.began': SessionBeganSchema,
  'session.ended': SessionEndedSchema,
  'scene.started': SceneStartedSchema,
  'move.invoked': MoveInvokedSchema,
  'dice.rolled': DiceRolledSchema,
  'momentum.burned': MomentumBurnedSchema,
  'move.choice_made': MoveChoiceMadeSchema,
  'move.method_chosen': MoveMethodChosenSchema,
  'move.chained': MoveChainedSchema,
  'oracle.rolled': OracleRolledSchema,
  'amount.proposed': AmountProposedSchema,
  'amount.committed': AmountCommittedSchema,
  'state.changed': StateChangedSchema,
  'state.overridden': StateOverriddenSchema,
  'track.created': TrackCreatedSchema,
  'track.advanced': TrackAdvancedSchema,
  'entity.established': EntityEstablishedSchema,
  'narration.written': NarrationWrittenSchema,
  'narration.correction_requested': NarrationCorrectionRequestedSchema,
  'narration.revised': NarrationRevisedSchema,
  'narration.withdrawn': NarrationWithdrawnSchema,
  'event.voided': EventVoidedSchema,
  'ai.completed': AiCompletedSchema,
  'ai.failed': AiFailedSchema,
  'truth.set': TruthSetSchema,
  'sector.route_added': SectorRouteAddedSchema,
  'incident.proposed': IncidentProposedSchema,
  'move.suggested': MoveSuggestedSchema,
  'move.trigger_noted': MoveTriggerNotedSchema,
  'actions.suggested': ActionsSuggestedSchema,
  'session.summary_proposed': SessionSummaryProposedSchema,
  'complication.offered': ComplicationOfferedSchema,
  'complication.set': ComplicationSetSchema,
} as const;

export type EventType = keyof typeof PAYLOAD_SCHEMAS;

export const EVENT_TYPES = Object.keys(PAYLOAD_SCHEMAS) as readonly EventType[];

/** The payload type for one event type, readonly all the way down. */
export type PayloadFor<T extends EventType> = DeepReadonly<z.infer<(typeof PAYLOAD_SCHEMAS)[T]>>;

/**
 * A complete event: the common envelope, its type, and the payload that
 * type implies. Narrowing on `type` narrows `payload` with it.
 */
export type AstrolabeEvent = {
  [T in EventType]: EnvelopeFields & { readonly type: T; readonly payload: PayloadFor<T> };
}[EventType];

/** One event type as a zod object: the envelope extended with its own type and payload. */
function eventMember<T extends EventType>(type: T) {
  return EnvelopeFieldsSchema.extend({
    type: z.literal(type),
    payload: PAYLOAD_SCHEMAS[type],
  });
}

/**
 * The runtime schema. Written out member by member rather than derived from
 * the map, because a tuple literal is what gives `z.discriminatedUnion` its
 * inference — and because one readable manifest of the catalogue is worth
 * the repetition. `_CATALOGUE_IS_COMPLETE` below makes the repetition safe:
 * a type present in the map but missing here fails to compile.
 */
export const EventSchema = z.discriminatedUnion('type', [
  eventMember('campaign.created'),
  eventMember('character.created'),
  eventMember('character.proposed'),
  eventMember('session.began'),
  eventMember('session.ended'),
  eventMember('scene.started'),
  eventMember('move.invoked'),
  eventMember('dice.rolled'),
  eventMember('momentum.burned'),
  eventMember('move.choice_made'),
  eventMember('move.method_chosen'),
  eventMember('move.chained'),
  eventMember('oracle.rolled'),
  eventMember('amount.proposed'),
  eventMember('amount.committed'),
  eventMember('state.changed'),
  eventMember('state.overridden'),
  eventMember('track.created'),
  eventMember('track.advanced'),
  eventMember('entity.established'),
  eventMember('narration.written'),
  eventMember('narration.correction_requested'),
  eventMember('narration.revised'),
  eventMember('narration.withdrawn'),
  eventMember('event.voided'),
  eventMember('ai.completed'),
  eventMember('ai.failed'),
  eventMember('truth.set'),
  eventMember('sector.route_added'),
  eventMember('incident.proposed'),
  eventMember('move.suggested'),
  eventMember('move.trigger_noted'),
  eventMember('actions.suggested'),
  eventMember('session.summary_proposed'),
  eventMember('complication.offered'),
  eventMember('complication.set'),
]);

/**
 * Compile-time proof that `EventSchema` covers every type in
 * `PAYLOAD_SCHEMAS`. If the two ever drift, `Exclude<...>` stops being
 * `never` and this assignment fails.
 */
type CatalogueIsComplete =
  Exclude<EventType, z.infer<typeof EventSchema>['type']> extends never ? true : false;
const _CATALOGUE_IS_COMPLETE: CatalogueIsComplete = true;
void _CATALOGUE_IS_COMPLETE;

/**
 * Compile-time proof that what `EventSchema` actually parses to is what
 * `AstrolabeEvent` claims — in **both** directions, so neither a field the
 * schema produces and the type omits, nor the reverse, can slip through.
 *
 * This is what makes the `as AstrolabeEvent` in `parseEvent` a statement of
 * fact rather than an assumption. `EnvelopeFields` is hand-written while
 * payloads are inferred, so the two halves could drift; and a schema that
 * gained a `.transform()` or a `.default()` would change its output type
 * without changing its input type, which is exactly the kind of change a
 * cast would otherwise swallow.
 *
 * `DeepMutable` strips the `readonly` that `AstrolabeEvent` adds and
 * `z.infer` does not. Mutability is the only difference the two are allowed
 * to have.
 */
type SchemaOutput = z.infer<typeof EventSchema>;
type DeclaredShape = DeepMutable<AstrolabeEvent>;
const _SCHEMA_MATCHES_TYPE: [SchemaOutput, DeclaredShape] = [
  null as unknown as DeclaredShape,
  null as unknown as SchemaOutput,
];
void _SCHEMA_MATCHES_TYPE;

/**
 * Validate an event. Used on write, always — a payload that does not
 * validate is a bug that must not reach storage — and on read, where at a
 * few thousand events per campaign it costs single-digit milliseconds and
 * catches upcaster mistakes while they are still cheap.
 *
 * Throws rather than returning a partial result. Failing closed matters
 * here: silently skipping an event silently produces wrong state.
 */
export function parseEvent(input: unknown): AstrolabeEvent {
  return EventSchema.parse(input) as AstrolabeEvent;
}

export function safeParseEvent(input: unknown): z.ZodSafeParseResult<AstrolabeEvent> {
  return EventSchema.safeParse(input) as z.ZodSafeParseResult<AstrolabeEvent>;
}

/** Whether a string names an event type this build knows about. */
export function isEventType(value: string): value is EventType {
  return Object.hasOwn(PAYLOAD_SCHEMAS, value);
}

export * from './ai.js';
export * from './amount.js';
export * from './campaign.js';
export * from './character.js';
export * from './entity.js';
export * from './incident.js';
export * from './move.js';
export * from './narration.js';
export * from './oracle.js';
export * from './scene.js';
export * from './sector.js';
export * from './session.js';
export * from './state.js';
export * from './track.js';
export * from './truth.js';
export * from './void.js';
