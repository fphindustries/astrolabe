import {
  DERELICT_RECIPE,
  NPC_RECIPE,
  STARFORGED,
  ODDS_ORACLES,
  rerollResult,
  rollOracle,
  rollRecipe,
  type MoveId,
  type OracleRecipe,
  type RandomSource,
  type TrackId,
} from '@astrolabe/rules';
import type {
  Actor,
  AstrolabeEvent,
  CampaignId,
  CampaignSettings,
  CampaignState,
  CommandId,
  EntityId,
  EventId,
  PayloadFor,
} from '@astrolabe/shared';
import type { Sql } from 'postgres';

import { streamCheckedSegments } from '../ai/checked.js';
import {
  beatNarrationSchema,
  buildSceneFramePlanRequest,
  buildSceneFrameRequest,
  buildWorldInterpretRequest,
  buildWorldPassageRequest,
  buildWorldPlanRequest,
  checkWorldInterpretation,
  checkWorldPlan,
  describeAnswer,
  openClocks,
  type ClockOffer,
  describeBeat,
  describeEstablished,
  describeScene,
  groundedInOf,
  outcomeTexts,
  recipeOf,
  renderFacts,
  resolveBeatScope,
  resolveSegments,
  segmentContext,
  worldInterpretSchema,
  worldPlanSchema,
  type BeatFacts,
  type RolledRecipe,
  type WorldBeat,
  type WorldInterpretation,
  type WorldPlan,
} from '../ai/context/index.js';
import type { AiProvider } from '../ai/provider.js';
import { generateValidated, type Outcome, type TextSink } from '../ai/respond.js';
import type { AiStatus } from '../ai/status.js';
import { livePassages } from '../projection/narrative-log.js';
import { project } from '../projection/project.js';
import { computeVoidState, isSuppressed } from '../projection/void-state.js';
import { cryptoRandomSource } from '../random-source.js';

import { appendCommand, readEvents, readEventsByCommand, type NewEvent } from './event-store.js';
import {
  AiRequestRefusedError,
  accounting,
  checkContextOf,
  checkedAccounting,
  envelopeOf,
  recordEnding,
  recordStatus,
  settingsOf,
  withEnvelope,
  type AiCommandResult,
  type Envelope,
  type Prepared,
} from './narration-commands.js';
import { derivedUuid, uuidv7 } from './uuid.js';

/**
 * The world pass (tasks 8.1 and 8.2; D-137, D-138 as amended) and the scene
 * frame (D-141).
 *
 * After a beat's passage commits, the client asks whether the world needs
 * anything the dice should ground. The plan names recipes by enum, the
 * server rolls them, and the interpret call turns each recipe's rolls into
 * an entity citing them. One command writes that, caused by the passage,
 * so voiding the move voids the world pass too (D-83). When it established
 * anything, a follow-up passage narrates it (8.2), as its own command
 * caused by what it narrates, on the same streamed request.
 *
 * A pass that failed can be retried — play pauses on it (D-116) — and the
 * dice it rolled stay rolled, unused. A pass that established something
 * but whose passage failed resumes at the passage, never rolls again.
 */

export const WORLD_PASS_COMMAND_KIND = 'world.pass';
export const WORLD_PASSAGE_COMMAND_KIND = 'narration.world';
export const SCENE_FRAME_COMMAND_KIND = 'narration.scene_frame';

/** A beat pass offers only the npc recipe (D-138, amended (b)). */
export const BEAT_RECIPES: readonly OracleRecipe[] = [NPC_RECIPE];
/** A scene frame offers only the derelict recipe (D-139). */
export const SCENE_RECIPES: readonly OracleRecipe[] = [DERELICT_RECIPE];

const SYSTEM: Actor = { kind: 'system' };
const PAY_THE_PRICE_ID = 'move:fate/pay-the-price' as MoveId;

export interface WorldPassRequest {
  readonly campaignId: CampaignId;
  readonly commandId: CommandId;
  readonly actor: Actor;
  readonly passageEventId: EventId;
  /** Test-only override of the real RNG; defaults to `cryptoRandomSource()`. */
  readonly rng?: RandomSource;
}

export type PreparedWorldPass =
  | {
      /** Plan, roll, interpret, then narrate what was established. */
      readonly mode: 'pass';
      readonly request: WorldPassRequest;
      readonly state: CampaignState;
      readonly beat: WorldBeat;
      readonly causedBy: EventId;
      readonly envelope: Envelope;
    }
  | {
      /** The pass already established something; only its passage is still owed. */
      readonly mode: 'passage';
      readonly request: WorldPassRequest;
      readonly worldEvents: readonly AstrolabeEvent[];
    };

export async function prepareWorldPass(
  sql: Sql,
  request: WorldPassRequest,
): Promise<Prepared<PreparedWorldPass>> {
  const already = await readEventsByCommand(sql, request.campaignId, request.commandId);
  if (already.length > 0) {
    const failed = failureIn(already);
    if (failed !== undefined || !establishes(already)) {
      return { kind: 'replay', result: failed ?? okWith(already) };
    }
    const passage = await readEventsByCommand(
      sql,
      request.campaignId,
      passageCommandId(request.commandId),
    );
    return passage.length > 0
      ? { kind: 'replay', result: passageResultFrom(passage) }
      : { kind: 'run', mode: 'passage', request, worldEvents: already };
  }

  const events = await readEvents(sql, request.campaignId);
  const state = project(events);
  settingsOf(state);
  const voids = computeVoidState(events);
  const passage = events.find((event) => event.id === request.passageEventId);
  if (passage?.type !== 'narration.written' || passage.payload.role !== 'beat') {
    throw new AiRequestRefusedError('not_a_passage', 'A world pass follows a beat’s passage.');
  }
  if (isSuppressed(passage, voids)) {
    throw new AiRequestRefusedError('voided', 'That passage has been voided.');
  }

  const passed = passedBefore(events, passage.id);
  if (passed !== undefined) {
    if (!establishes(passed) || narratedAfter(events, passed)) {
      throw new AiRequestRefusedError(
        'already_passed',
        'The world has already been considered after that passage.',
      );
    }
    return { kind: 'run', mode: 'passage', request, worldEvents: passed };
  }

  const scope = resolveBeatScope(events, passage.commandId, { allowNarrated: true });
  if (!scope.ok) {
    throw new AiRequestRefusedError(scope.reason, scope.detail);
  }

  const facts = describeBeat(scope.events, state, events);
  // D-156: every earlier live passage of this session, so the plan and
  // interpret calls can check a new result against what an NPC's own
  // narrated words already established, not just the projected state.
  const recentNarration = livePassages(
    events.filter((event) => event.sessionId === passage.sessionId && event.seq < passage.seq),
  ).map((p) => p.text);
  return {
    kind: 'run',
    mode: 'pass',
    request,
    state,
    beat: {
      facts,
      outcomes: outcomeTexts(scope.events),
      passage: passage.payload.text,
      recentNarration,
      // D-145: a miss, a match or a Pay the Price chain lets the plan set clocks.
      pressure:
        facts.miss ||
        facts.match ||
        scope.events.some(
          (event) => event.type === 'move.invoked' && event.payload.moveId === PAY_THE_PRICE_ID,
        ),
    },
    causedBy: passage.id,
    envelope: envelopeOf(request.campaignId, state),
  };
}

/** The world command a passage already has, if one wrote a plan and no failure. */
function passedBefore(
  events: readonly AstrolabeEvent[],
  passageId: EventId,
): readonly AstrolabeEvent[] | undefined {
  const byCommand = new Map<CommandId, AstrolabeEvent[]>();
  for (const event of events) {
    if (event.causedBy === passageId) {
      byCommand.set(event.commandId, [...(byCommand.get(event.commandId) ?? []), event]);
    }
  }
  return [...byCommand.values()].find(
    (written) =>
      written.some((e) => e.type === 'ai.completed' && e.payload.purpose === 'world_plan') &&
      failureIn(written) === undefined,
  );
}

/** What a world pass wrote that a follow-up passage narrates: an entity, or an answer (8.4). */
function establishes(events: readonly AstrolabeEvent[]): boolean {
  return events.some(isEstablished);
}

function isEstablished(event: AstrolabeEvent): boolean {
  return (
    event.type === 'entity.established' ||
    (event.type === 'oracle.rolled' && event.payload.question !== undefined)
  );
}

/** Whether a live passage already narrates what a world command established. */
function narratedAfter(
  events: readonly AstrolabeEvent[],
  world: readonly AstrolabeEvent[],
): boolean {
  const ids = new Set(world.map((event) => event.id));
  const voids = computeVoidState(events);
  return events.some(
    (event) =>
      event.type === 'narration.written' &&
      event.payload.role === 'world' &&
      event.causedBy !== null &&
      ids.has(event.causedBy) &&
      !isSuppressed(event, voids),
  );
}

/** The follow-up passage's command id, derived so a replay of the request finds it. */
function passageCommandId(worldRequestId: CommandId): CommandId {
  return derivedUuid(worldRequestId, 'world-passage') as CommandId;
}

export async function runWorldPass(
  sql: Sql,
  ai: AiProvider,
  checker: AiProvider,
  prepared: PreparedWorldPass,
  sink: TextSink,
  status?: AiStatus,
): Promise<AiCommandResult> {
  let worldEvents: readonly AstrolabeEvent[];
  if (prepared.mode === 'pass') {
    worldEvents = await commitWorldPass(sql, ai, prepared, status);
    const failed = failureIn(worldEvents);
    if (failed !== undefined || !establishes(worldEvents)) {
      return failed ?? okWith(worldEvents);
    }
    // The entity is in the log now: the client shows it before its passage.
    sink.world?.();
  } else {
    worldEvents = prepared.worldEvents;
  }
  return narrateEstablished(sql, ai, checker, prepared.request, worldEvents, sink, status);
}

async function commitWorldPass(
  sql: Sql,
  ai: AiProvider,
  prepared: Extract<PreparedWorldPass, { mode: 'pass' }>,
  status: AiStatus | undefined,
): Promise<readonly AstrolabeEvent[]> {
  const { request, state, beat, envelope } = prepared;

  const characters = segmentContext(beat.facts, state, 'color').characters;
  const clocks: ClockOffer | undefined =
    beat.pressure === true ? { open: openClocks(state) } : undefined;
  const planRequest = buildWorldPlanRequest(state, beat, BEAT_RECIPES, clocks);
  const plan = await generateValidated(
    ai,
    planRequest,
    worldPlanSchema(BEAT_RECIPES, clocks),
    (value) => checkWorldPlan(value, characters, clocks),
  );

  const events: NewEvent[] = [...accounting(ai, planRequest.purpose, plan, envelope)];
  let final: Outcome<unknown> = plan;
  const rng = request.rng ?? cryptoRandomSource();

  // D-28 (8.4): the plan's yes/no questions are rolled first, and their
  // answers reach the interpretation and the follow-up passage.
  const answers = plan.ok ? questionEvents(plan.value.questions, rng, envelope) : [];
  events.push(...answers);
  // D-145: shown on the pressure rail with the reason, never narrated.
  if (plan.ok && clocks !== undefined && plan.value.clocks !== undefined) {
    events.push(...clockEvents(plan.value.clocks, clocks, envelope));
  }
  const answered: WorldBeat = { ...beat, answers: answers.map((e) => describeAnswer(e.payload)) };

  const planned = plan.ok ? [...plan.value.recipes, ...yesRecipes(plan.value, answers)] : [];
  if (planned.length > 0) {
    const rolled = rollPlanned(planned, BEAT_RECIPES, rng);
    events.push(...rollEvents(rolled, envelope));

    const cap = settingsOf(state).rerollCap;
    let current = rolled;
    let interpretation: Outcome<WorldInterpretation>;
    // D-18, D-70: a result that contradicts what is established is rerolled
    // visibly and the Guide asked again. Every reroll spends one of that
    // result's D-69 cap, so the loop ends; the guard is for a broken cap.
    for (let round = 0; ; round++) {
      const asked = current;
      const interpretRequest = buildWorldInterpretRequest(state, answered, asked, cap);
      interpretation = await generateValidated(
        ai,
        interpretRequest,
        worldInterpretSchema(asked),
        (value) => checkWorldInterpretation(value, asked, characters, cap),
      );
      events.push(...accounting(ai, interpretRequest.purpose, interpretation, envelope));
      if (!interpretation.ok || interpretation.value.rerolls.length === 0) {
        break;
      }
      if (round >= MAX_REROLL_ROUNDS) {
        interpretation = {
          ok: false,
          errorKind: 'invalid_output',
          message: 'The Guide kept asking for rerolls after every result was final.',
          attempts: [],
        };
        events.push(...accounting(ai, interpretRequest.purpose, interpretation, envelope));
        break;
      }
      const { rolled: next, events: rerolled } = applyRerolls(
        asked,
        interpretation.value.rerolls,
        rng,
        envelope,
      );
      events.push(...rerolled);
      current = next;
    }
    final = interpretation;

    if (interpretation.ok) {
      for (const instance of current) {
        const entity = interpretation.value.entities.find((e) => e.instance === instance.instance)!;
        events.push(
          withEnvelope(
            {
              type: 'entity.established',
              payload: {
                entityId: uuidv7() as EntityId,
                kind: 'npc',
                name: entity.name.trim(),
                fields: Object.fromEntries(
                  [...new Set(instance.slots.filter((s) => !s.name).map((s) => s.slot))].map(
                    (slot) => [slot, entity.fields.find((f) => f.slot === slot)!.text.trim()],
                  ),
                ),
                provenance: {
                  establishedBy: 'ai',
                  recipeId: instance.recipe.id,
                  groundedIn: instance.slots.map((s) => s.eventId),
                },
              },
            } satisfies NewEvent<'entity.established'>,
            envelope,
          ),
        );
      }
    }
  }
  recordStatus(status, final);

  const result = await appendCommand(sql, {
    campaignId: request.campaignId,
    commandId: request.commandId,
    kind: WORLD_PASS_COMMAND_KIND,
    actor: request.actor,
    causedBy: prepared.causedBy,
    events,
  });
  return result.events;
}

/** 8.2: the follow-up passage, world-only, checked like any passage (D-128). */
async function narrateEstablished(
  sql: Sql,
  ai: AiProvider,
  checker: AiProvider,
  request: WorldPassRequest,
  worldEvents: readonly AstrolabeEvent[],
  sink: TextSink,
  status: AiStatus | undefined,
): Promise<AiCommandResult> {
  const events = await readEvents(sql, request.campaignId);
  const state = project(events);
  const settings = settingsOf(state);
  const facts = describeEstablished(worldEvents);
  const causedBy = [...worldEvents].reverse().find(isEstablished)!.id;

  return narrateWorldOnly(sql, ai, checker, {
    campaignId: request.campaignId,
    commandId: passageCommandId(request.commandId),
    kind: WORLD_PASSAGE_COMMAND_KIND,
    actor: request.actor,
    causedBy,
    role: 'world',
    state,
    settings,
    facts,
    aiRequest: buildWorldPassageRequest(state, events, facts, settings),
    leading: [],
    sink,
    status,
  });
}

interface WorldOnlyNarration {
  readonly campaignId: CampaignId;
  readonly commandId: CommandId;
  readonly kind: string;
  readonly actor: Actor;
  readonly causedBy: EventId;
  readonly role: 'world' | 'scene_frame';
  readonly state: CampaignState;
  readonly settings: CampaignSettings;
  readonly facts: BeatFacts;
  readonly aiRequest: ReturnType<typeof buildWorldPassageRequest>;
  /** Events written ahead of the passage in the same command: a frame's plan and rolls. */
  readonly leading: readonly NewEvent[];
  readonly sink: TextSink;
  readonly status: AiStatus | undefined;
}

async function narrateWorldOnly(
  sql: Sql,
  ai: AiProvider,
  checker: AiProvider,
  n: WorldOnlyNarration,
): Promise<AiCommandResult> {
  const envelope = envelopeOf(n.campaignId, n.state);
  const ctx = segmentContext(n.facts, n.state, n.settings.narrationLatitude, true);
  const checked = await streamCheckedSegments(
    ai,
    n.aiRequest,
    beatNarrationSchema(ctx),
    ctx,
    { provider: checker, context: checkContextOf(n.state, ctx.latitude, renderFacts(ctx)) },
    n.sink,
  );
  recordEnding(n.status, checked);
  const outcome = checked.ending;

  const result = await appendCommand(sql, {
    campaignId: n.campaignId,
    commandId: n.commandId,
    kind: n.kind,
    actor: n.actor,
    causedBy: n.causedBy,
    events: [
      ...n.leading,
      ...checkedAccounting(
        ai,
        n.aiRequest.purpose,
        checker,
        checked,
        { role: 'beat', latitude: ctx.latitude },
        envelope,
      ),
      ...(outcome.ok
        ? [
            withEnvelope(
              {
                type: 'narration.written',
                payload: {
                  role: n.role,
                  text: outcome.value.text,
                  groundedIn: [...groundedInOf(outcome.value.segments, ctx)],
                  segments: resolveSegments(outcome.value.segments, ctx),
                },
              } as NewEvent<'narration.written'>,
              envelope,
            ),
          ]
        : []),
    ],
  });
  return passageResultFrom(result.events);
}

// ---------------------------------------------------------------------------
// The scene frame (D-141)
// ---------------------------------------------------------------------------

export interface SceneFrameRequest {
  readonly campaignId: CampaignId;
  readonly commandId: CommandId;
  readonly actor: Actor;
  readonly rng?: RandomSource;
}

export interface PreparedSceneFrame {
  readonly request: SceneFrameRequest;
  readonly state: CampaignState;
  readonly events: readonly AstrolabeEvent[];
  readonly sceneEventId: EventId;
}

export async function prepareSceneFrame(
  sql: Sql,
  request: SceneFrameRequest,
): Promise<Prepared<PreparedSceneFrame>> {
  const already = await readEventsByCommand(sql, request.campaignId, request.commandId);
  if (already.length > 0) {
    return { kind: 'replay', result: passageResultFrom(already) };
  }
  const events = await readEvents(sql, request.campaignId);
  const state = project(events);
  settingsOf(state);
  if (state.session === null || state.session.endedAt !== undefined) {
    throw new AiRequestRefusedError('no_session', 'A scene is framed during a session.');
  }
  if (state.scene === null) {
    throw new AiRequestRefusedError('no_scene', 'There is no scene to frame.');
  }
  if (state.scene.framedBy !== undefined) {
    throw new AiRequestRefusedError('already_framed', 'This scene has already been framed.');
  }
  const voids = computeVoidState(events);
  const sceneId = state.scene.id;
  const started = [...events]
    .reverse()
    .find(
      (e) => e.type === 'scene.started' && e.payload.sceneId === sceneId && !isSuppressed(e, voids),
    );
  if (started === undefined) {
    throw new AiRequestRefusedError('no_scene', 'There is no scene to frame.');
  }
  return { kind: 'run', request, state, events, sceneEventId: started.id };
}

export async function runSceneFrame(
  sql: Sql,
  ai: AiProvider,
  checker: AiProvider,
  prepared: PreparedSceneFrame,
  sink: TextSink,
  status?: AiStatus,
  /** D-141, amended: the plan runs on a faster model than the narrator, to hold A18. */
  planner: AiProvider = ai,
): Promise<AiCommandResult> {
  const { request, state, events } = prepared;
  const settings = settingsOf(state);
  const envelope = envelopeOf(request.campaignId, state);

  const planRequest = buildSceneFramePlanRequest(state, SCENE_RECIPES);
  const plan = await generateValidated(
    planner,
    planRequest,
    worldPlanSchema(SCENE_RECIPES),
    (value) => checkWorldPlan(value, crewOf(state)),
  );
  const planEvents = accounting(planner, planRequest.purpose, plan, envelope);
  if (!plan.ok) {
    recordStatus(status, plan);
    const result = await appendCommand(sql, {
      campaignId: request.campaignId,
      commandId: request.commandId,
      kind: SCENE_FRAME_COMMAND_KIND,
      actor: request.actor,
      causedBy: prepared.sceneEventId,
      events: planEvents,
    });
    return passageResultFrom(result.events);
  }

  // A derelict grounds the frame's prose only: nothing to interpret into an entity (D-139).
  const rng = request.rng ?? cryptoRandomSource();
  const answers = questionEvents(plan.value.questions, rng, envelope);
  const rolls = [
    ...answers,
    ...rollEvents(
      rollPlanned([...plan.value.recipes, ...yesRecipes(plan.value, answers)], SCENE_RECIPES, rng),
      envelope,
    ),
  ];
  const facts = describeScene(
    state,
    prepared.sceneEventId,
    rolls.map((e) => ({ ...e.payload, eventId: e.id! })),
  );

  return narrateWorldOnly(sql, ai, checker, {
    campaignId: request.campaignId,
    commandId: request.commandId,
    kind: SCENE_FRAME_COMMAND_KIND,
    actor: request.actor,
    causedBy: prepared.sceneEventId,
    role: 'scene_frame',
    state,
    settings,
    facts,
    aiRequest: buildSceneFrameRequest(state, events, facts, settings),
    leading: [...planEvents, ...rolls],
    sink,
    status,
  });
}

// ---------------------------------------------------------------------------
// Shared
// ---------------------------------------------------------------------------

function rollPlanned(
  planned: readonly { readonly recipe: string; readonly reason: string }[],
  offered: readonly OracleRecipe[],
  rng: RandomSource,
): readonly RolledRecipe[] {
  return planned.map(({ recipe: name, reason }, i): RolledRecipe => {
    const recipe = recipeOf(offered, name)!;
    const instance = `E${i + 1}`;
    return {
      instance,
      recipe,
      reason,
      slots: rollRecipe(rng, recipe, (oracle) =>
        STARFORGED.oracles.find((t) => t.id === oracle),
      ).flatMap(({ slot, results }) =>
        results.map((result, n) => ({
          key:
            results.length === 1 ? `${instance}.${slot.slot}` : `${instance}.${slot.slot}.${n + 1}`,
          slot: slot.slot,
          name: slot.name === true,
          oracleId: result.oracleId,
          roll: result.roll,
          rowText: result.rowText,
          eventId: uuidv7() as EventId,
          rerolls: 0,
        })),
      ),
    };
  });
}

/** `E1.goal.2r1.1` → `E1.goal.2`: a reroll's key counts from the original result's. */
function rerollBase(key: string): string {
  return key.replace(/r\d+(\.\d+)?$/, '');
}

/** A generous bound on reroll rounds; the D-69 cap ends the loop well before it. */
const MAX_REROLL_ROUNDS = 12;

/**
 * D-18, D-70, D-142: discard each named result with its reason, as
 * `event.voided { kind: 'reroll' }` on just that roll, and roll its table
 * again. The new results carry `rerollOf` and one more reroll behind them.
 */
function applyRerolls(
  rolled: readonly RolledRecipe[],
  rerolls: WorldInterpretation['rerolls'],
  rng: RandomSource,
  envelope: Envelope,
): { readonly rolled: readonly RolledRecipe[]; readonly events: readonly NewEvent[] } {
  const events: NewEvent[] = [];
  const next = rolled.map((instance): RolledRecipe => {
    const discarded = [...(instance.discarded ?? [])];
    const slots = instance.slots.flatMap((slot) => {
      const asked = rerolls.find((r) => r.roll === slot.key);
      if (asked === undefined) {
        return [slot];
      }
      discarded.push({ ...slot, reason: asked.reason.trim() });
      events.push(
        withEnvelope(
          {
            type: 'event.voided',
            payload: {
              targetEventId: slot.eventId,
              kind: 'reroll',
              reason: asked.reason.trim(),
              cascaded: [slot.eventId],
            },
          } satisfies NewEvent<'event.voided'>,
          envelope,
        ),
      );
      const results = rerollResult(
        rng,
        slot.oracleId,
        (oracle) => STARFORGED.oracles.find((t) => t.id === oracle),
        instance.recipe,
      );
      const replacements = results.map((result, n) => ({
        key:
          results.length === 1
            ? `${rerollBase(slot.key)}r${slot.rerolls + 1}`
            : `${rerollBase(slot.key)}r${slot.rerolls + 1}.${n + 1}`,
        slot: slot.slot,
        name: slot.name,
        oracleId: result.oracleId,
        roll: result.roll,
        rowText: result.rowText,
        eventId: uuidv7() as EventId,
        rerolls: slot.rerolls + 1,
        rerollOf: slot.eventId,
      }));
      events.push(...replacements.map((replacement) => rollEvent(instance, replacement, envelope)));
      return replacements;
    });
    return { ...instance, slots, discarded };
  });
  return { rolled: next, events };
}

/** Dice that were rolled stay rolled, whatever the interpretation or passage does. */
function rollEvents(
  rolled: readonly RolledRecipe[],
  envelope: Envelope,
): readonly (NewEvent<'oracle.rolled'> & { readonly id: EventId })[] {
  return rolled.flatMap((instance) =>
    instance.slots.map((slot) => rollEvent(instance, slot, envelope)),
  );
}

function rollEvent(
  instance: RolledRecipe,
  slot: RolledRecipe['slots'][number],
  envelope: Envelope,
): NewEvent<'oracle.rolled'> & { readonly id: EventId } {
  return {
    id: slot.eventId,
    type: 'oracle.rolled',
    payload: {
      oracleId: slot.oracleId,
      roll: slot.roll,
      rowText: slot.rowText,
      recipeId: instance.recipe.id,
      slot: slot.slot,
      ...(slot.rerollOf !== undefined ? { rerollOf: slot.rerollOf } : {}),
    } satisfies PayloadFor<'oracle.rolled'>,
    actor: SYSTEM,
    sessionId: envelope.sessionId,
    sceneId: envelope.sceneId,
  };
}

/** The player characters, as the checks that need no AI name them (D-140). */
function crewOf(state: CampaignState) {
  return Object.values(state.characters).map((c) => ({
    id: c.id,
    callsign: c.callsign,
    name: c.name,
  }));
}

/**
 * D-138 (amended after 8.4): a question's `onYes` recipe joins the plan only
 * when the oracle answered Yes, with the question as its reason.
 */
function yesRecipes(
  plan: WorldPlan,
  answers: readonly NewEvent<'oracle.rolled'>[],
): readonly { readonly recipe: string; readonly reason: string }[] {
  return plan.questions.flatMap((question, i) =>
    question.onYes !== null && answers[i]?.payload.rowText === 'Yes'
      ? [
          {
            recipe: question.onYes,
            reason: `the oracle answered yes to "${question.question.trim()}"`,
          },
        ]
      : [],
  );
}

/**
 * D-145: a new clock as `track.created`, advanced at once by its starting
 * segments so the rail shows who filled them and why; each tick as
 * `track.advanced`. Both caused by the Guide's judgement, with its reason.
 */
function clockEvents(
  planned: NonNullable<WorldPlan['clocks']>,
  offer: ClockOffer,
  envelope: Envelope,
): readonly NewEvent[] {
  const events: NewEvent[] = [];
  for (const clock of planned.create) {
    const trackId = uuidv7() as TrackId;
    const cause = { kind: 'ai_judgement', reason: clock.reason.trim() } as const;
    events.push(
      withEnvelope(
        {
          type: 'track.created',
          payload: {
            kind: 'clock',
            trackId,
            title: clock.title.trim(),
            segments: clock.segments,
            cause,
          },
        } satisfies NewEvent<'track.created'>,
        envelope,
      ),
    );
    if (clock.filled > 0) {
      events.push(
        withEnvelope(
          {
            type: 'track.advanced',
            payload: { trackId, ticks: clock.filled, cause },
          } satisfies NewEvent<'track.advanced'>,
          envelope,
        ),
      );
    }
  }
  for (const tick of planned.tick ?? []) {
    const open = offer.open.find((c) => c.key === tick.clock)!;
    events.push(
      withEnvelope(
        {
          type: 'track.advanced',
          payload: {
            trackId: open.trackId,
            ticks: tick.segments,
            cause: { kind: 'ai_judgement', reason: tick.reason.trim() },
          },
        } satisfies NewEvent<'track.advanced'>,
        envelope,
      ),
    );
  }
  return events;
}

/** D-28 (8.4): each question rolled on the Ask the Oracle table for its odds. */
function questionEvents(
  questions: WorldPlan['questions'],
  rng: RandomSource,
  envelope: Envelope,
): readonly (NewEvent<'oracle.rolled'> & { readonly id: EventId })[] {
  return questions.map(({ question, odds }) => {
    const oracleId = ODDS_ORACLES[odds];
    const table = STARFORGED.oracles.find((t) => t.id === oracleId);
    if (table === undefined) {
      throw new Error(`Odds table "${oracleId}" is not in the ruleset.`);
    }
    const result = rollOracle(rng, table);
    return {
      id: uuidv7() as EventId,
      type: 'oracle.rolled',
      payload: {
        oracleId,
        roll: result.roll,
        rowText: result.row.text,
        question: question.trim(),
      },
      actor: SYSTEM,
      sessionId: envelope.sessionId,
      sceneId: envelope.sceneId,
    };
  });
}

function failureIn(events: readonly AstrolabeEvent[]): AiCommandResult | undefined {
  const failed = events.find((event) => event.type === 'ai.failed');
  return failed?.type === 'ai.failed'
    ? { ok: false, errorKind: failed.payload.errorKind, message: failed.payload.message }
    : undefined;
}

function okWith(events: readonly AstrolabeEvent[]): AiCommandResult {
  const last = events.at(-1);
  return last === undefined
    ? { ok: false, errorKind: 'unavailable', message: 'The world pass was not recorded.' }
    : { ok: true, eventId: last.id };
}

function passageResultFrom(events: readonly AstrolabeEvent[]): AiCommandResult {
  const passage = events.find((event) => event.type === 'narration.written');
  if (passage !== undefined) {
    return { ok: true, eventId: passage.id };
  }
  return (
    failureIn(events) ?? {
      ok: false,
      errorKind: 'unavailable',
      message: 'The passage was not recorded.',
    }
  );
}
