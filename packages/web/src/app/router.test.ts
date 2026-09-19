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

  it('matches the campaign home, which decides play or launch (4.4)', () => {
    // The campaign list links here. It is no longer the play screen: what the
    // screen behind it renders depends on whether launch is still open, and
    // only the server knows that.
    expect(matchRoute('/campaigns/abc-123')).toEqual({
      name: 'campaign-home',
      campaignId: 'abc-123',
    });
  });

  it('gives the play screen an address of its own', () => {
    expect(matchRoute('/campaigns/abc-123/play')).toEqual({ name: 'play', campaignId: 'abc-123' });
  });

  it('matches the launch workspace, its review, and one section', () => {
    expect(matchRoute('/campaigns/abc-123/launch')).toEqual({
      name: 'launch-overview',
      campaignId: 'abc-123',
    });
    // Ordering matters: `review` would otherwise fall through to the section
    // arm and be rejected as an unknown section.
    expect(matchRoute('/campaigns/abc-123/launch/review')).toEqual({
      name: 'launch-review',
      campaignId: 'abc-123',
    });
    expect(matchRoute('/campaigns/abc-123/launch/connection_troubles')).toEqual({
      name: 'launch-section',
      campaignId: 'abc-123',
      section: 'connection_troubles',
    });
  });

  it('refuses a launch path that names no section', () => {
    for (const pathname of [
      '/campaigns/abc/launch/nonsense',
      '/campaigns/abc/launch/foundation/extra',
    ])
      expect(matchRoute(pathname)).toEqual({ name: 'not-found', pathname });
  });

  it('no longer routes Milestone 1 character creation (D-206)', () => {
    expect(matchRoute('/campaigns/abc-123/characters/new')).toEqual({
      name: 'not-found',
      pathname: '/campaigns/abc-123/characters/new',
    });
  });

  it('tolerates a trailing slash', () => {
    expect(matchRoute('/campaigns/abc-123/')).toEqual({
      name: 'campaign-home',
      campaignId: 'abc-123',
    });
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
