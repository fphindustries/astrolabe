import type { AiErrorKind } from '@astrolabe/shared';
import type * as z from 'zod';

/**
 * The AI provider abstraction (task 7.1, D-50, D-60, D-112).
 *
 * Two operations and nothing else: `streamText` for prose the player
 * watches arrive, and `generateStructured` for a value the server has to
 * read — a proposed harm amount, later suggestions and complication
 * options. No tool use yet; task 8.1 decides how the AI asks for oracle
 * rolls, and either answer extends this interface rather than reshaping it.
 *
 * Prompt assembly lives above this interface (`ai/context/`), so switching
 * providers never changes what the AI is told (design record §9).
 *
 * A provider reports what happened; it does not decide whether the result
 * is good enough. Validation and the one re-ask live in `respond.ts`, so
 * the stub and the Claude implementation cannot disagree about what counts
 * as a usable answer.
 */

export type AiEffort = 'low' | 'medium' | 'high';

export interface AiSystemBlock {
  readonly text: string;
  /**
   * Mark the end of a stable prefix the provider may cache. Anything that
   * varies per call belongs after the last cached block, or every call
   * pays for a cache write it never reads back.
   */
  readonly cache?: boolean;
}

export interface AiRequest {
  /** What the call is for — lands on `ai.completed.purpose`. */
  readonly purpose: string;
  readonly system: readonly AiSystemBlock[];
  /** The one user turn. Every call is stateless; context comes from projected state, not a transcript (task 7.4). */
  readonly user: string;
  readonly effort?: AiEffort;
}

export interface AiUsage {
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly cacheReadTokens: number;
  readonly cacheWriteTokens: number;
}

export const NO_USAGE: AiUsage = {
  inputTokens: 0,
  outputTokens: 0,
  cacheReadTokens: 0,
  cacheWriteTokens: 0,
};

/**
 * Why the provider stopped. `refusal` and `max_tokens` are both answers a
 * caller has to reject rather than commit; everything else unexpected is
 * `other`.
 */
export type AiStopReason = 'end_turn' | 'max_tokens' | 'refusal' | 'other';

export interface AiTextResult {
  readonly text: string;
  readonly stopReason: AiStopReason;
  readonly usage: AiUsage;
  readonly latencyMs: number;
  /** Absent when no text arrived at all. */
  readonly firstTokenMs?: number;
}

export type AiStructuredResult<T> =
  | {
      readonly ok: true;
      readonly value: T;
      readonly stopReason: AiStopReason;
      readonly usage: AiUsage;
      readonly latencyMs: number;
    }
  | {
      readonly ok: false;
      /** Why the output was unusable, for the retry and the `ai.failed` message. */
      readonly problem: string;
      readonly stopReason: AiStopReason;
      readonly usage: AiUsage;
      readonly latencyMs: number;
    };

export interface AiProvider {
  /** Lands on `ai.completed.provider`. */
  readonly name: string;
  readonly model: string;
  /** False when the provider cannot make a call at all — no API key (D-116). */
  readonly configured: boolean;

  /**
   * Stream prose. `onDelta` receives text as it arrives; the resolved
   * result carries the whole text, which is what gets committed.
   *
   * Throws `AiProviderError` when no usable response came back.
   */
  streamText(request: AiRequest, onDelta: (text: string) => void): Promise<AiTextResult>;

  /**
   * Generate a value matching `schema`. A response that does not parse is
   * an `ok: false` result, not a throw — the tokens were still spent and
   * the caller still re-asks.
   */
  generateStructured<T>(request: AiRequest, schema: z.ZodType<T>): Promise<AiStructuredResult<T>>;
}

/**
 * The provider could not give an answer. `kind` is what `ai.failed` records
 * and what the play screen's pause (D-116) says.
 */
export class AiProviderError extends Error {
  constructor(
    readonly kind: AiErrorKind,
    message: string,
    /** Whatever the failing call spent before it failed, if the provider said. */
    readonly usage?: AiUsage,
  ) {
    super(message);
    this.name = 'AiProviderError';
  }
}
