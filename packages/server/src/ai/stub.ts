import type { AiErrorKind } from '@astrolabe/shared';
import type * as z from 'zod';

import {
  AiProviderError,
  type AiProvider,
  type AiRequest,
  type AiStopReason,
  type AiStructuredResult,
  type AiTextResult,
  type AiUsage,
} from './provider.js';

/**
 * The stubbed provider D-60 names alongside the Claude implementation.
 *
 * Built with the interface rather than with the golden-session test (10.4)
 * because every route that calls the AI needs it to be testable without a
 * key, and because `ASTROLABE_AI_PROVIDER=stub` lets the app run locally
 * without spending tokens.
 *
 * Responses are scripted: each call takes the next one from the queue, or
 * asks `fallback` when the queue is empty. Every request is recorded, so a
 * test can assert what the AI was told.
 */

export type StubResponse =
  | {
      readonly kind: 'text';
      readonly text: string;
      readonly stopReason?: AiStopReason;
      readonly usage?: Partial<AiUsage>;
    }
  | {
      readonly kind: 'structured';
      /** Parsed against the caller's schema, exactly as a real response would be. */
      readonly value: unknown;
      readonly usage?: Partial<AiUsage>;
    }
  | { readonly kind: 'error'; readonly errorKind: AiErrorKind; readonly message?: string };

export interface StubOptions {
  readonly responses?: readonly StubResponse[];
  /** Used once the scripted queue is exhausted. Defaults to a short passage or an error. */
  readonly fallback?: (request: AiRequest, mode: 'text' | 'structured') => StubResponse;
  /** How many characters each streamed delta carries. */
  readonly chunkSize?: number;
  readonly configured?: boolean;
}

const DEFAULT_USAGE: AiUsage = {
  inputTokens: 100,
  outputTokens: 20,
  cacheReadTokens: 0,
  cacheWriteTokens: 0,
};

export class StubProvider implements AiProvider {
  readonly name = 'stub';
  readonly model = 'stub';
  readonly configured: boolean;
  readonly requests: AiRequest[] = [];

  readonly #queue: StubResponse[];
  readonly #fallback: (request: AiRequest, mode: 'text' | 'structured') => StubResponse;
  readonly #chunkSize: number;

  constructor(options: StubOptions = {}) {
    this.#queue = [...(options.responses ?? [])];
    this.#fallback = options.fallback ?? defaultFallback;
    this.#chunkSize = options.chunkSize ?? 16;
    this.configured = options.configured ?? true;
  }

  /** Queue more scripted responses. */
  enqueue(...responses: StubResponse[]): void {
    this.#queue.push(...responses);
  }

  async streamText(request: AiRequest, onDelta: (text: string) => void): Promise<AiTextResult> {
    const response = this.#next(request, 'text');
    if (response.kind === 'error') {
      throw new AiProviderError(
        response.errorKind,
        response.message ?? `Stub ${response.errorKind}.`,
      );
    }
    if (response.kind !== 'text') {
      throw new Error('StubProvider: a structured response was scripted for a text call.');
    }

    for (let i = 0; i < response.text.length; i += this.#chunkSize) {
      onDelta(response.text.slice(i, i + this.#chunkSize));
      // Yield, so a streaming consumer genuinely sees deltas arrive apart.
      await Promise.resolve();
    }

    return {
      text: response.text,
      stopReason: response.stopReason ?? 'end_turn',
      usage: { ...DEFAULT_USAGE, ...response.usage },
      latencyMs: 1,
      ...(response.text.length > 0 ? { firstTokenMs: 0 } : {}),
    };
  }

  async generateStructured<T>(
    request: AiRequest,
    schema: z.ZodType<T>,
  ): Promise<AiStructuredResult<T>> {
    const response = this.#next(request, 'structured');
    if (response.kind === 'error') {
      throw new AiProviderError(
        response.errorKind,
        response.message ?? `Stub ${response.errorKind}.`,
      );
    }
    if (response.kind !== 'structured') {
      throw new Error('StubProvider: a text response was scripted for a structured call.');
    }

    const usage = { ...DEFAULT_USAGE, ...response.usage };
    const parsed = schema.safeParse(response.value);
    return parsed.success
      ? { ok: true, value: parsed.data, stopReason: 'end_turn', usage, latencyMs: 1 }
      : {
          ok: false,
          problem: parsed.error.message,
          stopReason: 'end_turn',
          usage,
          latencyMs: 1,
        };
  }

  #next(request: AiRequest, mode: 'text' | 'structured'): StubResponse {
    this.requests.push(request);
    if (!this.configured) {
      return { kind: 'error', errorKind: 'not_configured', message: 'The stub is unconfigured.' };
    }
    return this.#queue.shift() ?? this.#fallback(request, mode);
  }
}

function defaultFallback(request: AiRequest, mode: 'text' | 'structured'): StubResponse {
  if (mode === 'text') {
    return {
      kind: 'text',
      text: `The Guide narrates the ${request.purpose} in a few plain sentences.`,
    };
  }
  return {
    kind: 'error',
    errorKind: 'invalid_output',
    message: `The stub has no scripted ${request.purpose} value.`,
  };
}
