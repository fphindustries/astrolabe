import { STARFORGED } from '@astrolabe/rules';
import type { EventId, OracleChip, PayloadFor } from '@astrolabe/shared';
import { describe, expect, it } from 'vitest';

import { emptyCampaignState } from './state-fixture.js';
import { buildTruths, truthProgress, TRUTH_STATUS_TEXT } from './truths.js';

/**
 * The Truths overview and one truth's answer (5.1, 5.2).
 *
 * The properties worth pinning are the ones a component would get wrong
 * quietly: an open truth counts as decided, a quest starter never joins the
 * answer, and a cited roll that cannot be resolved renders nothing rather than
 * an empty chip.
 */

const EXODUS = STARFORGED.truths[1]!;
const CATACLYSM = STARFORGED.truths[0]!;
const ROLL = 'aaaaaaaa-0000-4000-8000-000000000042' as EventId;

const decided = (
  payload: Partial<PayloadFor<'truth.decided'>> & {
    truthId: PayloadFor<'truth.decided'>['truthId'];
  },
  seq = 5,
): PayloadFor<'truth.decided'> & { eventId: EventId; seq: number } => ({
  resolution: 'selected',
  provenance: 'official_choice',
  groundedIn: [],
  eventId: `aaaaaaaa-0000-4000-8000-${String(seq).padStart(12, '0')}` as EventId,
  seq,
  ...payload,
});

const chip: OracleChip = {
  eventId: ROLL,
  oracleId: 'oracle:exodus',
  roll: 42,
  rowText: 'A ragtag fleet.',
  voided: false,
};

describe('the truths overview (5.1)', () => {
  it('lists every setting truth in the book’s order, undecided by default', () => {
    const views = buildTruths(emptyCampaignState(), {}, []);

    expect(views).toHaveLength(14);
    expect(views.map((view) => view.truthId)).toEqual(STARFORGED.truths.map((truth) => truth.id));
    expect(views[0]?.status).toBe('not_decided');
    expect(views[0]?.statusText).toBe(TRUTH_STATUS_TEXT.not_decided);
    expect(views[0]?.overviewText).toBe('No answer yet.');
  });

  it('counts a truth left open as decided (A24, D-162)', () => {
    // The distinction A24 turns on. Leaving a truth open answers the question;
    // counting it as outstanding would make the section uncompletable for a
    // player who used a path the rules offer.
    const state = emptyCampaignState({
      truthDecisions: {
        [EXODUS.id]: decided({
          truthId: EXODUS.id,
          resolution: 'leave_open',
          provenance: 'player_written',
        }),
      },
    });

    const views = buildTruths(state, {}, []);
    const exodus = views.find((view) => view.truthId === EXODUS.id);

    expect(exodus?.status).toBe('left_open');
    expect(exodus?.overviewText).toBe('Deliberately left open.');
    expect(truthProgress(views)).toMatchObject({ decided: 1, total: 14, text: '1 of 14 decided' });
  });

  it('reads "14 of 14 decided" when every truth is settled', () => {
    const state = emptyCampaignState({
      truthDecisions: Object.fromEntries(
        STARFORGED.truths.map((truth) => [
          truth.id,
          decided({ truthId: truth.id, optionIndex: 0 }),
        ]),
      ),
    });

    expect(truthProgress(buildTruths(state, {}, [])).text).toBe('14 of 14 decided');
  });

  it('does not count a decided truth the server is still blocking', () => {
    // A Milestone 1 campaign's truths arrive through the `truth.set` arm, with
    // no nested choice the validator wants. Counting them would put "14 of 14
    // decided" beside a section chip reading In progress, with neither line
    // explaining the other.
    const state = emptyCampaignState({
      truthDecisions: {
        [CATACLYSM.id]: decided({ truthId: CATACLYSM.id, optionIndex: 0 }),
      },
    });
    const blocker = {
      section: 'truths' as const,
      code: 'truth_subchoice_missing',
      path: `truths.${CATACLYSM.id}`,
      message: 'Cataclysm needs its nested choice.',
    };

    const views = buildTruths(state, {}, [blocker]);
    const view = views.find((candidate) => candidate.truthId === CATACLYSM.id);

    expect(view?.status).toBe('needs_attention');
    // The server's own words, not a restatement of them.
    expect(view?.overviewText).toBe('Cataclysm needs its nested choice.');
    expect(view?.blockers).toEqual([blocker]);
    expect(truthProgress(views).decided).toBe(0);
  });

  it('shows a blocker only against the truth it names', () => {
    const state = emptyCampaignState({
      truthDecisions: { [EXODUS.id]: decided({ truthId: EXODUS.id, optionIndex: 0 }) },
    });

    const views = buildTruths(state, {}, [
      {
        section: 'truths',
        code: 'truth_missing',
        path: `truths.${CATACLYSM.id}`,
        message: 'Cataclysm must be answered or left open.',
      },
    ]);

    expect(views.find((view) => view.truthId === EXODUS.id)?.status).toBe('answered');
    expect(views.find((view) => view.truthId === EXODUS.id)?.blockers).toEqual([]);
  });

  it('shows the answer’s short form on the overview line, not the whole option', () => {
    const state = emptyCampaignState({
      truthDecisions: {
        [EXODUS.id]: decided({
          truthId: EXODUS.id,
          optionIndex: 1,
          text: EXODUS.rows[1]!.description,
          summary: EXODUS.rows[1]!.summary,
        }),
      },
    });

    const exodus = buildTruths(state, {}, []).find((view) => view.truthId === EXODUS.id);
    expect(exodus?.overviewText).toBe(EXODUS.rows[1]!.summary);
    expect(exodus?.answer?.text).toBe(EXODUS.rows[1]!.description);
  });
});

describe('one truth (5.2)', () => {
  it('keeps a quest starter out of the answer, in its own field (A25, D-162)', () => {
    const withStarter = EXODUS.rows.findIndex((row) => row.questStarter !== undefined);
    const state = emptyCampaignState({
      truthDecisions: {
        [EXODUS.id]: decided({
          truthId: EXODUS.id,
          optionIndex: withStarter,
          text: EXODUS.rows[withStarter]!.description,
          questStarter: EXODUS.rows[withStarter]!.questStarter!,
        }),
      },
    });

    const answer = buildTruths(state, {}, []).find((view) => view.truthId === EXODUS.id)?.answer;

    expect(answer?.questStarter).toBe(EXODUS.rows[withStarter]!.questStarter);
    expect(answer?.text).toBe(EXODUS.rows[withStarter]!.description);
    expect(answer?.text).not.toContain(EXODUS.rows[withStarter]!.questStarter);
  });

  it('resolves a nested subchoice to its words (A25)', () => {
    const subchoice = CATACLYSM.rows[0]!.subchoice!;
    const state = emptyCampaignState({
      truthDecisions: {
        [CATACLYSM.id]: decided({
          truthId: CATACLYSM.id,
          optionIndex: 0,
          subchoiceId: subchoice.id,
          subchoiceOptionIndex: 1,
          text: CATACLYSM.rows[0]!.description,
        }),
      },
    });

    const view = buildTruths(state, {}, []).find((truth) => truth.truthId === CATACLYSM.id);

    expect(view?.answer?.subchoiceText).toBe(subchoice.rows[1]!.text);
    expect(view?.options[0]?.subchoice?.options).toHaveLength(subchoice.rows.length);
  });

  it('resolves the rolls an answer cites into chips (A41)', () => {
    const state = emptyCampaignState({
      truthDecisions: {
        [EXODUS.id]: decided({
          truthId: EXODUS.id,
          resolution: 'rolled',
          provenance: 'oracle_roll',
          optionIndex: 1,
          text: EXODUS.rows[1]!.description,
          groundedIn: [ROLL],
        }),
      },
    });

    const answer = buildTruths(state, { [ROLL]: chip }, []).find(
      (view) => view.truthId === EXODUS.id,
    )?.answer;

    expect(answer?.chips).toEqual([chip]);
    expect(answer?.provenanceText).toBe('Rolled');
  });

  it('resolves every roll a nested answer cites, in the order cited (A41)', () => {
    // Rolling Cataclysm writes two rolls into one `groundedIn` — the truth
    // table and its nested table — which is the case beat 2 walks.
    const nestedRoll = 'aaaaaaaa-0000-4000-8000-000000000043' as EventId;
    const nestedChip: OracleChip = {
      eventId: nestedRoll,
      oracleId: 'oracle:cataclysm/0',
      roll: 7,
      rowText: 'It came from outside.',
      voided: false,
    };
    const state = emptyCampaignState({
      truthDecisions: {
        [CATACLYSM.id]: decided({
          truthId: CATACLYSM.id,
          resolution: 'rolled',
          provenance: 'oracle_roll',
          optionIndex: 0,
          subchoiceId: CATACLYSM.rows[0]!.subchoice!.id,
          subchoiceOptionIndex: 0,
          groundedIn: [ROLL, nestedRoll],
        }),
      },
    });

    const answer = buildTruths(state, { [ROLL]: chip, [nestedRoll]: nestedChip }, []).find(
      (view) => view.truthId === CATACLYSM.id,
    )?.answer;

    expect(answer?.chips).toEqual([chip, nestedChip]);
    expect(answer?.subchoiceText).toBe(CATACLYSM.rows[0]!.subchoice!.rows[0]!.text);
  });

  it('renders no chip for a citation it cannot resolve', () => {
    // A roll can be voided away, and a struck chip is the narrative log's job.
    // A blank chip beside an answer would claim a roll nobody can inspect.
    const state = emptyCampaignState({
      truthDecisions: {
        [EXODUS.id]: decided({
          truthId: EXODUS.id,
          resolution: 'rolled',
          provenance: 'oracle_roll',
          groundedIn: [ROLL],
        }),
      },
    });

    expect(
      buildTruths(state, {}, []).find((view) => view.truthId === EXODUS.id)?.answer?.chips,
    ).toEqual([]);
  });

  it('distinguishes the Guide’s answer from the player’s own (A41)', () => {
    const state = emptyCampaignState({
      truthDecisions: {
        [EXODUS.id]: decided({
          truthId: EXODUS.id,
          optionIndex: 0,
          provenance: 'guide_proposal_edited',
          text: 'Something the player reworded.',
        }),
      },
    });

    expect(
      buildTruths(state, {}, []).find((view) => view.truthId === EXODUS.id)?.answer?.provenanceText,
    ).toBe('Suggested by the Guide, edited');
  });

  it('carries earlier answers, oldest first, with their own provenance (A26)', () => {
    const state = emptyCampaignState({
      truthDecisions: {
        [EXODUS.id]: decided({ truthId: EXODUS.id, optionIndex: 2, text: 'The third answer.' }, 9),
      },
      truthHistory: {
        [EXODUS.id]: [
          decided(
            {
              truthId: EXODUS.id,
              resolution: 'custom',
              provenance: 'player_written',
              text: 'The first answer.',
            },
            5,
          ),
          decided({ truthId: EXODUS.id, optionIndex: 1, text: 'The second answer.' }, 7),
        ],
      },
    });

    const view = buildTruths(state, {}, []).find((truth) => truth.truthId === EXODUS.id);

    expect(view?.history.map((entry) => entry.text)).toEqual([
      'The first answer.',
      'The second answer.',
    ]);
    expect(view?.history[0]?.provenanceText).toBe('Written');
    expect(view?.answer?.text).toBe('The third answer.');
  });

  it('carries no history for a truth decided once', () => {
    const state = emptyCampaignState({
      truthDecisions: { [EXODUS.id]: decided({ truthId: EXODUS.id, optionIndex: 0 }) },
    });

    expect(buildTruths(state, {}, []).find((view) => view.truthId === EXODUS.id)?.history).toEqual(
      [],
    );
  });
});
