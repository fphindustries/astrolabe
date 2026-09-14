import type { AiErrorKind, PayloadFor } from '@astrolabe/shared';
import type * as z from 'zod';

import {
  checkSegments,
  joinSegments,
  type Segment,
  type SegmentContext,
} from './context/segments.js';
import {
  AiProviderError,
  type AiProvider,
  type AiRequest,
  type AiStopReason,
  type AiUsage,
} from './provider.js';
import { SegmentGate } from './segment-gate.js';

/**
 * Validation and the re-ask (task 7.5, design record §10: "validated
 * against its schema; rejected and retried on failure").
 *
 * One place decides what counts as a usable answer, for every provider. A
 * rejected attempt is retried once; a provider *error* is not, because the
 * SDK has already retried transport failures and a refusal will not change
 * its mind on a second ask. Either way the call ends in an outcome the
 * command layer can write down whole: one accounting event per attempt,
 * then the content on success or `ai.failed` on failure (D-113).
 */

export const MAX_ATTEMPTS = 2;

/** What each attempt cost — becomes one `ai.completed` or `ai.failed`. */
export type AttemptRecord =
  | {
      readonly kind: 'completed';
      readonly usage: AiUsage;
      readonly latencyMs: number;
      readonly firstTokenMs?: number;
    }
  | {
      readonly kind: 'failed';
      readonly errorKind: AiErrorKind;
      readonly message: string;
      readonly usage?: AiUsage;
    };

export type Outcome<T> =
  | { readonly ok: true; readonly value: T; readonly attempts: readonly AttemptRecord[] }
  | {
      readonly ok: false;
      readonly errorKind: AiErrorKind;
      readonly message: string;
      readonly attempts: readonly AttemptRecord[];
    };

/** Where streamed text goes. `reset` tells the reader to discard what a rejected attempt sent. */
export interface TextSink {
  delta(text: string): void;
  reset(reason: string): void;
}

/** The one rule a passage of prose has to pass: it ended on its own, and it says something. */
export function textProblem(text: string, stopReason: AiStopReason): string | undefined {
  return (
    stopProblem(stopReason) ?? (text.trim().length === 0 ? 'The response was empty.' : undefined)
  );
}

function stopProblem(stopReason: AiStopReason): string | undefined {
  if (stopReason === 'max_tokens') {
    return 'The passage was cut off before it finished.';
  }
  if (stopReason !== 'end_turn') {
    return `The response stopped unexpectedly (${stopReason}).`;
  }
  return undefined;
}

export async function streamValidatedText(
  provider: AiProvider,
  request: AiRequest,
  sink: TextSink,
): Promise<Outcome<string>> {
  const attempts: AttemptRecord[] = [];
  let lastProblem = '';

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    let streamed = false;
    try {
      const result = await provider.streamText(request, (text) => {
        streamed = true;
        sink.delta(text);
      });
      attempts.push({
        kind: 'completed',
        usage: result.usage,
        latencyMs: result.latencyMs,
        ...(result.firstTokenMs !== undefined ? { firstTokenMs: result.firstTokenMs } : {}),
      });

      if (result.stopReason === 'refusal') {
        return refused(attempts, streamed, sink);
      }
      const problem = textProblem(result.text, result.stopReason);
      if (problem === undefined) {
        return { ok: true, value: result.text.trim(), attempts };
      }
      lastProblem = problem;
      if (streamed) {
        sink.reset(problem);
      }
    } catch (error) {
      if (streamed) {
        sink.reset('The provider failed partway through.');
      }
      return failure(error, attempts);
    }
  }

  return { ok: false, errorKind: 'invalid_output', message: lastProblem, attempts };
}

export interface SegmentedPassage {
  /** The segments' text joined: what `narration.written.text` commits. */
  readonly text: string;
  readonly segments: readonly Segment[];
}

/**
 * A segmented passage (D-127), streamed through `SegmentGate` so no text
 * reaches the player before the checks that need no AI have passed on it.
 * The attempt is judged again on the finished value: its schema, then every
 * check on every segment. A rejected attempt is reset and re-asked once,
 * with the problem in words, the same way as `generateValidated`.
 *
 * `firstTokenMs` here is when the first checked text reached the sink — the
 * moment A18 measures — not the first JSON the provider sent.
 */
export async function streamValidatedSegments(
  provider: AiProvider,
  request: AiRequest,
  schema: z.ZodType<{ readonly segments: readonly Segment[] }>,
  ctx: SegmentContext,
  sink: TextSink,
  now: () => number = () => performance.now(),
): Promise<Outcome<SegmentedPassage>> {
  const attempts: AttemptRecord[] = [];
  let lastProblem = '';

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const started = now();
    let firstTextMs: number | undefined;
    const gate = new SegmentGate(ctx, (text) => {
      firstTextMs ??= Math.round(now() - started);
      sink.delta(text);
    });

    try {
      const result = await provider.streamStructured(
        rejected(request, lastProblem),
        schema,
        (json) => gate.write(json),
      );
      attempts.push({
        kind: 'completed',
        usage: result.usage,
        latencyMs: result.latencyMs,
        ...(firstTextMs !== undefined ? { firstTokenMs: firstTextMs } : {}),
      });

      if (result.stopReason === 'refusal') {
        return refused(attempts, firstTextMs !== undefined, sink);
      }
      const problem =
        gate.problem ??
        stopProblem(result.stopReason) ??
        (result.ok ? checkSegments(result.value.segments, ctx) : result.problem);
      if (problem === undefined && result.ok) {
        const { segments } = result.value;
        return { ok: true, value: { text: joinSegments(segments), segments }, attempts };
      }
      lastProblem = problem ?? 'The passage could not be read.';
      if (firstTextMs !== undefined) {
        sink.reset(lastProblem);
      }
    } catch (error) {
      if (firstTextMs !== undefined) {
        sink.reset('The provider failed partway through.');
      }
      return failure(error, attempts);
    }
  }

  return { ok: false, errorKind: 'invalid_output', message: lastProblem, attempts };
}

/** The request again, carrying why the previous answer was rejected. */
function rejected(request: AiRequest, problem: string): AiRequest {
  return problem === ''
    ? request
    : {
        ...request,
        user: `${request.user}\n\nYour previous answer was rejected: ${problem}\nAnswer again, fixing that.`,
      };
}

/**
 * A structured answer, validated against its schema and, when given,
 * against `check` — a rule the schema cannot express, such as a character's
 * asset slots (D-124). `check` returns the problem in words, or undefined.
 *
 * The re-ask carries the previous attempt's problem, so the provider is not
 * handed the identical request that just failed.
 */
export async function generateValidated<T>(
  provider: AiProvider,
  request: AiRequest,
  schema: z.ZodType<T>,
  check?: (value: T) => string | undefined,
): Promise<Outcome<T>> {
  const attempts: AttemptRecord[] = [];
  let lastProblem = '';

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const result = await provider.generateStructured(rejected(request, lastProblem), schema);
      attempts.push({ kind: 'completed', usage: result.usage, latencyMs: result.latencyMs });
      if (result.stopReason === 'refusal') {
        return refused(attempts, false);
      }
      if (result.ok) {
        const problem = check?.(result.value);
        if (problem === undefined) {
          return { ok: true, value: result.value, attempts };
        }
        lastProblem = problem;
        continue;
      }
      lastProblem = result.problem;
    } catch (error) {
      return failure(error, attempts);
    }
  }

  return { ok: false, errorKind: 'invalid_output', message: lastProblem, attempts };
}

function refused<T>(attempts: AttemptRecord[], streamed: boolean, sink?: TextSink): Outcome<T> {
  const message = 'The provider declined the request, and its fallback declined too.';
  if (streamed) {
    sink?.reset(message);
  }
  return { ok: false, errorKind: 'refused', message, attempts };
}

function failure<T>(error: unknown, attempts: AttemptRecord[]): Outcome<T> {
  if (!(error instanceof AiProviderError)) {
    throw error;
  }
  const record: AttemptRecord = {
    kind: 'failed',
    errorKind: error.kind,
    message: error.message,
    ...(error.usage !== undefined ? { usage: error.usage } : {}),
  };
  return {
    ok: false,
    errorKind: error.kind,
    message: error.message,
    attempts: [...attempts, record],
  };
}

type AiCompleted = PayloadFor<'ai.completed'>;
type AiFailed = PayloadFor<'ai.failed'>;

export interface AccountingEvent {
  readonly type: 'ai.completed' | 'ai.failed';
  readonly payload: AiCompleted | AiFailed;
}

/**
 * The accounting events an outcome writes, in order: one per attempt that
 * returned, and — when the call failed — one `ai.failed` that says why and
 * carries whatever the failing attempt spent. Tokens are never counted
 * twice: a rejected attempt's usage is on its own `ai.completed`.
 */
export function accountingEvents(
  provider: Pick<AiProvider, 'name' | 'model'>,
  purpose: string,
  outcome: Outcome<unknown>,
): readonly AccountingEvent[] {
  const base = { provider: provider.name, model: provider.model, purpose };
  const events: AccountingEvent[] = [];

  for (const attempt of outcome.attempts) {
    if (attempt.kind !== 'completed') {
      continue;
    }
    events.push({
      type: 'ai.completed',
      payload: {
        ...base,
        inputTokens: attempt.usage.inputTokens,
        outputTokens: attempt.usage.outputTokens,
        ...(attempt.usage.cacheReadTokens > 0
          ? { cacheReadTokens: attempt.usage.cacheReadTokens }
          : {}),
        ...(attempt.usage.cacheWriteTokens > 0
          ? { cacheWriteTokens: attempt.usage.cacheWriteTokens }
          : {}),
        latencyMs: attempt.latencyMs,
        ...(attempt.firstTokenMs !== undefined ? { firstTokenMs: attempt.firstTokenMs } : {}),
      },
    });
  }

  if (!outcome.ok) {
    const thrown = outcome.attempts.find((attempt) => attempt.kind === 'failed');
    events.push({
      type: 'ai.failed',
      payload: {
        ...base,
        errorKind: outcome.errorKind,
        message: outcome.message,
        attempts: outcome.attempts.length,
        ...(thrown?.kind === 'failed' && thrown.usage !== undefined
          ? { inputTokens: thrown.usage.inputTokens, outputTokens: thrown.usage.outputTokens }
          : {}),
      },
    });
  }

  return events;
}
