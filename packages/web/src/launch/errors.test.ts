import { describe, expect, it } from 'vitest';

import { ApiError } from '../api/http.js';

import { launchErrorSummary } from './errors.js';

const refused = (status: number, body: unknown) => launchErrorSummary(new ApiError(status, body));

describe('what a refused launch command says', () => {
  it('distinguishes a rejected body from a refused command', () => {
    // Which layer said no is the useful information: 400 means fix the form,
    // 422 means the form was fine and the campaign is not.
    expect(refused(400, undefined).title).toBe('The server rejected that form.');
    expect(
      refused(422, { reason: 'premise_required', problem: 'A premise is required.' }).title,
    ).toBe('A premise is required.');
  });

  it('flags a readiness recheck as a stale workspace', () => {
    // The payload the reader was looking at is out of date by definition, so
    // the caller refetches rather than arguing with what is on screen.
    const summary = refused(422, { reason: 'not_ready', problem: 'The campaign is not ready.' });

    expect(summary.staleWorkspace).toBe(true);
    expect(summary.title).toMatch(/rechecked readiness/);
    expect(summary.details).toEqual(['The campaign is not ready.']);
  });

  it('does not treat other refusals as stale', () => {
    for (const reason of ['campaign_active', 'campaign_in_play', 'premise_required'])
      expect(refused(422, { reason }).staleWorkspace).toBe(false);
  });

  it('shows the server’s own sentence once, never twice', () => {
    const summary = refused(422, { reason: 'unknown_to_this_client', problem: 'No such truth.' });

    expect(summary.title).toBe('No such truth.');
    expect(summary.details).toEqual([]);
  });

  it('survives a body that is not the shape it expects', () => {
    for (const body of [undefined, null, 'nope', 42, { problem: 7 }])
      expect(refused(422, body).title).toBe('The server refused that change.');
  });

  it('reports a transport failure as one', () => {
    expect(launchErrorSummary(new Error('offline'))).toEqual({
      title: 'Couldn’t reach the server.',
      details: [],
      staleWorkspace: false,
    });
    expect(refused(500, undefined).title).toBe('Couldn’t reach the server.');
  });

  it('names a campaign that has gone', () => {
    expect(refused(404, undefined).title).toBe('That campaign no longer exists.');
  });
});
