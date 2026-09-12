import { describe, expect, it } from 'vitest';

import { matchRoute } from './router.js';

describe('matchRoute', () => {
  it('matches the campaign list at the root', () => {
    expect(matchRoute('/')).toEqual({ name: 'campaign-list' });
    expect(matchRoute('')).toEqual({ name: 'campaign-list' });
  });

  it('matches campaign setup', () => {
    expect(matchRoute('/campaigns/new')).toEqual({ name: 'campaign-new' });
  });

  it('matches the play screen with its campaign id', () => {
    expect(matchRoute('/campaigns/abc-123')).toEqual({ name: 'play', campaignId: 'abc-123' });
  });

  it('matches character creation with its campaign id', () => {
    expect(matchRoute('/campaigns/abc-123/characters/new')).toEqual({
      name: 'character-new',
      campaignId: 'abc-123',
    });
  });

  it('tolerates a trailing slash', () => {
    expect(matchRoute('/campaigns/abc-123/')).toEqual({ name: 'play', campaignId: 'abc-123' });
  });

  it('falls back to not-found for anything else', () => {
    expect(matchRoute('/campaigns')).toEqual({ name: 'not-found', pathname: '/campaigns' });
    expect(matchRoute('/campaigns/abc/characters')).toEqual({
      name: 'not-found',
      pathname: '/campaigns/abc/characters',
    });
    expect(matchRoute('/unknown')).toEqual({ name: 'not-found', pathname: '/unknown' });
  });
});
