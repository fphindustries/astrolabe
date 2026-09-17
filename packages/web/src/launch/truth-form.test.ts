import { STARFORGED } from '@astrolabe/rules';
import { LaunchDraftSavedSchema } from '@astrolabe/shared';
import type { EventId, PayloadFor } from '@astrolabe/shared';
import { describe, expect, it } from 'vitest';

import { emptyCampaignState } from './state-fixture.js';
import {
  initialTruthsForm,
  selectOption,
  selectSubchoice,
  toDecideRequest,
  toDraftSnapshot,
  unsavedTruths,
  writeCustom,
} from './truth-form.js';

/**
 * The Truths form (5.1, 5.2).
 *
 * Two properties carry the weight: D-182's precedence applied **per truth**,
 * and a decision that is not yet a decision never reaching the server.
 */

const EXODUS = STARFORGED.truths[1]!;
const COMMUNITIES = STARFORGED.truths[2]!;
const CATACLYSM = STARFORGED.truths[0]!;

const decided = (
  payload: Partial<PayloadFor<'truth.decided'>> & {
    truthId: PayloadFor<'truth.decided'>['truthId'];
  },
  seq: number,
): PayloadFor<'truth.decided'> & { eventId: EventId; seq: number } => ({
  resolution: 'selected',
  provenance: 'official_choice',
  groundedIn: [],
  eventId: `aaaaaaaa-0000-4000-8000-${String(seq).padStart(12, '0')}` as EventId,
  seq,
  ...payload,
});

describe('opening the truths form (D-182, A23)', () => {
  it('opens empty for a campaign that has decided nothing', () => {
    expect(initialTruthsForm(emptyCampaignState())).toEqual({});
  });

  it('restores an accepted truth when there is no draft', () => {
    const state = emptyCampaignState({
      truthDecisions: { [EXODUS.id]: decided({ truthId: EXODUS.id, optionIndex: 1 }, 5) },
    });

    expect(initialTruthsForm(state)[EXODUS.id]).toEqual({
      resolution: 'selected',
      optionIndex: 1,
    });
  });

  it('restores a saved draft that no accepted fact has caught up with', () => {
    const state = emptyCampaignState({
      drafts: {
        truths: {
          snapshot: {
            decisions: [{ truthId: EXODUS.id, resolution: 'custom', text: 'Half a thought' }],
          },
          seq: 4,
        },
      },
    });

    expect(initialTruthsForm(state)[EXODUS.id]).toEqual({
      resolution: 'custom',
      text: 'Half a thought',
    });
  });

  it('prefers whichever was written last for that one truth', () => {
    // D-182's sequence, per truth: a draft written before the truth was
    // accepted must not show stale words beside a section reporting it decided.
    const state = emptyCampaignState({
      truthDecisions: { [EXODUS.id]: decided({ truthId: EXODUS.id, optionIndex: 2 }, 11) },
      drafts: {
        truths: {
          snapshot: {
            decisions: [{ truthId: EXODUS.id, resolution: 'custom', text: 'Older words' }],
          },
          seq: 10,
        },
      },
    });

    expect(initialTruthsForm(state)[EXODUS.id]).toEqual({
      resolution: 'selected',
      optionIndex: 2,
    });
  });

  it('keeps drafted work on every other truth when one is accepted', () => {
    // The reason precedence is per truth rather than per section. One accepted
    // truth must not discard thirteen neighbours' unsaved work — which is
    // exactly what comparing the section's single `seq` would do.
    const state = emptyCampaignState({
      truthDecisions: { [EXODUS.id]: decided({ truthId: EXODUS.id, optionIndex: 2 }, 11) },
      drafts: {
        truths: {
          snapshot: {
            decisions: [
              { truthId: EXODUS.id, resolution: 'custom', text: 'Older words' },
              { truthId: COMMUNITIES.id, resolution: 'custom', text: 'Still being written' },
            ],
          },
          seq: 10,
        },
      },
    });

    const form = initialTruthsForm(state);
    expect(form[EXODUS.id]).toEqual({ resolution: 'selected', optionIndex: 2 });
    expect(form[COMMUNITIES.id]).toEqual({ resolution: 'custom', text: 'Still being written' });
  });

  it('carries no accepted-fact fields into form state, and no chosen option’s words', () => {
    // `text` is the custom answer's box. On a chosen truth it holds the book's
    // own description, and copying it in would fill "your own answer" with
    // words the player never wrote the moment they looked at it.
    const state = emptyCampaignState({
      truthDecisions: {
        [EXODUS.id]: decided(
          { truthId: EXODUS.id, optionIndex: 0, text: 'x', summary: 'y', questStarter: 'z' },
          5,
        ),
      },
    });

    expect(Object.keys(initialTruthsForm(state)[EXODUS.id] ?? {})).toEqual([
      'resolution',
      'optionIndex',
    ]);
  });
});

describe('what the truths form sends', () => {
  it('mints a draft the server will parse', () => {
    const form = {
      [EXODUS.id]: { resolution: 'custom' as const, text: 'Mine' },
      [CATACLYSM.id]: { resolution: 'selected' as const, optionIndex: 0, subchoiceOptionIndex: 1 },
    };

    const parsed = LaunchDraftSavedSchema.safeParse({
      section: 'truths',
      snapshot: toDraftSnapshot(form),
    });

    expect(parsed.success).toBe(true);
    // Source order, so a reopened draft reads the way the page is laid out.
    expect(toDraftSnapshot(form).decisions.map((decision) => decision.truthId)).toEqual([
      CATACLYSM.id,
      EXODUS.id,
    ]);
  });

  it('sends a rolled truth without naming a row (section 4, section 9)', () => {
    // The server rolls. A client that picked the row would be generating the
    // result it is supposed to be asking for.
    expect(toDecideRequest(EXODUS.id, { resolution: 'rolled' })).toEqual({
      truthId: EXODUS.id,
      resolution: 'rolled',
    });
  });

  it('sends a truth left open as the decision it is', () => {
    expect(toDecideRequest(EXODUS.id, { resolution: 'leave_open' })).toEqual({
      truthId: EXODUS.id,
      resolution: 'leave_open',
    });
  });

  it('refuses to send a custom answer that is only whitespace', () => {
    // `custom_text_required` on the server; a control the screen should have
    // disabled would otherwise become a 422.
    expect(toDecideRequest(EXODUS.id, { resolution: 'custom', text: '   \n' })).toBeNull();
    expect(toDecideRequest(EXODUS.id, { resolution: 'custom', text: '  Mine  ' })).toEqual({
      truthId: EXODUS.id,
      resolution: 'custom',
      text: 'Mine',
    });
  });

  it('refuses to send an option index the truth does not have', () => {
    expect(toDecideRequest(EXODUS.id, { resolution: 'selected', optionIndex: 9 })).toBeNull();
    expect(toDecideRequest(EXODUS.id, { resolution: 'selected' })).toBeNull();
  });

  it('refuses an option with a nested choice until the nested choice is made (A25)', () => {
    const subchoice = CATACLYSM.rows[0]!.subchoice!;

    expect(toDecideRequest(CATACLYSM.id, { resolution: 'selected', optionIndex: 0 })).toBeNull();
    expect(
      toDecideRequest(CATACLYSM.id, {
        resolution: 'selected',
        optionIndex: 0,
        subchoiceOptionIndex: 99,
      }),
    ).toBeNull();
    expect(
      toDecideRequest(CATACLYSM.id, {
        resolution: 'selected',
        optionIndex: 0,
        subchoiceOptionIndex: 2,
      }),
    ).toEqual({
      truthId: CATACLYSM.id,
      resolution: 'selected',
      optionIndex: 0,
      // Named by the server's own id rather than by whatever the form held, so
      // the nested table a decision claims is the one the option actually has.
      subchoiceId: subchoice.id,
      subchoiceOptionIndex: 2,
    });
  });

  it('sends nothing for a truth the player has not touched', () => {
    expect(toDecideRequest(EXODUS.id, {})).toBeNull();
  });
});

describe('unsaved work', () => {
  it('names the truths whose selection has moved since the form opened', () => {
    const baseline = { [EXODUS.id]: { resolution: 'selected' as const, optionIndex: 1 } };
    const edited = {
      [EXODUS.id]: { resolution: 'selected' as const, optionIndex: 2 },
      [COMMUNITIES.id]: { resolution: 'custom' as const, text: 'New' },
    };

    expect(unsavedTruths(baseline, baseline)).toEqual([]);
    expect(new Set(unsavedTruths(edited, baseline))).toEqual(new Set([EXODUS.id, COMMUNITIES.id]));
  });

  it('says nothing about a truth the server settled without the player picking', () => {
    // A rolled truth has an accepted decision and no local selection. Reading
    // that as a difference would warn about work nobody did.
    expect(unsavedTruths({}, { [EXODUS.id]: { resolution: 'rolled', optionIndex: 1 } })).toEqual(
      [],
    );
  });

  it('does not call an empty answer a change', () => {
    const baseline = { [EXODUS.id]: { resolution: 'custom' as const } };
    expect(unsavedTruths({ [EXODUS.id]: { resolution: 'custom', text: '' } }, baseline)).toEqual(
      [],
    );
  });
});

describe('moving between the paths', () => {
  const PROPOSAL = 'aaaaaaaa-0000-4000-8000-000000000007' as EventId;

  it('keeps a typed answer when the player clicks an option to compare it', () => {
    // The defect this exists to prevent: the first version of this transition
    // lived in an `onChange` body, replaced the whole selection, and threw the
    // player's own words away the moment they looked at an official option.
    const typed = { resolution: 'custom' as const, text: 'A slow unmaking.' };

    const compared = selectOption(typed, 1);
    expect(compared).toMatchObject({ resolution: 'selected', optionIndex: 1 });
    expect(compared.text).toBe('A slow unmaking.');

    // And it is still there on the way back.
    expect(writeCustom(compared, compared.text ?? '').text).toBe('A slow unmaking.');
  });

  it('drops a nested choice that belonged to the option before it (A25)', () => {
    // A nested index carried across can land on a valid row of a different
    // table by coincidence, and then `toDecideRequest` would happily send it.
    const chosen = {
      resolution: 'selected' as const,
      optionIndex: 0,
      subchoiceId: CATACLYSM.rows[0]!.subchoice!.id,
      subchoiceOptionIndex: 3,
    };

    const moved = selectOption(chosen, 1);
    expect(moved.subchoiceOptionIndex).toBeUndefined();
    expect(moved.subchoiceId).toBeUndefined();
    expect(toDecideRequest(CATACLYSM.id, moved)).toBeNull();
  });

  it('keeps the nested choice while the option stays put', () => {
    const chosen = { resolution: 'selected' as const, optionIndex: 0 };
    expect(selectSubchoice(chosen, 2)).toEqual({
      resolution: 'selected',
      optionIndex: 0,
      subchoiceOptionIndex: 2,
    });
  });

  it('stops calling it the Guide’s answer once the player moves off it', () => {
    // Nothing clears a held proposal, so "came from the Guide" has to be
    // session intent that a manual move ends — otherwise a revision made an
    // hour later would be recorded as the Guide's.
    const taken = {
      resolution: 'selected' as const,
      optionIndex: 1,
      fromProposalEventId: PROPOSAL,
    };

    expect(toDecideRequest(EXODUS.id, taken)).toMatchObject({ proposalEventId: PROPOSAL });
    expect(selectOption(taken, 2).fromProposalEventId).toBeUndefined();
    expect(writeCustom(taken, 'My own words').fromProposalEventId).toBeUndefined();
    expect(toDecideRequest(EXODUS.id, selectOption(taken, 2))).not.toHaveProperty(
      'proposalEventId',
    );
  });

  it('keeps the proposal out of the draft, which records words rather than intent', () => {
    const form = {
      [EXODUS.id]: { resolution: 'custom' as const, text: 'Mine', fromProposalEventId: PROPOSAL },
    };

    const parsed = LaunchDraftSavedSchema.safeParse({
      section: 'truths',
      snapshot: toDraftSnapshot(form),
    });

    expect(parsed.success).toBe(true);
    expect(toDraftSnapshot(form).decisions[0]).not.toHaveProperty('fromProposalEventId');
  });
});
