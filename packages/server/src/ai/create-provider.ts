import { planetClassFromRow, settlementLocationFromRow } from '@astrolabe/rules';

import { stubComplicationOptions } from './context/complication.js';
import { stubSessionSummary } from './context/summary.js';
import { stubWhatNow } from './context/what-now.js';
import { ClaudeProvider, DEFAULT_CLAUDE_MODEL } from './claude.js';
import type { AiProvider } from './provider.js';
import { StubProvider, type StubResponse } from './stub.js';

/**
 * Choose the provider from the environment (D-119).
 *
 * `ASTROLABE_AI_PROVIDER=stub` runs the app locally without a key or a
 * token bill; anything else is Claude. Claude counts as configured when
 * the SDK has a credential it reads from the environment — without one the
 * server starts, and play starts paused (D-116), rather than failing to
 * boot: the campaign's state is still worth reading.
 */
export function createProviderFromEnv(env: NodeJS.ProcessEnv = process.env): AiProvider {
  if (env['ASTROLABE_AI_PROVIDER'] === 'stub') {
    return new StubProvider({ fallback: devStubResponse });
  }

  const configured = hasCredential(env);
  const model = env['ASTROLABE_CLAUDE_MODEL'];
  return new ClaudeProvider({
    configured,
    model: nonEmpty(model) ? model : DEFAULT_CLAUDE_MODEL,
  });
}

export const DEFAULT_CHECK_MODEL = 'claude-sonnet-5';
export const DEFAULT_PLAN_MODEL = 'claude-sonnet-5';

/**
 * The scene frame's planner (D-141, amended): the call that decides what to
 * roll runs before any text, so it runs on a faster model than the narrator
 * to hold A18. `ASTROLABE_PLAN_MODEL` overrides it. With the stub provider,
 * the planner is the dev stub.
 */
export function createPlannerFromEnv(env: NodeJS.ProcessEnv = process.env): AiProvider {
  if (env['ASTROLABE_AI_PROVIDER'] === 'stub') {
    return new StubProvider({ fallback: devStubResponse });
  }
  const model = env['ASTROLABE_PLAN_MODEL'];
  return new ClaudeProvider({
    configured: hasCredential(env),
    model: nonEmpty(model) ? model : DEFAULT_PLAN_MODEL,
  });
}

/**
 * The authority checker (D-128): a second, faster model that judges what
 * the Guide writes. `ASTROLABE_CHECK_MODEL` overrides the model. With the
 * stub provider, the checker is a stub too, and passes everything it is
 * not scripted to reject.
 */
export function createCheckerFromEnv(env: NodeJS.ProcessEnv = process.env): AiProvider {
  if (env['ASTROLABE_AI_PROVIDER'] === 'stub') {
    return new StubProvider();
  }
  const model = env['ASTROLABE_CHECK_MODEL'];
  return new ClaudeProvider({
    configured: hasCredential(env),
    model: nonEmpty(model) ? model : DEFAULT_CHECK_MODEL,
  });
}

function hasCredential(env: NodeJS.ProcessEnv): boolean {
  return (
    nonEmpty(env['ANTHROPIC_API_KEY']) ||
    nonEmpty(env['ANTHROPIC_AUTH_TOKEN']) ||
    nonEmpty(env['ANTHROPIC_PROFILE'])
  );
}

function nonEmpty(value: string | undefined): value is string {
  return value !== undefined && value.trim().length > 0;
}

/**
 * Local-development answers for every purpose the app asks for, so a
 * stubbed session plays through without pausing.
 */
function devStubResponse(
  request: { readonly purpose: string; readonly user: string },
  mode: 'text' | 'structured',
): StubResponse {
  if (mode === 'structured' && request.purpose === 'harm_proposal') {
    return {
      kind: 'structured',
      value: {
        amount: -1,
        injury: 'Stub proposal: something strikes the character’s arm.',
        reason: 'Stub proposal: a glancing blow.',
      },
    };
  }
  if (mode === 'structured' && request.purpose === 'scene_frame_plan') {
    return {
      kind: 'structured',
      value: { review: 'Stub plan: the place needs no rolls.', recipes: [], questions: [] },
    };
  }
  if (
    mode === 'structured' &&
    (request.purpose === 'beat' ||
      request.purpose === 'world_passage' ||
      request.purpose === 'scene_frame' ||
      request.purpose === 'recap')
  ) {
    // One world segment citing nothing: it passes D-127's checks for any beat.
    return {
      kind: 'structured',
      value: {
        segments: [
          {
            about: 'world',
            character: null,
            basis: [],
            text: 'Stub narration: the moment resolves as the dice said, described in a few plain sentences.',
          },
        ],
      },
    };
  }
  if (mode === 'structured' && request.purpose === 'move_suggestion') {
    // Gather Information fits any described action well enough to prove the plumbing.
    return {
      kind: 'structured',
      value: {
        moveId: 'move:adventure/gather-information',
        rollOption: 'wits',
        triggerText: 'When you search for clues',
        reason: 'Stub suggestion: the action reads as looking for something.',
        confidence: 'low',
      },
    };
  }
  if (mode === 'structured' && request.purpose === 'trigger_check') {
    // Most chosen moves fit, and a stubbed session should play without notes.
    return {
      kind: 'structured',
      value: {
        fits: true,
        triggerText: null,
        reason: 'Stub check: the move fits.',
        confidence: 'low',
      },
    };
  }
  if (mode === 'structured' && request.purpose === 'world_plan') {
    // Most beats bring nothing new, and a stubbed session plays without generating.
    return {
      kind: 'structured',
      // Clock fields are stripped on a beat that isn't a pressure beat (D-145).
      value: {
        review: 'Stub plan: nothing new enters the world.',
        recipes: [],
        questions: [],
        clocks: { create: [], tick: [] },
      },
    };
  }
  if (mode === 'structured' && request.purpose === 'session_summary') {
    return { kind: 'structured', value: stubSessionSummary() };
  }
  if (mode === 'structured' && request.purpose === 'what_now') {
    return { kind: 'structured', value: stubWhatNow(request.user) };
  }
  if (mode === 'structured' && request.purpose === 'complication_options') {
    return { kind: 'structured', value: stubComplicationOptions() };
  }
  if (mode === 'structured' && request.purpose === 'incident_proposal') {
    return { kind: 'structured', value: stubIncidentProposal(request.user) };
  }
  if (mode === 'structured' && request.purpose === 'character_proposal') {
    return { kind: 'structured', value: STUB_CHARACTER_PROPOSAL };
  }
  if (mode === 'structured' && request.purpose === 'truth_proposal') {
    // The first official option, which every truth has, so the stubbed path
    // through Campaign Launch reaches an acceptance rather than a refusal.
    // The no-provider path is the *other* half of what the launch has to
    // prove (A42), and it is reached by configuring no provider at all.
    return {
      kind: 'structured',
      value: {
        resolution: 'selected',
        optionIndex: 0,
        reason: 'Stub recommendation: the first option fits what the campaign has so far.',
      },
    };
  }
  if (mode === 'structured' && request.purpose === 'starship_proposal') {
    return { kind: 'structured', value: stubStarshipProposal(request.user) };
  }
  if (mode === 'structured' && request.purpose === 'settlement_proposal') {
    return { kind: 'structured', value: stubSettlementProposal(request.user) };
  }
  if (mode === 'structured' && request.purpose === 'sector_name_proposal') {
    return { kind: 'structured', value: stubSectorName(request.user) };
  }
  if (mode === 'structured' && request.purpose === 'trouble_proposal') {
    return { kind: 'structured', value: stubTroubleProposal(request.user) };
  }
  if (mode === 'structured') {
    return {
      kind: 'error',
      errorKind: 'invalid_output',
      message: `No stub value for ${request.purpose}.`,
    };
  }
  return {
    kind: 'text',
    text: 'Stub narration: the moment resolves as the dice said, described in a few plain sentences.',
  };
}

/**
 * A ship that cites every roll it was given (7.0e), so the stubbed launch
 * reaches an acceptance. The quirk count is read off the rolls in the prompt,
 * because the schema demands exactly as many quirks as were rolled.
 */
function stubStarshipProposal(user: string) {
  const quirkKeys = ['quirk_1', 'quirk_2'].filter((key) => user.includes(`- ${key} (`));
  return {
    name: { value: 'Stub Wake', reason: 'Stub proposal: the name roll.', groundedIn: ['name'] },
    appearance: { value: 'A patched, dependable hull.', reason: 'Stub proposal: its history.' },
    history: {
      value: 'Stub history, read off the roll.',
      reason: 'Stub proposal: the history roll.',
      groundedIn: ['history'],
    },
    quirks: quirkKeys.map((key, index) => ({
      value: `Stub quirk ${index + 1}.`,
      reason: 'Stub proposal: the quirk roll.',
      groundedIn: [key],
    })),
    reason: 'Stub proposal: the ship as the rolls describe it.',
  };
}

/**
 * A settlement that cites every roll it was given (8.0e), so the stubbed launch
 * reaches an acceptance. What to answer is read off the rolls in the prompt:
 * the location and planet class must be the rolled ones, and the schema wants
 * exactly as many projects and first looks as were rolled.
 */
function stubSettlementProposal(user: string) {
  const rolls = oracleRollsOf(user);
  const rolled = (key: string) =>
    new RegExp(`^- ${key} \\([^)]*\\): (.*)$`, 'm').exec(rolls)?.[1]?.trim();
  const cite = (key: string, value: string) => ({
    value,
    reason: `Stub proposal: the ${key} roll.`,
    groundedIn: [key],
  });
  const location = settlementLocationFromRow(rolled('location') ?? '') ?? 'deep_space';
  const planetClass = planetClassFromRow(rolled('planet_class') ?? '');
  const projects = ['project_1', 'project_2'].filter((key) => rolled(key) !== undefined);
  const looks = ['first_look_1', 'first_look_2'].filter((key) => rolled(key) !== undefined);
  return {
    name: cite('name', rolled('name') ?? 'Stub Settlement'),
    location: { ...cite('location', location), value: location },
    population: cite('population', rolled('population') ?? 'Stub population'),
    authority: cite('authority', rolled('authority') ?? 'Stub authority'),
    projects: projects.map((key) => cite(key, rolled(key)!)),
    planet:
      planetClass === undefined
        ? null
        : {
            planetClass: { ...cite('planet_class', planetClass), value: planetClass },
            name: cite('planet_name', rolled('planet_name') ?? 'Stub World'),
          },
    firstLooks: looks.length === 0 ? null : looks.map((key) => cite(key, rolled(key)!)),
    reason: 'Stub proposal: the settlement as the rolls describe it.',
  };
}

/**
 * The `<oracle_rolls>` block of a proposal prompt. The campaign block above it
 * lists truths in the same `- key (label): text` shape, so reading the whole
 * prompt would cite a truth as a roll.
 */
function oracleRollsOf(user: string): string {
  return /<oracle_rolls>([\s\S]*?)<\/oracle_rolls>/.exec(user)?.[1] ?? '';
}

/** A sector name read straight off its prefix and suffix (8.6). */
function stubSectorName(user: string) {
  const rolls = oracleRollsOf(user);
  const part = (key: string) =>
    new RegExp(`^- ${key} \\([^)]*\\): (.*)$`, 'm').exec(rolls)?.[1]?.trim();
  return {
    name: {
      value:
        [part('prefix'), part('suffix')].filter((word) => word !== undefined).join(' ') ||
        'Stub Reach',
      reason: 'Stub proposal: the two name rolls, together.',
      groundedIn: ['prefix', 'suffix'],
    },
    reason: 'Stub proposal: the sector as the rolls name it.',
  };
}

/** A trouble read straight off its roll (8.0e). */
function stubTroubleProposal(user: string) {
  const key = /^- (\S+) \(/m.exec(oracleRollsOf(user))?.[1] ?? 'trouble';
  return {
    text: {
      value: 'Stub trouble, read off the roll.',
      reason: 'Stub proposal: the trouble roll.',
      groundedIn: [key],
    },
    reason: 'Stub proposal: the trouble as the roll describes it.',
  };
}

/** A build that passes the creation rules and cites every roll D-123 makes (3.3). */
const STUB_CHARACTER_PROPOSAL = {
  name: {
    value: 'Stub Given Stub Family',
    reason: 'Stub proposal: the two name rolls, together.',
    groundedIn: ['given-name', 'family-name'],
  },
  callsign: {
    value: 'Stub',
    reason: 'Stub proposal: the callsign roll.',
    groundedIn: ['callsign'],
  },
  stats: {
    value: { edge: 3, heart: 2, iron: 2, shadow: 1, wits: 1 },
    reason: 'Stub proposal: edge leads.',
  },
  assets: [
    { assetId: 'asset:path/ace', reason: 'Stub proposal: a pilot.' },
    { assetId: 'asset:path/navigator', reason: 'Stub proposal: a navigator.' },
    { assetId: 'asset:module/sensor-array', reason: 'Stub proposal: sharper sensors.' },
  ],
  backgroundVow: {
    title: 'Stub proposal: find what was lost',
    rank: 'dangerous',
    reason: 'Stub proposal: a vow to start with.',
  },
  hooks: [
    {
      text: 'Stub hook from the first prompt.',
      reason: 'Stub proposal.',
      groundedIn: ['backstory-1'],
    },
    {
      text: 'Stub hook from the second prompt.',
      reason: 'Stub proposal.',
      groundedIn: ['backstory-2'],
    },
  ],
  pronouns: { value: null, reason: 'Stub proposal: the concept states none.' },
  // The Campaign Launch fields (6.3). Without these the stubbed launch path
  // fails its own schema, which is the one path the golden launch runs on.
  appearance: {
    value: 'Stub proposal: a jacket worn through at the elbows.',
    reason: 'Stub proposal: a working spacer.',
  },
  backstory: {
    kind: 'written',
    text: 'Stub backstory, built from both prompts.',
    reason: 'Stub proposal: the two backstory rolls.',
    groundedIn: ['backstory-1', 'backstory-2'],
  },
  signatureGear: { value: null, reason: 'Stub proposal: nothing the concept names.' },
};

/**
 * Three incidents, one per roll (4.6). They draw on the first truth and the
 * first crew member the request lists, read back out of `renderSetup`'s
 * lines, so the proposal passes its check on any campaign.
 */
function stubIncidentProposal(user: string) {
  const truth = /^- (oracle:\S+) \(/m.exec(user)?.[1];
  const crew = /^The crew:\n- ([^:\n]+):/m.exec(user)?.[1];
  return {
    options: [1, 2, 3].map((n) => ({
      title: `Stub proposal ${n}: see the rolled incident through`,
      rank: 'formidable',
      situation: `Stub proposal: the situation incident roll ${n} describes has come to a head.`,
      reason: 'Stub proposal: the incident roll, as rolled.',
      groundedIn: [`incident-${n}`],
      // Every part, even empty: a part the campaign lacks is simply not in the schema.
      drawsOn: {
        truths: truth !== undefined ? [truth] : [],
        locations: [],
        crew: crew !== undefined ? [crew] : [],
      },
    })),
  };
}
