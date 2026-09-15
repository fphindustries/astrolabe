import { describe, expect, it } from 'vitest';

import { databaseUrlFromEnv, toTimestamp } from './client.js';

describe('databaseUrlFromEnv', () => {
  it('returns the configured url', () => {
    expect(databaseUrlFromEnv({ DATABASE_URL: 'postgres://x/y' })).toBe('postgres://x/y');
  });

  it('throws rather than defaulting to localhost', () => {
    // A server that silently connects to the wrong database is worse than
    // one that refuses to start.
    expect(() => databaseUrlFromEnv({})).toThrow(/DATABASE_URL is not set/);
    expect(() => databaseUrlFromEnv({ DATABASE_URL: '' })).toThrow(/DATABASE_URL is not set/);
  });

  it('names the command that fixes it', () => {
    expect(() => databaseUrlFromEnv({})).toThrow(/docker compose up -d db/);
  });
});

describe('toTimestamp', () => {
  it('converts the driver Date an occurredAt comes back as', () => {
    expect(toTimestamp(new Date('2026-09-12T19:00:00.000Z'))).toBe('2026-09-12T19:00:00.000Z');
  });

  it('passes a string through unchanged', () => {
    expect(toTimestamp('2026-09-12T19:00:00.000Z')).toBe('2026-09-12T19:00:00.000Z');
  });
});
