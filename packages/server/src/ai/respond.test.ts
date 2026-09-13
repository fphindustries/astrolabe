import { describe, expect, it } from 'vitest';
import * as z from 'zod';

import {
  accountingEvents,
  generateValidated,
  streamValidatedText,
  type TextSink,
} from './respond.js';
import { StubProvider } from './stub.js';

const REQUEST = { purpose: 'beat', system: [{ text: 'rules' }], user: 'narrate' } as const;

function recordingSink() {
  const frames: string[] = [];
  const sink: TextSink = {
    delta: (text) => frames.push(`delta:${text}`),
    reset: (reason) => frames.push(`reset:${reason}`),
  };
  return {
    frames,
    sink,
    text: () =>
      frames
        .filter((f) => f.startsWith('delta:'))
        .map((f) => f.slice(6))
        .join(''),
  };
}

describe('streamValidatedText (task 7.5)', () => {
  it('streams a good passage and commits its trimmed text', async () => {
    const provider = new StubProvider({
      responses: [{ kind: 'text', text: '  The bulkhead gives.  ' }],
      chunkSize: 4,
    });
    const { sink, frames } = recordingSink();

    const outcome = await streamValidatedText(provider, REQUEST, sink);

    expect(outcome).toMatchObject({ ok: true, value: 'The bulkhead gives.' });
    expect(frames.length).toBeGreaterThan(1);
    expect(frames.every((f) => f.startsWith('delta:'))).toBe(true);
  });

  it('re-asks once after a truncated passage, telling the reader to discard it', async () => {
    const provider = new StubProvider({
      responses: [
        { kind: 'text', text: 'The bulkhead gi', stopReason: 'max_tokens' },
        { kind: 'text', text: 'The bulkhead gives.' },
      ],
    });
    const { sink, frames } = recordingSink();

    const outcome = await streamValidatedText(provider, REQUEST, sink);

    expect(outcome.ok).toBe(true);
    expect(outcome.attempts).toHaveLength(2);
    expect(frames.filter((f) => f.startsWith('reset:'))).toHaveLength(1);
  });

  it('gives up after two rejected attempts with invalid_output', async () => {
    const provider = new StubProvider({
      responses: [
        { kind: 'text', text: '', stopReason: 'end_turn' },
        { kind: 'text', text: '   ', stopReason: 'end_turn' },
      ],
    });

    const outcome = await streamValidatedText(provider, REQUEST, recordingSink().sink);

    expect(outcome).toMatchObject({ ok: false, errorKind: 'invalid_output' });
    expect(outcome.attempts).toHaveLength(2);
  });

  it('does not re-ask after a provider error', async () => {
    const provider = new StubProvider({
      responses: [{ kind: 'error', errorKind: 'unavailable', message: 'overloaded' }],
    });

    const outcome = await streamValidatedText(provider, REQUEST, recordingSink().sink);

    expect(outcome).toMatchObject({ ok: false, errorKind: 'unavailable', message: 'overloaded' });
    expect(provider.requests).toHaveLength(1);
  });

  it('treats a refusal as final', async () => {
    const provider = new StubProvider({
      responses: [{ kind: 'text', text: 'partial', stopReason: 'refusal' }],
    });
    const { sink, frames } = recordingSink();

    const outcome = await streamValidatedText(provider, REQUEST, sink);

    expect(outcome).toMatchObject({ ok: false, errorKind: 'refused' });
    expect(frames.at(-1)).toMatch(/^reset:/);
    expect(provider.requests).toHaveLength(1);
  });

  it('reports not_configured without a credential', async () => {
    const outcome = await streamValidatedText(
      new StubProvider({ configured: false }),
      REQUEST,
      recordingSink().sink,
    );
    expect(outcome).toMatchObject({ ok: false, errorKind: 'not_configured' });
  });
});

describe('generateValidated (task 7.5)', () => {
  const Schema = z.object({ amount: z.int().min(-3).max(-1), reason: z.string().min(1) });

  it('re-asks once when the value fails its schema', async () => {
    const provider = new StubProvider({
      responses: [
        { kind: 'structured', value: { amount: -5, reason: 'too much' } },
        { kind: 'structured', value: { amount: -2, reason: 'a serious burn' } },
      ],
    });

    const outcome = await generateValidated(
      provider,
      { ...REQUEST, purpose: 'harm_proposal' },
      Schema,
    );

    expect(outcome).toMatchObject({ ok: true, value: { amount: -2 } });
    expect(outcome.attempts).toHaveLength(2);
  });

  it('fails with invalid_output after two bad values', async () => {
    const provider = new StubProvider({
      responses: [
        { kind: 'structured', value: { amount: 0 } },
        { kind: 'structured', value: 'nope' },
      ],
    });

    const outcome = await generateValidated(provider, REQUEST, Schema);

    expect(outcome).toMatchObject({ ok: false, errorKind: 'invalid_output' });
  });
});

describe('accountingEvents (D-113)', () => {
  const provider = { name: 'anthropic', model: 'claude-opus-5' };

  it('writes one ai.completed per returned attempt, with cache fields only when used', () => {
    const events = accountingEvents(provider, 'beat', {
      ok: true,
      value: 'x',
      attempts: [
        {
          kind: 'completed',
          usage: { inputTokens: 10, outputTokens: 5, cacheReadTokens: 900, cacheWriteTokens: 0 },
          latencyMs: 1200,
          firstTokenMs: 800,
        },
      ],
    });

    expect(events).toEqual([
      {
        type: 'ai.completed',
        payload: {
          provider: 'anthropic',
          model: 'claude-opus-5',
          purpose: 'beat',
          inputTokens: 10,
          outputTokens: 5,
          cacheReadTokens: 900,
          latencyMs: 1200,
          firstTokenMs: 800,
        },
      },
    ]);
  });

  it('closes a failed call with ai.failed, never double-counting a rejected attempt', () => {
    const usage = { inputTokens: 10, outputTokens: 5, cacheReadTokens: 0, cacheWriteTokens: 0 };
    const events = accountingEvents(provider, 'beat', {
      ok: false,
      errorKind: 'invalid_output',
      message: 'The response was empty.',
      attempts: [
        { kind: 'completed', usage, latencyMs: 1 },
        { kind: 'completed', usage, latencyMs: 1 },
      ],
    });

    expect(events.map((e) => e.type)).toEqual(['ai.completed', 'ai.completed', 'ai.failed']);
    expect(events[2]?.payload).toEqual({
      provider: 'anthropic',
      model: 'claude-opus-5',
      purpose: 'beat',
      errorKind: 'invalid_output',
      message: 'The response was empty.',
      attempts: 2,
    });
  });

  it('carries a thrown attempt’s partial usage on ai.failed', () => {
    const events = accountingEvents(provider, 'beat', {
      ok: false,
      errorKind: 'unavailable',
      message: 'connection reset',
      attempts: [
        {
          kind: 'failed',
          errorKind: 'unavailable',
          message: 'connection reset',
          usage: { inputTokens: 40, outputTokens: 3, cacheReadTokens: 0, cacheWriteTokens: 0 },
        },
      ],
    });

    expect(events).toHaveLength(1);
    expect(events[0]?.payload).toMatchObject({ inputTokens: 40, outputTokens: 3, attempts: 1 });
  });
});
