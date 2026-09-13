import type { AiErrorKind, PayloadFor } from '@astrolabe/shared';
import type * as z from 'zod';

import {
  AiProviderError,
  type AiProvider,
  type AiRequest,
  type AiStopReason,
  type AiUsage,
} from './provider.js';

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
  if (stopReason === 'max_tokens') {
    return 'The passage was cut off before it finished.';
  }
  if (stopReason !== 'end_turn') {
    return `The response stopped unexpectedly (${stopReason}).`;
  }
  if (text.trim().length === 0) {
    return 'The response was empty.';
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

export async function generateValidated<T>(
  provider: AiProvider,
  request: AiRequest,
  schema: z.ZodType<T>,
): Promise<Outcome<T>> {
  const attempts: AttemptRecord[] = [];
  let lastProblem = '';

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const result = await provider.generateStructured(request, schema);
      attempts.push({ kind: 'completed', usage: result.usage, latencyMs: result.latencyMs });
      if (result.stopReason === 'refusal') {
        return refused(attempts, false);
      }
      if (result.ok) {
        return { ok: true, value: result.value, attempts };
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
