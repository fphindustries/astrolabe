import Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import type { AiErrorKind } from '@astrolabe/shared';
import type * as z from 'zod';

import {
  AiProviderError,
  NO_USAGE,
  type AiProvider,
  type AiRequest,
  type AiStopReason,
  type AiStructuredResult,
  type AiTextResult,
  type AiUsage,
} from './provider.js';

/**
 * The Claude implementation (task 7.2, D-60, D-119).
 *
 * Every call runs on the beta messages surface, because that is where
 * server-side refusal fallbacks live: a declined request is re-run on a
 * fallback model inside the same call, and a mid-stream fallback continues
 * from the partial text, so the concatenated text deltas are still one
 * coherent passage.
 *
 * Adaptive thinking stays on (it is the model's default, and turning it off
 * has known failure modes); effort is the latency lever. Thinking tokens
 * count against `max_tokens`, so the ceiling here is generous and length is
 * controlled by the prompt (D-115), never by truncation.
 */

export const DEFAULT_CLAUDE_MODEL = 'claude-opus-5';

const FALLBACK_BETA = 'server-side-fallback-2026-07-01';
const STRUCTURED_OUTPUTS_BETA = 'structured-outputs-2025-12-15';
const MAX_TOKENS = 16_000;

type StreamParams = Parameters<Anthropic['beta']['messages']['stream']>[0];
type CreateParams = Parameters<Anthropic['beta']['messages']['create']>[0];

/** The slice of the SDK client this provider uses — narrow, so a test can fake it. */
export interface ClaudeClient {
  readonly beta: {
    readonly messages: {
      stream(params: StreamParams): ClaudeStream;
      create(params: CreateParams & { stream?: false }): Promise<ClaudeMessage>;
    };
  };
}

export interface ClaudeStream extends AsyncIterable<ClaudeStreamEvent> {
  finalMessage(): Promise<ClaudeMessage>;
}

export type ClaudeStreamEvent =
  | {
      readonly type: 'content_block_delta';
      readonly delta: { readonly type: string; readonly text?: string };
    }
  | { readonly type: string };

export interface ClaudeMessage {
  readonly content: readonly { readonly type: string; readonly text?: string }[];
  readonly stop_reason: string | null;
  readonly usage: {
    readonly input_tokens: number;
    readonly output_tokens: number;
    readonly cache_read_input_tokens?: number | null;
    readonly cache_creation_input_tokens?: number | null;
  };
}

export interface ClaudeProviderOptions {
  readonly model?: string;
  readonly configured: boolean;
  readonly client?: ClaudeClient;
  /** Injected so latency is testable; defaults to `performance.now`. */
  readonly now?: () => number;
}

export class ClaudeProvider implements AiProvider {
  readonly name = 'anthropic';
  readonly model: string;
  readonly configured: boolean;
  readonly #client: ClaudeClient | undefined;
  readonly #now: () => number;

  constructor(options: ClaudeProviderOptions) {
    this.model = options.model ?? DEFAULT_CLAUDE_MODEL;
    this.configured = options.configured;
    this.#client =
      options.client ??
      (options.configured ? (new Anthropic() as unknown as ClaudeClient) : undefined);
    this.#now = options.now ?? (() => performance.now());
  }

  async streamText(request: AiRequest, onDelta: (text: string) => void): Promise<AiTextResult> {
    const client = this.#requireClient();
    const started = this.#now();
    let firstTokenMs: number | undefined;

    try {
      const stream = client.beta.messages.stream(this.#params(request) as StreamParams);
      for await (const event of stream) {
        if (event.type !== 'content_block_delta' || !('delta' in event)) {
          continue;
        }
        const { delta } = event;
        if (delta.type === 'text_delta' && delta.text !== undefined && delta.text.length > 0) {
          firstTokenMs ??= Math.round(this.#now() - started);
          onDelta(delta.text);
        }
      }
      const message = await stream.finalMessage();
      return {
        text: textOf(message),
        stopReason: stopReasonOf(message.stop_reason),
        usage: usageOf(message),
        latencyMs: Math.round(this.#now() - started),
        ...(firstTokenMs !== undefined ? { firstTokenMs } : {}),
      };
    } catch (error) {
      throw toProviderError(error);
    }
  }

  async generateStructured<T>(
    request: AiRequest,
    schema: z.ZodType<T>,
  ): Promise<AiStructuredResult<T>> {
    const client = this.#requireClient();
    const started = this.#now();

    let message: ClaudeMessage;
    try {
      // `create` rather than `parse`: the SDK's parse helper throws on a
      // response that fails the schema, which would lose the usage the
      // call still spent. The format constrains the output; the schema is
      // checked here.
      message = await client.beta.messages.create(
        this.#structuredParams(request, schema) as CreateParams & { stream?: false },
      );
    } catch (error) {
      throw toProviderError(error);
    }
    return this.#structuredResult(message, schema, started);
  }

  async streamStructured<T>(
    request: AiRequest,
    schema: z.ZodType<T>,
    onDelta: (json: string) => void,
  ): Promise<AiStructuredResult<T>> {
    const client = this.#requireClient();
    const started = this.#now();

    let message: ClaudeMessage;
    try {
      const stream = client.beta.messages.stream(
        this.#structuredParams(request, schema) as StreamParams,
      );
      for await (const event of stream) {
        if (event.type !== 'content_block_delta' || !('delta' in event)) {
          continue;
        }
        const { delta } = event;
        if (delta.type === 'text_delta' && delta.text !== undefined && delta.text.length > 0) {
          onDelta(delta.text);
        }
      }
      message = await stream.finalMessage();
    } catch (error) {
      throw toProviderError(error);
    }
    return this.#structuredResult(message, schema, started);
  }

  #structuredParams(request: AiRequest, schema: z.ZodType<unknown>) {
    const params = this.#params(request);
    return {
      ...params,
      // The header the SDK's own `parse` helper sends with a format.
      betas: [...params.betas, STRUCTURED_OUTPUTS_BETA],
      output_config: {
        ...params.output_config,
        format: betaZodOutputFormat(schema as never),
      },
    };
  }

  #structuredResult<T>(
    message: ClaudeMessage,
    schema: z.ZodType<T>,
    started: number,
  ): AiStructuredResult<T> {
    const common = {
      stopReason: stopReasonOf(message.stop_reason),
      usage: usageOf(message),
      latencyMs: Math.round(this.#now() - started),
    };
    const text = textOf(message);
    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch {
      return { ok: false, problem: 'The response was not valid JSON.', ...common };
    }
    const parsed = schema.safeParse(json);
    return parsed.success
      ? { ok: true, value: parsed.data, ...common }
      : { ok: false, problem: parsed.error.message, ...common };
  }

  #requireClient(): ClaudeClient {
    if (!this.configured || this.#client === undefined) {
      throw new AiProviderError(
        'not_configured',
        'No Anthropic API key is configured. Set ANTHROPIC_API_KEY and restart the server.',
      );
    }
    return this.#client;
  }

  #params(request: AiRequest) {
    const reasoning = supportsReasoningControls(this.model);
    return {
      model: this.model,
      max_tokens: MAX_TOKENS,
      system: request.system.map((block) => ({
        type: 'text' as const,
        text: block.text,
        ...(block.cache === true ? { cache_control: { type: 'ephemeral' as const } } : {}),
      })),
      messages: [{ role: 'user' as const, content: request.user }],
      ...(reasoning ? { thinking: { type: 'adaptive' as const } } : {}),
      output_config: reasoning ? { effort: request.effort ?? 'medium' } : {},
      betas: [FALLBACK_BETA],
      fallbacks: 'default' as const,
    };
  }
}

/**
 * Whether a model takes adaptive thinking and `output_config.effort`
 * (D-128, amended). Probed live: `claude-haiku-4-5`, the default checker,
 * rejects both with a 400. Model knowledge stays here, so no caller has to
 * know which model it is talking to.
 */
export function supportsReasoningControls(model: string): boolean {
  return !model.startsWith('claude-haiku-4-5');
}

/** Text blocks only; thinking and fallback markers are not prose. */
export function textOf(message: ClaudeMessage): string {
  return message.content
    .filter((block) => block.type === 'text')
    .map((block) => block.text ?? '')
    .join('');
}

export function stopReasonOf(reason: string | null): AiStopReason {
  switch (reason) {
    case 'end_turn':
    case 'max_tokens':
    case 'refusal':
      return reason;
    default:
      return 'other';
  }
}

export function usageOf(message: Pick<ClaudeMessage, 'usage'>): AiUsage {
  return {
    inputTokens: message.usage.input_tokens,
    outputTokens: message.usage.output_tokens,
    cacheReadTokens: message.usage.cache_read_input_tokens ?? 0,
    cacheWriteTokens: message.usage.cache_creation_input_tokens ?? 0,
  };
}

/**
 * Sort an SDK failure into the kinds `ai.failed` records. Typed classes,
 * most specific first — never the message text. The SDK has already
 * retried connection errors, 408/409/429 and 5xx by the time one reaches
 * here, so every kind is final for this call.
 */
export function classifyError(error: unknown): AiErrorKind {
  if (
    error instanceof Anthropic.AuthenticationError ||
    error instanceof Anthropic.PermissionDeniedError
  ) {
    return 'auth';
  }
  if (error instanceof Anthropic.RateLimitError) {
    return 'rate_limited';
  }
  // A malformed request, an unknown model, a beta the account lacks: the
  // same call will fail the same way, so it must not read as an outage.
  if (
    error instanceof Anthropic.BadRequestError ||
    error instanceof Anthropic.NotFoundError ||
    error instanceof Anthropic.UnprocessableEntityError
  ) {
    return 'rejected';
  }
  return 'unavailable';
}

function toProviderError(error: unknown): AiProviderError {
  if (error instanceof AiProviderError) {
    return error;
  }
  const message = error instanceof Error ? error.message : String(error);
  return new AiProviderError(classifyError(error), message || 'The AI provider failed.', NO_USAGE);
}
