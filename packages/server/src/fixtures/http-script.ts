import type { OutcomeTier, RandomSource } from '@astrolabe/rules';
import type {
  CampaignId,
  CommandId,
  EventId,
  InvokeMoveResponse,
  NarrationFrame,
} from '@astrolabe/shared';
import type { FastifyInstance } from 'fastify';
import type { Sql } from 'postgres';

import type { AiProvider, AiRequest } from '../ai/provider.js';
import { StubProvider, type StubResponse } from '../ai/stub.js';
import { buildApp } from '../http/app.js';
import { cryptoRandomSource } from '../random-source.js';

import { fixtureUuid } from './ids.js';
import { loadedDice, type Face, type LoadedDice } from './loaded-dice.js';

/**
 * A fixture played the way the browser plays it (10.1a, D-152, D-205): through
 * the HTTP routes, in process, with the Guide answering from a script and the
 * dice loaded step by step.
 *
 * It fails loudly, naming the fixture and the beat: a route that answers with
 * an error, a die left over, an AI call nobody scripted, or a scripted answer
 * nobody asked for. Command ids derive from the fixture's name (D-122), so a
 * replay of the same script writes the same commands.
 */

/** One passage segment: `[about, character, basis, text]`. */
export type Segment = readonly [
  about: string,
  character: string | null,
  basis: readonly string[],
  text: string,
];

export const segments = (...list: readonly Segment[]): StubResponse => ({
  kind: 'structured',
  value: {
    segments: list.map(([about, character, basis, text]) => ({ about, character, basis, text })),
  },
});

/** An action roll's faces: the action die, then the two challenge dice. */
export const action = (d6: number, [a, b]: readonly [number, number]): Face[] => [
  { sides: 6, face: d6 },
  { sides: 10, face: a },
  { sides: 10, face: b },
];

export const d100 = (...faces: number[]): Face[] => faces.map((face) => ({ sides: 100, face }));

/** A world pass that establishes nothing (D-138). */
export const nothingNew = (review: string): StubResponse => ({
  kind: 'structured',
  value: { review, recipes: [], questions: [], clocks: { create: [], tick: [] } },
});

export interface ScriptOptions {
  readonly fixture: string;
  readonly campaignId: CampaignId;
  /**
   * The Guide to use instead of the script, as 10.3's unconfigured provider
   * is. The checker and planner follow it.
   */
  readonly provider?: AiProvider;
  /**
   * A live Guide, checker and planner (10.5's pass). A live answer can ask
   * for rolls no script foresaw, so past the loaded faces the dice roll for
   * real, and faces left over are not a failure.
   */
  readonly live?: {
    readonly ai: AiProvider;
    readonly checker: AiProvider;
    readonly planner: AiProvider;
  };
}

export interface Answer {
  readonly status: number;
  readonly body: string;
  json<T>(): T;
}

export type FixtureScript = ReturnType<typeof openScript>;

/** A scripted answer, or one computed from the request, as a proposal read off its rolls is. */
export type ScriptedAnswer = StubResponse | ((request: AiRequest) => StubResponse);

export function openScript(sql: Sql, options: ScriptOptions) {
  const { fixture, campaignId } = options;
  let beat = 'setup';
  const where = () => `Fixture ${fixture}, ${beat}`;

  // One queue per purpose, so a beat scripts what it expects to be asked and
  // an unscripted call names itself.
  const scripts = new Map<string, ScriptedAnswer[]>();
  const guide = new StubProvider({
    fallback: (request) => {
      const next = scripts.get(request.purpose)?.shift();
      if (next === undefined) {
        throw new Error(`${where()}: an unscripted ${request.purpose} call.\n${request.user}`);
      }
      return typeof next === 'function' ? next(request) : next;
    },
  });
  // Passes every check: scripted passages are written to pass D-127–D-130.
  const checker = new StubProvider();

  const live = options.live;
  const real = cryptoRandomSource();
  let dice: LoadedDice = loadedDice([]);
  const rng: RandomSource = {
    next: () => (live !== undefined && dice.remaining === 0 ? real.next() : dice.next()),
  };

  const provider = options.provider;
  const app = buildApp({
    sql,
    ai: live?.ai ?? provider ?? guide,
    checker: live?.checker ?? provider ?? checker,
    planner: live?.planner ?? provider ?? guide,
    rng,
  });
  const http = routes(app, campaignId, where);
  const key = <T extends string>(name: string): T => fixtureUuid<T>(fixture, name);
  const id = (name: string) => key<CommandId>(name);

  const rolling = async <T>(faces: readonly Face[], work: () => Promise<T>): Promise<T> => {
    dice = loadedDice(faces);
    try {
      const result = await work();
      if (dice.remaining !== 0 && live === undefined) {
        throw new Error(`${where()}: ${dice.remaining} die/dice left over.`);
      }
      return result;
    } finally {
      dice = loadedDice([]);
    }
  };

  return {
    fixture,
    campaignId,
    app,
    http,
    guide,
    key,
    id,
    rolling,
    /** Name the beat, for every failure that follows. */
    at(name: string) {
      beat = name;
    },
    get beat() {
      return beat;
    },
    fail(message: string): never {
      throw new Error(`${where()}: ${message}`);
    },
    say(purpose: string, ...responses: ScriptedAnswer[]) {
      scripts.set(purpose, [...(scripts.get(purpose) ?? []), ...responses]);
    },
    async move(
      label: string,
      body: Record<string, unknown>,
      faces: readonly Face[],
      expected: OutcomeTier,
    ): Promise<InvokeMoveResponse> {
      const invoked = await rolling(faces, () =>
        http.post<InvokeMoveResponse>('/moves', {
          commandId: id(`${label}:move`),
          adds: [],
          ...body,
        }),
      );
      if (invoked.roll.tier !== expected) {
        throw new Error(
          `${where()}: scripted a ${expected}, the rules scored ${invoked.roll.tier}.`,
        );
      }
      return invoked;
    },
    async narrate(label: string, afterCommandId: CommandId, passage: StubResponse) {
      scripts.set('beat', [...(scripts.get('beat') ?? []), passage]);
      return http.committed(
        await http.stream('/narrations', { commandId: id(`${label}:narration`), afterCommandId }),
      );
    },
    /** The world pass the client asks for after every beat passage (D-138). */
    worldPass(label: string, passageEventId: EventId, faces: readonly Face[] = []) {
      return rolling(faces, () =>
        http.stream('/world-passes', { commandId: id(`${label}:world`), passageEventId }),
      );
    },
    /** Every scripted answer was asked for. */
    assertSpent() {
      if (live !== undefined) return; // A live Guide answers instead of the script.
      for (const [purpose, left] of scripts) {
        if (left.length > 0) {
          throw new Error(
            `Fixture ${fixture}: ${left.length} scripted ${purpose} answer(s) never asked for.`,
          );
        }
      }
    },
    close: () => app.close(),
  };
}

/** The campaign's routes, as the screens call them, failing loudly on anything but success. */
function routes(app: FastifyInstance, campaignId: string, where: () => string) {
  const base = `/api/campaigns/${campaignId}`;
  const fail = (method: string, path: string, status: number, body: string): never => {
    throw new Error(`${where()}: ${method} ${path} answered ${status}: ${body}`);
  };
  const send = async <T>(
    method: 'POST' | 'PUT' | 'DELETE',
    url: string,
    path: string,
    payload: Record<string, unknown>,
  ): Promise<T> => {
    const response = await app.inject({ method, url, payload });
    if (response.statusCode < 200 || response.statusCode >= 300) {
      fail(method, path, response.statusCode, response.body);
    }
    const answer = response.json<T & { ok?: boolean }>();
    if (answer.ok === false) fail(method, path, response.statusCode, response.body);
    return answer;
  };
  return {
    async get<T>(path: string): Promise<T> {
      const response = await app.inject({ method: 'GET', url: `${base}${path}` });
      if (response.statusCode !== 200) fail('GET', path, response.statusCode, response.body);
      return response.json<T>();
    },
    post: <T>(path: string, payload: Record<string, unknown>) =>
      send<T>('POST', `${base}${path}`, path, payload),
    put: <T>(path: string, payload: Record<string, unknown>) =>
      send<T>('PUT', `${base}${path}`, path, payload),
    delete: <T>(path: string, payload: Record<string, unknown>) =>
      send<T>('DELETE', `${base}${path}`, path, payload),
    /** A route outside the campaign, such as creating it. */
    root: <T>(path: string, payload: Record<string, unknown>) =>
      send<T>('POST', `/api${path}`, path, payload),
    /** Any answer, for a script that expects a refusal or an `ok: false`. */
    async attempt(
      method: 'GET' | 'POST' | 'PUT' | 'DELETE',
      path: string,
      payload?: Record<string, unknown>,
    ): Promise<Answer> {
      const response = await app.inject({
        method,
        url: `${base}${path}`,
        ...(payload === undefined ? {} : { payload }),
      });
      return {
        status: response.statusCode,
        body: response.body,
        json: <T>() => response.json<T>(),
      };
    },
    /** A streamed route's frames, in order (D-111). */
    async stream(
      path: string,
      payload: Record<string, unknown>,
    ): Promise<readonly NarrationFrame[]> {
      const response = await app.inject({ method: 'POST', url: `${base}${path}`, payload });
      if (response.statusCode !== 200) fail('POST', path, response.statusCode, response.body);
      return response.body
        .split('\n')
        .filter((line) => line.length > 0)
        .map((line) => JSON.parse(line) as NarrationFrame);
    },
    /** The committed event a stream closed on; a withdrawal or failure throws. */
    committed(frames: readonly NarrationFrame[]): EventId {
      const last = frames.at(-1);
      const withdrawn = frames.filter((f) => f.type === 'withdrawn');
      if (last?.type !== 'committed' || withdrawn.length > 0) {
        throw new Error(
          `${where()}: the stream did not commit cleanly: ${JSON.stringify(
            frames.filter((f) => f.type !== 'delta'),
          )}`,
        );
      }
      return last.eventId;
    },
  };
}
