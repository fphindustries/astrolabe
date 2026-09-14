import { withdrawalReason, type AiErrorKind, type PayloadFor } from '@astrolabe/shared';
import type * as z from 'zod';

import {
  authorityCheckSchema,
  buildAuthorityCheckRequest,
  toViolations,
  verifyQuotes,
  violationsProblem,
  type CheckContext,
  type CheckSubject,
  type Violation,
} from './context/authority-check.js';
import {
  checkSegments,
  joinSegments,
  type Segment,
  type SegmentContext,
} from './context/segments.js';
import { AiProviderError, type AiProvider, type AiRequest } from './provider.js';
import {
  accountingEvents,
  generateValidated,
  MAX_ATTEMPTS,
  rejected,
  stopProblem,
  textProblem,
  type AccountingEvent,
  type AttemptRecord,
  type Outcome,
  type TextSink,
} from './respond.js';
import { SegmentGate } from './segment-gate.js';

/**
 * Checked generation (task 7.15, D-128).
 *
 * Text streams provisionally while it is written, so A18 is still measured
 * on the first attempt. When the passage is complete it is checked — by
 * D-127's segment checks as it streams, then by the authority checker. A
 * failure is a **withdrawal**: the sink hears `withdrawn` with the reason in
 * words, the attempt is recorded for a `narration.withdrawn` event, and the
 * Guide is re-asked once with the quoted violations. A second failure ends
 * the call. A checker that fails, or whose quotes can't be verified after
 * its own re-ask, fails closed: nothing unchecked is ever committed.
 *
 * Output that is cut off or can't be read is not an authority finding; it
 * keeps 7.5's silent `reset` and re-ask.
 */

type WithdrawalPayload = PayloadFor<'narration.withdrawn'>;

export type WithdrawalRecord = Pick<
  WithdrawalPayload,
  'attempt' | 'checker' | 'rejectedText' | 'violations'
> & { readonly model?: string };

export type Ending<T> =
  | { readonly ok: true; readonly value: T }
  | {
      readonly ok: false;
      /** Whose failure it was, so `ai.failed` names the right provider. */
      readonly by: 'narrator' | 'checker';
      readonly errorKind: AiErrorKind;
      readonly message: string;
    };

export interface CheckedResult<T> {
  /** The narrator's attempts. */
  readonly attempts: readonly AttemptRecord[];
  /** Every checker call's outcome, in order. Only the last can have failed. */
  readonly checks: readonly Outcome<unknown>[];
  readonly withdrawals: readonly WithdrawalRecord[];
  readonly ending: Ending<T>;
}

export interface Checker {
  readonly provider: AiProvider;
  readonly context: CheckContext;
}

export type Verdict =
  | { readonly kind: 'pass' }
  | { readonly kind: 'violations'; readonly violations: readonly Violation[] }
  | { readonly kind: 'unchecked'; readonly errorKind: AiErrorKind; readonly message: string };

/** One authority check, with its quotes verified and one re-ask for a verdict that can't be. */
export async function checkAuthority(
  checker: Checker,
  subject: CheckSubject,
): Promise<{ readonly verdict: Verdict; readonly outcome: Outcome<unknown> }> {
  const outcome = await generateValidated(
    checker.provider,
    buildAuthorityCheckRequest(checker.context, subject),
    authorityCheckSchema(checker.context),
    (answer) => verifyQuotes(answer, subject),
  );
  if (!outcome.ok) {
    return {
      outcome,
      verdict: {
        kind: 'unchecked',
        errorKind: outcome.errorKind,
        message: `The authority check could not be completed: ${outcome.message}`,
      },
    };
  }
  const violations = toViolations(outcome.value);
  return {
    outcome,
    verdict: violations.length === 0 ? { kind: 'pass' } : { kind: 'violations', violations },
  };
}

/** What one generation attempt produced, before any authority check. */
type Generated<T> =
  | { readonly kind: 'passage'; readonly value: T; readonly subject: CheckSubject }
  /** D-127's checks failed: a withdrawal, not a silent reset. */
  | { readonly kind: 'segment_failure'; readonly problem: string; readonly rejectedText: string }
  | { readonly kind: 'unusable'; readonly problem: string }
  /** Already re-asked below this layer; ends the call. */
  | { readonly kind: 'failed'; readonly errorKind: AiErrorKind; readonly message: string }
  | { readonly kind: 'refused' };

interface AttemptIo {
  /** Whether any of this attempt's text reached the sink. */
  shown: boolean;
  readonly attempts: AttemptRecord[];
}

async function runChecked<T>(
  request: AiRequest,
  checker: Checker,
  sink: TextSink,
  generate: (asked: AiRequest, io: AttemptIo) => Promise<Generated<T>>,
): Promise<CheckedResult<T>> {
  const attempts: AttemptRecord[] = [];
  const checks: Outcome<unknown>[] = [];
  const withdrawals: WithdrawalRecord[] = [];
  const done = (ending: Ending<T>): CheckedResult<T> => ({ attempts, checks, withdrawals, ending });
  const withdraw = (record: WithdrawalRecord) => {
    withdrawals.push(record);
    sink.withdrawn?.(withdrawalReason(record.violations), record.rejectedText);
  };
  let lastProblem = '';

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const io: AttemptIo = { shown: false, attempts };
    let generated: Generated<T>;
    try {
      generated = await generate(rejected(request, lastProblem), io);
    } catch (error) {
      if (!(error instanceof AiProviderError)) {
        throw error;
      }
      if (io.shown) {
        sink.reset('The provider failed partway through.');
      }
      attempts.push({
        kind: 'failed',
        errorKind: error.kind,
        message: error.message,
        ...(error.usage !== undefined ? { usage: error.usage } : {}),
      });
      return done({ ok: false, by: 'narrator', errorKind: error.kind, message: error.message });
    }

    switch (generated.kind) {
      case 'refused': {
        const message = 'The provider declined the request, and its fallback declined too.';
        if (io.shown) {
          sink.reset(message);
        }
        return done({ ok: false, by: 'narrator', errorKind: 'refused', message });
      }
      case 'failed':
        return done({
          ok: false,
          by: 'narrator',
          errorKind: generated.errorKind,
          message: generated.message,
        });
      case 'unusable':
        lastProblem = generated.problem;
        if (io.shown) {
          sink.reset(generated.problem);
        }
        continue;
      case 'segment_failure':
        lastProblem = generated.problem;
        withdraw({
          attempt,
          checker: 'segment_checks',
          rejectedText: generated.rejectedText,
          violations: [
            {
              rule: 'segment_check',
              character: null,
              segment: null,
              quote: '',
              why: generated.problem,
            },
          ],
        });
        continue;
      case 'passage':
        break;
    }

    sink.checking?.();
    const { verdict, outcome } = await checkAuthority(checker, generated.subject);
    checks.push(outcome);
    const judged = { attempt, checker: 'authority_check' as const, model: checker.provider.model };

    if (verdict.kind === 'pass') {
      return done({ ok: true, value: generated.value });
    }
    if (verdict.kind === 'unchecked') {
      withdraw({
        ...judged,
        rejectedText: generated.subject.text,
        violations: [
          { rule: 'unchecked', character: null, segment: null, quote: '', why: verdict.message },
        ],
      });
      return done({
        ok: false,
        by: 'checker',
        errorKind: verdict.errorKind,
        message: verdict.message,
      });
    }
    withdraw({ ...judged, rejectedText: generated.subject.text, violations: verdict.violations });
    lastProblem = violationsProblem(verdict.violations);
  }

  return done({ ok: false, by: 'narrator', errorKind: 'invalid_output', message: lastProblem });
}

export interface SegmentedPassage {
  /** The segments' text joined: what `narration.written.text` commits. */
  readonly text: string;
  readonly segments: readonly Segment[];
}

/**
 * A beat passage (D-127, D-128): segments streamed through `SegmentGate`,
 * then the authority check. `firstTokenMs` is when the first checked text
 * reached the sink — the moment A18 measures.
 */
export function streamCheckedSegments(
  provider: AiProvider,
  request: AiRequest,
  schema: z.ZodType<{ readonly segments: readonly Segment[] }>,
  segments: SegmentContext,
  checker: Checker,
  sink: TextSink,
  now: () => number = () => performance.now(),
): Promise<CheckedResult<SegmentedPassage>> {
  return runChecked<SegmentedPassage>(request, checker, sink, async (asked, io) => {
    const started = now();
    let firstTextMs: number | undefined;
    const gate = new SegmentGate(segments, (text) => {
      firstTextMs ??= Math.round(now() - started);
      io.shown = true;
      sink.delta(text);
    });

    const result = await provider.streamStructured(asked, schema, (json) => gate.write(json));
    io.attempts.push({
      kind: 'completed',
      usage: result.usage,
      latencyMs: result.latencyMs,
      ...(firstTextMs !== undefined ? { firstTokenMs: firstTextMs } : {}),
    });

    if (result.stopReason === 'refusal') {
      return { kind: 'refused' };
    }
    // A segment that failed its checks is a withdrawal even if the output
    // was later cut off: the player may have seen the start of it.
    if (gate.problem !== undefined) {
      return {
        kind: 'segment_failure',
        problem: gate.problem,
        rejectedText: result.ok ? joinSegments(result.value.segments) : gate.text,
      };
    }
    const stopped = stopProblem(result.stopReason);
    if (stopped !== undefined) {
      return { kind: 'unusable', problem: stopped };
    }
    if (!result.ok) {
      return { kind: 'unusable', problem: result.problem };
    }
    const text = joinSegments(result.value.segments);
    const problem = checkSegments(result.value.segments, segments);
    if (problem !== undefined) {
      return { kind: 'segment_failure', problem, rejectedText: text };
    }
    return {
      kind: 'passage',
      value: { text, segments: result.value.segments },
      subject: { role: 'beat', text, segments: result.value.segments },
    };
  });
}

/** A 7.9 rewrite: plain prose, streamed, then the authority check (D-128, amended). */
export function streamCheckedText(
  provider: AiProvider,
  request: AiRequest,
  checker: Checker,
  sink: TextSink,
): Promise<CheckedResult<string>> {
  return runChecked<string>(request, checker, sink, async (asked, io) => {
    const result = await provider.streamText(asked, (text) => {
      io.shown = true;
      sink.delta(text);
    });
    io.attempts.push({
      kind: 'completed',
      usage: result.usage,
      latencyMs: result.latencyMs,
      ...(result.firstTokenMs !== undefined ? { firstTokenMs: result.firstTokenMs } : {}),
    });
    if (result.stopReason === 'refusal') {
      return { kind: 'refused' };
    }
    const problem = textProblem(result.text, result.stopReason);
    if (problem !== undefined) {
      return { kind: 'unusable', problem };
    }
    const text = result.text.trim();
    return { kind: 'passage', value: text, subject: { role: 'revision', text } };
  });
}

/**
 * A structured answer carrying an injury (D-130): validated, then the injury
 * checked. Nothing is shown before it is checked, so there is no sink.
 */
export function generateChecked<T>(
  provider: AiProvider,
  request: AiRequest,
  schema: z.ZodType<T>,
  injuryOf: (value: T) => string,
  checker: Checker,
): Promise<CheckedResult<T>> {
  const silent: TextSink = { delta: () => {}, reset: () => {} };
  return runChecked<T>(request, checker, silent, async (asked, io) => {
    const outcome = await generateValidated(provider, asked, schema);
    io.attempts.push(...outcome.attempts.filter((a) => a.kind === 'completed'));
    if (!outcome.ok) {
      const thrown = outcome.attempts.find((a) => a.kind === 'failed');
      if (thrown?.kind === 'failed') {
        throw new AiProviderError(thrown.errorKind, thrown.message, thrown.usage);
      }
      return outcome.errorKind === 'refused'
        ? { kind: 'refused' }
        : { kind: 'failed', errorKind: outcome.errorKind, message: outcome.message };
    }
    const injury = injuryOf(outcome.value);
    return { kind: 'passage', value: outcome.value, subject: { role: 'injury', text: injury } };
  });
}

/**
 * Every event a checked call writes besides its content, in order: the
 * narrator's accounting, the checker's, then the withdrawals, then — when
 * it failed — one `ai.failed` under whichever provider failed.
 */
export function checkedEvents(
  narrator: AiProvider,
  purpose: string,
  checker: AiProvider,
  result: CheckedResult<unknown>,
  withdrawal: Pick<WithdrawalPayload, 'role' | 'latitude' | 'targetEventId'>,
): readonly (
  AccountingEvent | { readonly type: 'narration.withdrawn'; readonly payload: WithdrawalPayload }
)[] {
  const { ending } = result;
  const narratorFailed = !ending.ok && ending.by === 'narrator';

  const narratorEvents = accountingEvents(
    narrator,
    purpose,
    narratorFailed
      ? {
          ok: false,
          errorKind: ending.errorKind,
          message: ending.message,
          attempts: result.attempts,
        }
      : { ok: true, value: null, attempts: result.attempts },
  );
  // Only the last check can have failed: an unchecked passage ends the call.
  const checkEvents = result.checks.flatMap((check) =>
    accountingEvents(checker, 'narration_check', check),
  );
  const completed = (e: AccountingEvent) => e.type === 'ai.completed';
  const failed = (e: AccountingEvent) => e.type === 'ai.failed';

  return [
    ...narratorEvents.filter(completed),
    ...checkEvents.filter(completed),
    ...result.withdrawals.map((w) => ({
      type: 'narration.withdrawn' as const,
      payload: { ...withdrawal, ...w } as WithdrawalPayload,
    })),
    ...narratorEvents.filter(failed),
    ...checkEvents.filter(failed),
  ];
}
