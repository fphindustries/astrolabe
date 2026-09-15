import { readFileSync, existsSync } from 'node:fs';

import type { Checker, Verdict } from '../checked.js';
import type { CheckContext, CheckerAnswer, CheckSubject } from '../context/authority-check.js';
import type { AiProvider } from '../provider.js';

/**
 * D-128's regression corpus and its recorded verdicts (task 7.15).
 *
 * The corpus is data (`authority-corpus.json`): generated text, recorded
 * wherever it was, each entry labelled with whether the checker should
 * withdraw it and which rules it breaks. `npm run eval:authority` grades the
 * live checker on it and can record what it said (`authority-verdicts.json`);
 * CI replays those recorded verdicts through the stub, so a change to the
 * rubric's plumbing, the schema or quote verification shows up without a key.
 */

export type RuleId = 'undeclared_action' | 'player_interior' | 'voice' | 'injury';

export interface CorpusEntry {
  readonly id: string;
  readonly source: string;
  readonly role: CheckSubject['role'];
  readonly latitude: CheckContext['latitude'];
  readonly characters: CheckContext['characters'];
  readonly facts?: string;
  readonly text: string;
  readonly segments?: readonly {
    readonly about: 'world' | 'character_undergoes' | 'character_does' | 'character_says';
    readonly character: string | null;
    readonly text: string;
  }[];
  readonly expected: { readonly withdraw: boolean; readonly rules: readonly RuleId[] };
}

export interface RecordedVerdicts {
  readonly model: string;
  readonly recordedAt: string;
  readonly verdicts: Readonly<
    Record<string, { readonly answer: CheckerAnswer | null; readonly agrees: boolean }>
  >;
}

const CORPUS_URL = new URL('./authority-corpus.json', import.meta.url);
export const VERDICTS_URL = new URL('./authority-verdicts.json', import.meta.url);

export function loadCorpus(): readonly CorpusEntry[] {
  return (JSON.parse(readFileSync(CORPUS_URL, 'utf-8')) as { entries: CorpusEntry[] }).entries;
}

export function loadRecordedVerdicts(): RecordedVerdicts | undefined {
  return existsSync(VERDICTS_URL)
    ? (JSON.parse(readFileSync(VERDICTS_URL, 'utf-8')) as RecordedVerdicts)
    : undefined;
}

export function subjectOf(entry: CorpusEntry): CheckSubject {
  return {
    role: entry.role,
    text: entry.text,
    ...(entry.segments === undefined
      ? {}
      : { segments: entry.segments.map((segment) => ({ ...segment, basis: [] })) }),
  };
}

export function checkerFor(entry: CorpusEntry, provider: AiProvider): Checker {
  return {
    provider,
    context: {
      latitude: entry.latitude,
      characters: entry.characters,
      ...(entry.facts === undefined ? {} : { facts: entry.facts }),
    },
  };
}

export interface Grade {
  /** Withdrew exactly when the corpus says it should. */
  readonly agrees: boolean;
  readonly withdrew: boolean;
  readonly unchecked: boolean;
  /** Expected rules the verdict named. */
  readonly caught: readonly RuleId[];
  /** Rules the verdict named that the corpus doesn't expect. */
  readonly extra: readonly string[];
}

export function grade(entry: CorpusEntry, verdict: Verdict): Grade {
  const rules = verdict.kind === 'violations' ? verdict.violations.map((v) => v.rule) : [];
  const withdrew = verdict.kind !== 'pass';
  return {
    agrees: verdict.kind !== 'unchecked' && withdrew === entry.expected.withdraw,
    withdrew,
    unchecked: verdict.kind === 'unchecked',
    caught: entry.expected.rules.filter((rule) => rules.includes(rule)),
    extra: [...new Set(rules.filter((rule) => !(entry.expected.rules as string[]).includes(rule)))],
  };
}
