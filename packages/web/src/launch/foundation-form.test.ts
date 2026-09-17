import { describe, expect, it } from 'vitest';

import { DEFAULT_CAMPAIGN_SETTINGS, LaunchDraftSavedSchema } from '@astrolabe/shared';
import type { CampaignSettings, CampaignState, EventId } from '@astrolabe/shared';

import {
  initialFoundationForm,
  isDirty,
  toDraftSnapshot,
  toFoundationRequest,
} from './foundation-form.js';
import { emptyCampaignState, NAMED_CAMPAIGN } from './state-fixture.js';

const EVENT = '11111111-1111-4111-8111-111111111111' as EventId;

const acceptedAt = (seq: number, premise: string, settings?: Partial<CampaignSettings>) => ({
  foundation: {
    premise,
    settings: { ...DEFAULT_CAMPAIGN_SETTINGS, ...settings },
    provenance: 'player_written' as const,
    groundedIn: [],
    eventId: EVENT,
    seq,
  },
});

const draftedAt = (
  seq: number,
  snapshot: { premise?: string; settings?: Partial<CampaignSettings> },
) => ({
  drafts: { foundation: { snapshot, seq } },
});

const state = (...parts: Partial<CampaignState['launch']>[]): CampaignState =>
  emptyCampaignState(Object.assign({}, ...parts));

describe('what the Foundation form opens with', () => {
  it('starts empty, on the campaign defaults', () => {
    const form = initialFoundationForm(emptyCampaignState());

    expect(form).toEqual({ premise: '', settings: DEFAULT_CAMPAIGN_SETTINGS });
  });

  it('prefers the campaign’s own settings to the defaults', () => {
    const form = initialFoundationForm({
      ...emptyCampaignState(),
      ...NAMED_CAMPAIGN,
      campaign: {
        ...NAMED_CAMPAIGN.campaign,
        settings: { ...DEFAULT_CAMPAIGN_SETTINGS, rerollCap: 4 },
      },
    });

    expect(form.settings.rerollCap).toBe(4);
  });

  it('prefers an accepted foundation to the campaign’s settings', () => {
    const form = initialFoundationForm(state(acceptedAt(10, 'Accepted words.', { rerollCap: 6 })));

    expect(form).toMatchObject({ premise: 'Accepted words.' });
    expect(form.settings.rerollCap).toBe(6);
  });

  it('restores a saved draft, so leaving and reopening loses nothing (A23)', () => {
    const form = initialFoundationForm(state(draftedAt(5, { premise: 'Drafted words.' })));

    expect(form.premise).toBe('Drafted words.');
  });

  it('lets a partial draft override one setting without blanking the others', () => {
    // The bug this function exists to prevent. A draft's settings are partial,
    // and spreading a partial whose other keys are present-but-undefined would
    // wipe out the accepted values underneath.
    const form = initialFoundationForm(
      state(
        acceptedAt(10, 'Accepted words.', { narrationLatitude: 'full_voice', rerollCap: 6 }),
        draftedAt(11, { settings: { rerollCap: 1 } }),
      ),
    );

    expect(form.settings).toMatchObject({ narrationLatitude: 'full_voice', rerollCap: 1 });
  });

  it('shows the accepted words when they were written after the draft (D-182)', () => {
    // The three-step sequence: save a draft, edit the field again, accept
    // *those* words without re-saving, reload. A form that simply preferred its
    // draft would show "Drafted words." here — beside a dashboard reporting the
    // section complete from the accepted ones. The form and its own status
    // would be contradicting each other.
    const form = initialFoundationForm(
      state(draftedAt(10, { premise: 'Drafted words.' }), acceptedAt(11, 'Accepted words.')),
    );

    expect(form.premise).toBe('Accepted words.');
  });

  it('shows a draft saved after acceptance, so A23 still holds', () => {
    // The mirror, and why the rule is not simply "accepted wins": work saved
    // after a fact was accepted is still work, and must come back.
    const form = initialFoundationForm(
      state(acceptedAt(10, 'Accepted words.'), draftedAt(11, { premise: 'Newer draft.' })),
    );

    expect(form.premise).toBe('Newer draft.');
  });
});

describe('what the Foundation form sends', () => {
  it('sends a draft the server’s own schema accepts', () => {
    // The client cannot mint an unparseable draft and earn a 400: the schema
    // that guards the route is the one asserted here.
    const snapshot = toDraftSnapshot({
      premise: 'Drafted words.',
      settings: DEFAULT_CAMPAIGN_SETTINGS,
    });

    expect(LaunchDraftSavedSchema.safeParse({ section: 'foundation', snapshot }).success).toBe(
      true,
    );
  });

  it('refuses to send a blank premise, because the server would (D-181)', () => {
    for (const premise of ['', '   ', '\n'])
      expect(toFoundationRequest({ premise, settings: DEFAULT_CAMPAIGN_SETTINGS })).toBeNull();
  });

  it('trims the premise it does send', () => {
    expect(
      toFoundationRequest({
        premise: '  A signal past the Drift.  ',
        settings: DEFAULT_CAMPAIGN_SETTINGS,
      }),
    ).toEqual({ premise: 'A signal past the Drift.', settings: DEFAULT_CAMPAIGN_SETTINGS });
  });
});

describe('whether the form has unsaved work', () => {
  it('is clean as opened and dirty after any edit', () => {
    const baseline = initialFoundationForm(state(acceptedAt(10, 'Accepted words.')));

    expect(isDirty(baseline, baseline)).toBe(false);
    expect(isDirty({ ...baseline, premise: 'Edited.' }, baseline)).toBe(true);
    expect(
      isDirty({ ...baseline, settings: { ...baseline.settings, rerollCap: 9 } }, baseline),
    ).toBe(true);
  });
});
