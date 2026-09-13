import Anthropic from '@anthropic-ai/sdk';
import { describe, expect, it } from 'vitest';
import * as z from 'zod';

import {
  ClaudeProvider,
  classifyError,
  stopReasonOf,
  usageOf,
  type ClaudeClient,
  type ClaudeMessage,
  type ClaudeStreamEvent,
} from './claude.js';
import { createProviderFromEnv } from './create-provider.js';
import { AiProviderError } from './provider.js';

const REQUEST = {
  purpose: 'beat',
  system: [{ text: 'stable rules', cache: true }, { text: 'campaign' }],
  user: 'narrate this',
  effort: 'low' as const,
};

function message(text: string, stopReason = 'end_turn'): ClaudeMessage {
  return {
    content: [
      { type: 'thinking', text: '' },
      { type: 'text', text },
    ],
    stop_reason: stopReason,
    usage: {
      input_tokens: 120,
      output_tokens: 40,
      cache_read_input_tokens: 2000,
      cache_creation_input_tokens: null,
    },
  };
}

/** A fake SDK client: records params, streams the given deltas, and resolves to `final`. */
function fakeClient(options: {
  deltas?: readonly string[];
  final?: ClaudeMessage;
  fail?: unknown;
}): { client: ClaudeClient; params: unknown[] } {
  const params: unknown[] = [];
  const client: ClaudeClient = {
    beta: {
      messages: {
        stream(p) {
          params.push(p);
          return {
            async *[Symbol.asyncIterator](): AsyncGenerator<ClaudeStreamEvent> {
              if (options.fail !== undefined) {
                throw options.fail;
              }
              yield { type: 'message_start' };
              for (const text of options.deltas ?? []) {
                yield { type: 'content_block_delta', delta: { type: 'text_delta', text } };
              }
            },
            finalMessage: async () => options.final ?? message((options.deltas ?? []).join('')),
          };
        },
        async create(p) {
          params.push(p);
          if (options.fail !== undefined) {
            throw options.fail;
          }
          return options.final ?? message('{}');
        },
      },
    },
  };
  return { client, params };
}

describe('ClaudeProvider (task 7.2)', () => {
  it('streams text deltas and reports usage, cache reads and time to first token', async () => {
    let clock = 0;
    const { client, params } = fakeClient({ deltas: ['The bulk', 'head gives.'] });
    const provider = new ClaudeProvider({ configured: true, client, now: () => (clock += 100) });
    const deltas: string[] = [];

    const result = await provider.streamText(REQUEST, (text) => deltas.push(text));

    expect(deltas).toEqual(['The bulk', 'head gives.']);
    expect(result.text).toBe('The bulkhead gives.');
    expect(result.stopReason).toBe('end_turn');
    expect(result.usage).toEqual({
      inputTokens: 120,
      outputTokens: 40,
      cacheReadTokens: 2000,
      cacheWriteTokens: 0,
    });
    expect(result.firstTokenMs).toBeGreaterThan(0);
    expect(params[0]).toMatchObject({
      model: 'claude-opus-5',
      system: [
        { type: 'text', text: 'stable rules', cache_control: { type: 'ephemeral' } },
        { type: 'text', text: 'campaign' },
      ],
      messages: [{ role: 'user', content: 'narrate this' }],
      thinking: { type: 'adaptive' },
      output_config: { effort: 'low' },
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
    });
    expect((params[0] as { system: unknown[] }).system[1]).not.toHaveProperty('cache_control');
  });

  it('parses structured output against the schema, keeping usage when it fails', async () => {
    const Schema = z.object({ amount: z.int() });
    const good = new ClaudeProvider({
      configured: true,
      client: fakeClient({ final: message('{"amount":-2}') }).client,
    });
    const bad = new ClaudeProvider({
      configured: true,
      client: fakeClient({ final: message('not json') }).client,
    });

    expect(await good.generateStructured(REQUEST, Schema)).toMatchObject({
      ok: true,
      value: { amount: -2 },
    });
    expect(await bad.generateStructured(REQUEST, Schema)).toMatchObject({
      ok: false,
      usage: { inputTokens: 120 },
    });
  });

  it('refuses to call without a credential (D-116)', async () => {
    const provider = new ClaudeProvider({ configured: false });
    await expect(provider.streamText(REQUEST, () => {})).rejects.toMatchObject({
      kind: 'not_configured',
    });
  });

  it('turns an SDK failure into an AiProviderError', async () => {
    const provider = new ClaudeProvider({
      configured: true,
      client: fakeClient({ fail: new Anthropic.APIConnectionError({ message: 'socket hang up' }) })
        .client,
    });
    const error = await provider.streamText(REQUEST, () => {}).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(AiProviderError);
    expect(error).toMatchObject({ kind: 'unavailable' });
  });
});

describe('classifyError', () => {
  const headers = new Headers();

  it('sorts typed SDK errors, most specific first', () => {
    expect(
      classifyError(new Anthropic.AuthenticationError(401, undefined, 'bad key', headers)),
    ).toBe('auth');
    expect(classifyError(new Anthropic.PermissionDeniedError(403, undefined, 'no', headers))).toBe(
      'auth',
    );
    expect(classifyError(new Anthropic.RateLimitError(429, undefined, 'slow down', headers))).toBe(
      'rate_limited',
    );
    expect(
      classifyError(new Anthropic.InternalServerError(529, undefined, 'overloaded', headers)),
    ).toBe('unavailable');
    expect(classifyError(new Anthropic.APIConnectionError({ message: 'offline' }))).toBe(
      'unavailable',
    );
  });
});

describe('response mapping', () => {
  it('keeps the stop reasons a caller must act on and folds the rest', () => {
    expect(stopReasonOf('end_turn')).toBe('end_turn');
    expect(stopReasonOf('max_tokens')).toBe('max_tokens');
    expect(stopReasonOf('refusal')).toBe('refusal');
    expect(stopReasonOf('pause_turn')).toBe('other');
    expect(stopReasonOf(null)).toBe('other');
  });

  it('treats absent cache counts as zero', () => {
    expect(usageOf({ usage: { input_tokens: 1, output_tokens: 2 } })).toEqual({
      inputTokens: 1,
      outputTokens: 2,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
    });
  });
});

describe('createProviderFromEnv (D-119)', () => {
  it('selects the stub on request', () => {
    expect(createProviderFromEnv({ ASTROLABE_AI_PROVIDER: 'stub' }).name).toBe('stub');
  });

  it('defaults to Claude Opus 5, unconfigured without a credential', () => {
    const provider = createProviderFromEnv({});
    expect(provider).toMatchObject({
      name: 'anthropic',
      model: 'claude-opus-5',
      configured: false,
    });
  });

  it('honours a model override and an API key', () => {
    const provider = createProviderFromEnv({
      ANTHROPIC_API_KEY: 'sk-test',
      ASTROLABE_CLAUDE_MODEL: 'claude-sonnet-5',
    });
    expect(provider).toMatchObject({ model: 'claude-sonnet-5', configured: true });
  });
});
