import { writeFileSync } from 'node:fs';

import type { AstrolabeEvent, CampaignId } from '@astrolabe/shared';
import type { z } from 'zod';

import { ClaudeProvider, DEFAULT_CLAUDE_MODEL } from '../claude.js';
import { DEFAULT_CHECK_MODEL, DEFAULT_PLAN_MODEL } from '../create-provider.js';
import type {
  AiProvider,
  AiRequest,
  AiStructuredResult,
  AiTextResult,
  AiUsage,
} from '../provider.js';
import { databaseUrlFromEnv } from '../../db/client.js';
import { readEvents } from '../../db/event-store.js';
import { createTestDatabase } from '../../db/testing.js';
import { fixtureUuid } from '../../fixtures/ids.js';
import { playLanternWakeLaunch } from '../../fixtures/lantern-wake-launch.js';

/**
 * `npm run eval:launch` (10.5): play the golden launch (10.1b) once against
 * the configured Claude Guide, checker and planner, in a throwaway schema,
 * and record for every call whether it passed its schema and its check
 * (and after how many attempts), what the authority checker said, whether
 * every accepted fact's grounding resolves to its rolls, the latency, and
 * the tokens against what `ai.completed` recorded.
 *
 * Needs `ANTHROPIC_API_KEY` and spends tokens: run it only with the owner's
 * approval of the cost, never in CI. The dice past the fixture's loaded faces
 * roll for real, because a live Guide can ask for rolls the script did not.
 *
 *   --out FILE   where to write the record (default live-launch-10.5.json)
 */

const args = process.argv.slice(2);
const outAt = args.indexOf('--out');
const out = outAt >= 0 ? args[outAt + 1]! : 'src/ai/eval/live-launch-10.5.json';

if (!process.env['ANTHROPIC_API_KEY']) {
  console.error('eval:launch needs ANTHROPIC_API_KEY.');
  process.exit(1);
}

interface Call {
  readonly role: 'guide' | 'checker' | 'planner';
  readonly purpose: string;
  readonly model: string;
  readonly kind: 'text' | 'structured';
  /** False when the answer failed its schema, or the provider threw. */
  readonly ok: boolean;
  readonly problem?: string;
  readonly stopReason?: string;
  readonly usage?: AiUsage;
  readonly latencyMs: number;
  /** The checker's structured answer, which is its verdict. */
  readonly verdict?: unknown;
}

const calls: Call[] = [];

/** The provider, with every call it makes written down. */
function recording(role: Call['role'], inner: AiProvider): AiProvider {
  const structured = async <T>(
    request: AiRequest,
    run: () => Promise<AiStructuredResult<T>>,
  ): Promise<AiStructuredResult<T>> => {
    const started = performance.now();
    try {
      const result = await run();
      calls.push({
        role,
        purpose: request.purpose,
        model: inner.model,
        kind: 'structured',
        ok: result.ok,
        ...(result.ok ? {} : { problem: result.problem }),
        stopReason: result.stopReason,
        usage: result.usage,
        latencyMs: result.latencyMs,
        ...(role === 'checker' && result.ok ? { verdict: result.value } : {}),
      });
      return result;
    } catch (error) {
      calls.push({
        role,
        purpose: request.purpose,
        model: inner.model,
        kind: 'structured',
        ok: false,
        problem: String(error),
        latencyMs: Math.round(performance.now() - started),
      });
      throw error;
    }
  };
  return {
    name: inner.name,
    model: inner.model,
    configured: inner.configured,
    async streamText(request, onDelta): Promise<AiTextResult> {
      const started = performance.now();
      try {
        const result = await inner.streamText(request, onDelta);
        calls.push({
          role,
          purpose: request.purpose,
          model: inner.model,
          kind: 'text',
          ok: true,
          stopReason: result.stopReason,
          usage: result.usage,
          latencyMs: result.latencyMs,
        });
        return result;
      } catch (error) {
        calls.push({
          role,
          purpose: request.purpose,
          model: inner.model,
          kind: 'text',
          ok: false,
          problem: String(error),
          latencyMs: Math.round(performance.now() - started),
        });
        throw error;
      }
    },
    generateStructured<T>(request: AiRequest, schema: z.ZodType<T>) {
      return structured(request, () => inner.generateStructured(request, schema));
    },
    streamStructured<T>(request: AiRequest, schema: z.ZodType<T>, onDelta: (json: string) => void) {
      return structured(request, () => inner.streamStructured(request, schema, onDelta));
    },
  };
}

const env = process.env;
const models = {
  guide: env['ASTROLABE_CLAUDE_MODEL'] || DEFAULT_CLAUDE_MODEL,
  checker: env['ASTROLABE_CHECK_MODEL'] || DEFAULT_CHECK_MODEL,
  planner: env['ASTROLABE_PLAN_MODEL'] || DEFAULT_PLAN_MODEL,
};
const live = {
  ai: recording('guide', new ClaudeProvider({ configured: true, model: models.guide })),
  checker: recording('checker', new ClaudeProvider({ configured: true, model: models.checker })),
  planner: recording('planner', new ClaudeProvider({ configured: true, model: models.planner })),
};

databaseUrlFromEnv();
const db = await createTestDatabase('live_launch');
const fixture = 'live-launch';
const campaignId = fixtureUuid<CampaignId>(fixture, 'campaign');
let failure: string | undefined;
const started = performance.now();
try {
  await playLanternWakeLaunch(db.sql, {
    fixture,
    campaignId,
    campaignName: 'Lantern Wake (live)',
    live,
  });
} catch (error) {
  failure = error instanceof Error ? error.message : String(error);
}
const wallMs = Math.round(performance.now() - started);
const events = await readEvents(db.sql, campaignId);
await db.close();

// --- What the log recorded ---------------------------------------------------

type Of<T extends AstrolabeEvent['type']> = Extract<AstrolabeEvent, { type: T }>;
const completed = events.filter((e): e is Of<'ai.completed'> => e.type === 'ai.completed');
const failed = events.filter((e): e is Of<'ai.failed'> => e.type === 'ai.failed');

const sum = (list: readonly (AiUsage | undefined)[]): AiUsage =>
  list.reduce<AiUsage>(
    (total, usage) => ({
      inputTokens: total.inputTokens + (usage?.inputTokens ?? 0),
      outputTokens: total.outputTokens + (usage?.outputTokens ?? 0),
      cacheReadTokens: total.cacheReadTokens + (usage?.cacheReadTokens ?? 0),
      cacheWriteTokens: total.cacheWriteTokens + (usage?.cacheWriteTokens ?? 0),
    }),
    { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 },
  );
const spent = sum(calls.map((call) => call.usage));
const recorded = sum(
  completed.map((e) => ({
    inputTokens: e.payload.inputTokens,
    outputTokens: e.payload.outputTokens,
    cacheReadTokens: e.payload.cacheReadTokens ?? 0,
    cacheWriteTokens: e.payload.cacheWriteTokens ?? 0,
  })),
);
const recordedFailed = failed.reduce<{ inputTokens: number; outputTokens: number }>(
  (total, e) => ({
    inputTokens: total.inputTokens + (e.payload.inputTokens ?? 0),
    outputTokens: total.outputTokens + (e.payload.outputTokens ?? 0),
  }),
  { inputTokens: 0, outputTokens: 0 },
);

// Every command that asked the Guide: how many calls it took, and how it ended.
const commands = new Map<string, { purposes: Set<string>; completed: number; failed: number }>();
for (const e of [...completed, ...failed]) {
  const entry = commands.get(e.commandId) ?? { purposes: new Set(), completed: 0, failed: 0 };
  entry.purposes.add(e.payload.purpose);
  if (e.type === 'ai.completed') entry.completed++;
  else entry.failed++;
  commands.set(e.commandId, entry);
}

// Grounding: every event id a fact cites resolves to a roll in this log.
const byId = new Map(events.map((e) => [e.id as string, e]));
const grounding: { eventType: string; cited: string; resolvesTo: string | null }[] = [];
const walk = (eventType: string, value: unknown, key?: string): void => {
  if (Array.isArray(value)) {
    if (key === 'groundedIn' || key === 'rollEventIds') {
      for (const cited of value) {
        if (typeof cited === 'string' && /^[0-9a-f-]{36}$/.test(cited)) {
          grounding.push({ eventType, cited, resolvesTo: byId.get(cited)?.type ?? null });
        }
      }
    }
    for (const item of value) walk(eventType, item);
  } else if (value !== null && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) walk(eventType, v, k);
  }
};
for (const e of events) walk(e.type, e.payload);
const unresolved = grounding.filter((g) => g.resolvesTo !== 'oracle.rolled');

const report = {
  ranAt: new Date().toISOString(),
  models,
  finished: failure === undefined,
  failure,
  wallMs,
  events: events.length,
  calls,
  byPurpose: Object.fromEntries(
    [...new Set(calls.map((c) => `${c.role}:${c.purpose}`))].map((key) => {
      const list = calls.filter((c) => `${c.role}:${c.purpose}` === key);
      const latencies = list.map((c) => c.latencyMs).sort((a, b) => a - b);
      return [
        key,
        {
          calls: list.length,
          ok: list.filter((c) => c.ok).length,
          medianMs: latencies[Math.floor(latencies.length / 2)],
          maxMs: latencies.at(-1),
          usage: sum(list.map((c) => c.usage)),
        },
      ];
    }),
  ),
  commands: [...commands].map(([commandId, c]) => ({
    commandId,
    purposes: [...c.purposes],
    completed: c.completed,
    failed: c.failed,
  })),
  checker: calls
    .filter((c) => c.role === 'checker')
    .map((c) => ({ purpose: c.purpose, ok: c.ok, verdict: c.verdict })),
  grounding: { cited: grounding.length, unresolved },
  tokens: { spent, recordedCompleted: recorded, recordedFailed },
};

writeFileSync(out, `${JSON.stringify(report, null, 2)}\n`);

console.log(`Golden launch, live: ${report.finished ? 'finished' : `stopped — ${failure}`}`);
console.log(`Models: guide ${models.guide}, checker ${models.checker}, planner ${models.planner}`);
console.log(`${calls.length} calls, ${events.length} events, ${(wallMs / 1000).toFixed(1)}s\n`);
for (const [key, row] of Object.entries(report.byPurpose)) {
  console.log(
    `  ${key.padEnd(34)} ${row.ok}/${row.calls} ok   median ${row.medianMs}ms   max ${row.maxMs}ms` +
      `   in ${row.usage.inputTokens} out ${row.usage.outputTokens}`,
  );
}
const retried = report.commands.filter((c) => c.failed > 0 || c.completed > 1);
console.log(`\nCommands re-asked or failed: ${retried.length}`);
for (const c of retried)
  console.log(`  ${c.purposes.join(',')}: ${c.completed} completed, ${c.failed} failed`);
console.log(
  `\nGrounding: ${grounding.length} citations, ${unresolved.length} not resolving to a roll`,
);
console.log(
  `Tokens spent (in/out/cache read/cache write): ${spent.inputTokens}/${spent.outputTokens}/` +
    `${spent.cacheReadTokens}/${spent.cacheWriteTokens}`,
);
console.log(
  `ai.completed recorded:                        ${recorded.inputTokens}/${recorded.outputTokens}/` +
    `${recorded.cacheReadTokens}/${recorded.cacheWriteTokens}` +
    `   ai.failed recorded in/out ${recordedFailed.inputTokens}/${recordedFailed.outputTokens}`,
);
console.log(`\nWritten to ${out}`);
