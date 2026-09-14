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

  const configured =
    nonEmpty(env['ANTHROPIC_API_KEY']) ||
    nonEmpty(env['ANTHROPIC_AUTH_TOKEN']) ||
    nonEmpty(env['ANTHROPIC_PROFILE']);
  const model = env['ASTROLABE_CLAUDE_MODEL'];
  return new ClaudeProvider({
    configured,
    model: nonEmpty(model) ? model : DEFAULT_CLAUDE_MODEL,
  });
}

function nonEmpty(value: string | undefined): value is string {
  return value !== undefined && value.trim().length > 0;
}

/**
 * Local-development answers for every purpose the app asks for, so a
 * stubbed session plays through without pausing.
 */
function devStubResponse(
  request: { readonly purpose: string },
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
  if (mode === 'structured' && request.purpose === 'beat') {
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
  if (mode === 'structured' && request.purpose === 'character_proposal') {
    return { kind: 'structured', value: STUB_CHARACTER_PROPOSAL };
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
};
