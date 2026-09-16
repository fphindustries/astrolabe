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
  CampaignActivatedSchema,
  CampaignFoundationSetSchema,
  CharacterRemovedSchema,
  CharacterRevisedSchema,
  ConnectionEstablishedSchema,
  ConnectionRevisedSchema,
  CreationProposedSchema,
  IncidentAcceptedSchema,
  IncidentRevisedSchema,
  LaunchDraftSavedSchema,
  LaunchFactAmendedSchema,
  LocationAddedSchema,
  LocationRemovedSchema,
  LocationRevisedSchema,
  RouteAddedSchema,
  RouteRemovedSchema,
  RouteRevisedSchema,
  SectorConfiguredSchema,
  SectorLayoutChangedSchema,
  StarshipEstablishedSchema,
  StarshipRevisedSchema,
  StartingSettlementSelectedSchema,
  TroubleEstablishedSchema,
  TroubleRevisedSchema,
  TruthDecidedSchema,
} from './launch.js';
import * as launchSchemas from './launch.js';
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
  'launch.draft_saved': LaunchDraftSavedSchema,
  'creation.proposed': CreationProposedSchema,
  'campaign.foundation_set': CampaignFoundationSetSchema,
  'truth.decided': TruthDecidedSchema,
  'character.revised': CharacterRevisedSchema,
  'character.removed': CharacterRemovedSchema,
  'starship.established': StarshipEstablishedSchema,
  'starship.revised': StarshipRevisedSchema,
  'sector.configured': SectorConfiguredSchema,
  'location.added': LocationAddedSchema,
  'location.revised': LocationRevisedSchema,
  'location.removed': LocationRemovedSchema,
  'route.added': RouteAddedSchema,
  'route.revised': RouteRevisedSchema,
  'route.removed': RouteRemovedSchema,
  'sector.layout_changed': SectorLayoutChangedSchema,
  'starting_settlement.selected': StartingSettlementSelectedSchema,
  'trouble.established': TroubleEstablishedSchema,
  'trouble.revised': TroubleRevisedSchema,
  'connection.established': ConnectionEstablishedSchema,
  'connection.revised': ConnectionRevisedSchema,
  'incident.accepted': IncidentAcceptedSchema,
  'incident.revised': IncidentRevisedSchema,
  'campaign.activated': CampaignActivatedSchema,
  'launch.fact_amended': LaunchFactAmendedSchema,
} as const;

export type EventType = keyof typeof PAYLOAD_SCHEMAS;

export const EVENT_TYPES = Object.keys(PAYLOAD_SCHEMAS) as readonly EventType[];

/**
 * Every payload schema declared in `launch.ts`, by identity.
 *
 * Deriving the launch set from the module rather than restating its members
 * means a new launch event joins the set the moment it is registered above.
 * A hand-written list would let a twenty-sixth type default to
 * `voidable: true` (D-177) and escape context stripping (D-161) with nothing
 * failing — the exact drift this catalogue has already suffered once.
 */
const LAUNCH_PAYLOAD_SCHEMAS: ReadonlySet<unknown> = new Set(Object.values(launchSchemas));

/**
 * The Campaign Launch catalogue: every type appended before Session 1 exists,
 * plus the post-activation amendment that corrects one.
 *
 * These are campaign-scoped, so their events carry no `sessionId`. That has
 * two consequences the rest of the code depends on, and both are asserted
 * rather than assumed:
 *
 * - **None is voidable** (D-177). `planVoid` refuses any target outside the
 *   current session (D-84), and "outside" includes belonging to no session at
 *   all. A launch fact is corrected by revision before activation and by
 *   `launch.fact_amended` after it.
 * - **Drafts and proposals among them are not canon** (D-161), so AI context
 *   assembly strips them rather than filtering by name at each call site.
 */
export const LAUNCH_EVENT_TYPES = EVENT_TYPES.filter((type) =>
  LAUNCH_PAYLOAD_SCHEMAS.has(PAYLOAD_SCHEMAS[type] as unknown),
);

export type LaunchEventType = EventType;

/** Non-canonical launch events: resumable setup and unaccepted proposals (D-161). */
export const NON_CANONICAL_LAUNCH_EVENT_TYPES = [
  'launch.draft_saved',
  'creation.proposed',
] as const satisfies readonly EventType[];

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
  eventMember('launch.draft_saved'),
  eventMember('creation.proposed'),
  eventMember('campaign.foundation_set'),
  eventMember('truth.decided'),
  eventMember('character.revised'),
  eventMember('character.removed'),
  eventMember('starship.established'),
  eventMember('starship.revised'),
  eventMember('sector.configured'),
  eventMember('location.added'),
  eventMember('location.revised'),
  eventMember('location.removed'),
  eventMember('route.added'),
  eventMember('route.revised'),
  eventMember('route.removed'),
  eventMember('sector.layout_changed'),
  eventMember('starting_settlement.selected'),
  eventMember('trouble.established'),
  eventMember('trouble.revised'),
  eventMember('connection.established'),
  eventMember('connection.revised'),
  eventMember('incident.accepted'),
  eventMember('incident.revised'),
  eventMember('campaign.activated'),
  eventMember('launch.fact_amended'),
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
export * from './launch.js';
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
