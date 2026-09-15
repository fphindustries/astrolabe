import { writeFileSync } from 'node:fs';

import { checkAuthority } from '../checked.js';
import { ClaudeProvider } from '../claude.js';
import type { CheckerAnswer } from '../context/authority-check.js';
import { DEFAULT_CHECK_MODEL } from '../create-provider.js';

import {
  checkerFor,
  grade,
  loadCorpus,
  subjectOf,
  VERDICTS_URL,
  type RecordedVerdicts,
} from './corpus.js';

/**
 * `npm run eval:authority` (D-128): grade the live authority checker on the
 * recorded corpus. Run it whenever the rubric, the checker prompt or
 * `ASTROLABE_CHECK_MODEL` changes. Needs `ANTHROPIC_API_KEY`, and spends
 * tokens — one checker call per entry per run, plus any re-ask.
 *
 *   --runs N    grade each entry N times (default 1)
 *   --record    write the first run's verdicts to authority-verdicts.json,
 *               which CI replays through the stub
 *
 * A false positive pauses play, so precision is reported first.
 */

const args = process.argv.slice(2);
const runs = Number(args[args.indexOf('--runs') + 1]) || 1;
const record = args.includes('--record');

if (!process.env['ANTHROPIC_API_KEY']) {
  console.error('eval:authority needs ANTHROPIC_API_KEY.');
  process.exit(1);
}

const model = process.env['ASTROLABE_CHECK_MODEL'] || DEFAULT_CHECK_MODEL;
const provider = new ClaudeProvider({ configured: true, model });
const corpus = loadCorpus();
const recorded: Record<string, { answer: CheckerAnswer | null; agrees: boolean }> = {};
let tp = 0;
let fp = 0;
let tn = 0;
let fn = 0;
let unchecked = 0;
let inputTokens = 0;
let outputTokens = 0;

console.log(`Authority checker ${model}: ${corpus.length} entries × ${runs} run(s)\n`);

for (const entry of corpus) {
  for (let run = 1; run <= runs; run++) {
    const started = performance.now();
    const { verdict, outcome } = await checkAuthority(
      checkerFor(entry, provider),
      subjectOf(entry),
    );
    const ms = Math.round(performance.now() - started);
    for (const attempt of outcome.attempts) {
      if (attempt.kind === 'completed') {
        inputTokens +=
          attempt.usage.inputTokens +
          attempt.usage.cacheReadTokens +
          attempt.usage.cacheWriteTokens;
        outputTokens += attempt.usage.outputTokens;
      }
    }
    const g = grade(entry, verdict);
    if (g.unchecked) {
      unchecked++;
    } else if (entry.expected.withdraw) {
      if (g.withdrew) tp++;
      else fn++;
    } else if (g.withdrew) {
      fp++;
    } else {
      tn++;
    }

    const mark = g.unchecked ? 'UNCHECKED' : g.agrees ? 'ok ' : 'MISS';
    console.log(
      `${mark} ${entry.id} (run ${run}, ${ms} ms): expected ${entry.expected.withdraw ? `withdraw [${entry.expected.rules.join(', ')}]` : 'pass'}, ` +
        `got ${verdict.kind}${g.caught.length > 0 ? ` caught [${g.caught.join(', ')}]` : ''}${g.extra.length > 0 ? ` extra [${g.extra.join(', ')}]` : ''}`,
    );
    if (verdict.kind === 'violations') {
      for (const v of verdict.violations) {
        console.log(
          `      ${v.rule}${v.segment === null ? '' : ` [${v.segment}]`}: "${v.quote}" — ${v.why}`,
        );
      }
    } else if (verdict.kind === 'unchecked') {
      console.log(`      ${verdict.message}`);
    }
    if (run === 1) {
      recorded[entry.id] = {
        answer: outcome.ok ? (outcome.value as CheckerAnswer) : null,
        agrees: g.agrees,
      };
    }
  }
}

const precision = tp + fp === 0 ? 1 : tp / (tp + fp);
const recall = tp + fn === 0 ? 1 : tp / (tp + fn);
console.log(
  `\nPrecision ${(precision * 100).toFixed(0)}% (${fp} false withdrawal${fp === 1 ? '' : 's'}), ` +
    `recall ${(recall * 100).toFixed(0)}% (${fn} missed), ${tn} passed correctly, ${unchecked} unchecked. ` +
    `Tokens: ${inputTokens} in, ${outputTokens} out.`,
);

if (record) {
  const file: RecordedVerdicts = {
    model,
    recordedAt: new Date().toISOString(),
    verdicts: recorded,
  };
  writeFileSync(VERDICTS_URL, `${JSON.stringify(file, null, 2)}\n`);
  console.log(`Recorded run 1's verdicts to ${VERDICTS_URL.pathname}.`);
}
