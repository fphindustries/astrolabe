import type { Actor, CampaignId, CommandId, EventId } from '@astrolabe/shared';
import type { Sql } from 'postgres';

import { planVoid, type VoidPlan, type VoidPreview } from '../projection/cascade.js';

import { appendCommand, readEvents, type AppendResult } from './event-store.js';

/**
 * Voiding an event (A11, D-27, D-83, D-84).
 *
 * Two entry points on purpose: the player is shown what a void would remove
 * *before* they confirm it, so the plan and the write are separate calls
 * over the same pure function.
 */

/** What voiding this event would remove, or why it is refused. Writes nothing. */
export async function previewVoid(
  sql: Sql,
  campaignId: CampaignId,
  targetEventId: EventId,
): Promise<VoidPlan> {
  return planVoid(await readEvents(sql, campaignId), targetEventId);
}

export interface VoidRequest {
  readonly campaignId: CampaignId;
  readonly commandId: CommandId;
  readonly actor: Actor;
  readonly targetEventId: EventId;
  readonly reason: string;
  /** `reroll` is D-18's visible AI reroll, which reuses this mechanism. */
  readonly kind?: 'player_void' | 'reroll';
}

export class VoidRefusedError extends Error {
  constructor(readonly plan: Extract<VoidPlan, { ok: false }>) {
    super(plan.detail);
    this.name = 'VoidRefusedError';
  }
}

/**
 * Void an event, cascade and all.
 *
 * The cascade is computed here and **stored on the event**, not recomputed
 * at projection time. The log is then reprojected simply by reading it: the
 * projector skips what the cascade names, and the narrative log keeps the
 * same events visible and struck through (D-27).
 *
 * Throws `VoidRefusedError` when the plan refuses — a void that would leave
 * a dangling reference, or that reaches past the current session, is not a
 * partial success to paper over.
 */
export async function voidEvent(sql: Sql, request: VoidRequest): Promise<AppendResult> {
  const plan = planVoid(await readEvents(sql, request.campaignId), request.targetEventId);
  if (!plan.ok) {
    throw new VoidRefusedError(plan);
  }
  return appendVoid(sql, request, plan);
}

async function appendVoid(
  sql: Sql,
  request: VoidRequest,
  plan: VoidPreview,
): Promise<AppendResult> {
  const target = plan.targetEventId;
  return appendCommand(sql, {
    campaignId: request.campaignId,
    commandId: request.commandId,
    kind: 'event.void',
    actor: request.actor,
    events: [
      {
        type: 'event.voided',
        payload: {
          targetEventId: target,
          kind: request.kind ?? 'player_void',
          reason: request.reason,
          cascaded: plan.cascaded,
        },
      },
    ],
    response: { cascaded: plan.cascaded.length },
  });
}
