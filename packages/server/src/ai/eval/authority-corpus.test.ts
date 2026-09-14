import { describe, expect, it } from 'vitest';

import { checkAuthority } from '../checked.js';
import { StubProvider } from '../stub.js';

import { checkerFor, grade, loadCorpus, loadRecordedVerdicts, subjectOf } from './corpus.js';

/**
 * D-128's recorded verdicts, replayed through the stub (task 7.15).
 *
 * Verdicts are not unit tested (§10): whether the checker is right is what
 * `npm run eval:authority` measures, live. What CI holds still is
 * everything around the verdict — the schema a real answer came back in,
 * quote verification against real text, and the withdraw-or-pass decision
 * made from it — and that the recorded agreement with the corpus hasn't
 * silently changed.
 */

const corpus = loadCorpus();
const recorded = loadRecordedVerdicts();

describe('the authority corpus (D-128)', () => {
  it('labels every entry, with the rules a withdrawal should name', () => {
    expect(corpus.length).toBeGreaterThanOrEqual(20);
    expect(new Set(corpus.map((e) => e.id)).size).toBe(corpus.length);
    for (const entry of corpus) {
      expect(entry.expected.withdraw).toBe(entry.expected.rules.length > 0);
      for (const segment of entry.segments ?? []) {
        expect(entry.text).toContain(segment.text);
      }
    }
    // Both kinds of evidence, and more recorded output than constructed.
    expect(corpus.filter((e) => e.expected.withdraw).length).toBeGreaterThanOrEqual(10);
    expect(corpus.filter((e) => !e.expected.withdraw).length).toBeGreaterThanOrEqual(10);
    expect(corpus.filter((e) => e.source.startsWith('Constructed')).length).toBeLessThan(
      corpus.length / 4,
    );
  });

  it('has a recorded verdict for every entry', () => {
    expect(recorded).toBeDefined();
    expect(Object.keys(recorded?.verdicts ?? {}).sort()).toEqual(corpus.map((e) => e.id).sort());
  });

  describe.each(corpus.map((entry) => [entry.id, entry] as const))('%s', (_id, entry) => {
    it('replays its recorded verdict to the same decision', async () => {
      const verdict = recorded?.verdicts[entry.id];
      if (verdict?.answer === null || verdict === undefined) {
        throw new Error(
          `No recorded answer for ${entry.id}; run npm run eval:authority -- --record.`,
        );
      }
      const replay = new StubProvider({
        responses: [{ kind: 'structured', value: verdict.answer }],
      });

      const result = await checkAuthority(checkerFor(entry, replay), subjectOf(entry));

      // Every quote the live checker gave is really in the text.
      expect(result.verdict.kind).not.toBe('unchecked');
      expect(replay.requests).toHaveLength(1);
      expect(grade(entry, result.verdict).agrees).toBe(verdict.agrees);
    });
  });
});
