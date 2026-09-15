import type { CharacterId } from '@astrolabe/rules';
import type { EventId } from '@astrolabe/shared';
import { describe, expect, it } from 'vitest';

import type { SegmentContext } from './context/segments.js';
import { JsonStream, type JsonPath, type JsonScalar } from './json-stream.js';
import { SegmentGate } from './segment-gate.js';

const ROOK = 'aaaaaaaa-0000-4000-8000-000000000001' as CharacterId;
const EVENT = 'bbbbbbbb-0000-4000-8000-000000000001' as EventId;

const ctx: SegmentContext = {
  latitude: 'color',
  characters: [{ id: ROOK, callsign: 'Rook', name: 'Rook Ilari' }],
  facts: [
    { key: 'F1', kind: 'move', characterId: ROOK, eventId: EVENT, text: 'Rook makes a move.' },
    { key: 'F2', kind: 'declared_action', characterId: ROOK, eventId: EVENT, text: 'Declared.' },
  ],
};

/** Feed `json` in pieces of `size`, the way a provider streams it. */
function feed(write: (chunk: string) => void, json: string, size: number): void {
  for (let i = 0; i < json.length; i += size) {
    write(json.slice(i, i + size));
  }
}

describe('JsonStream', () => {
  it('reports scalars with their paths, string pieces as they arrive, and closes', () => {
    const values: [JsonPath, JsonScalar][] = [];
    const chunks: string[] = [];
    const closes: JsonPath[] = [];
    const stream = new JsonStream({
      value: (path, value) => values.push([path, value]),
      stringChunk: (_path, chunk) => chunks.push(chunk),
      close: (path) => closes.push(path),
    });
    const doc = {
      segments: [
        {
          about: 'world',
          character: null,
          basis: ['F1', 'F2'],
          text: 'A "quoted" line,\nthen é\\.',
        },
      ],
      n: -1.5,
      ok: true,
    };

    feed((c) => stream.write(c), JSON.stringify(doc).replace('é', '\\u00e9'), 3);

    expect(values).toEqual([
      [['segments', 0, 'about'], 'world'],
      [['segments', 0, 'character'], null],
      [['segments', 0, 'basis', 0], 'F1'],
      [['segments', 0, 'basis', 1], 'F2'],
      [['segments', 0, 'text'], 'A "quoted" line,\nthen é\\.'],
      [['n'], -1.5],
      [['ok'], true],
    ]);
    expect(chunks.join('')).toBe('worldF1F2A "quoted" line,\nthen é\\.');
    expect(closes).toEqual([['segments', 0, 'basis'], ['segments', 0], ['segments'], []]);
  });
});

describe('SegmentGate (D-127)', () => {
  function run(segments: unknown[], size = 4) {
    const released: string[] = [];
    const gate = new SegmentGate(ctx, (text) => released.push(text));
    feed((c) => gate.write(c), JSON.stringify({ segments }), size);
    return { shown: released.join(''), problem: gate.problem };
  }

  it('releases checked segments as one paragraph', () => {
    const { shown, problem } = run([
      {
        about: 'character_does',
        character: 'Rook',
        basis: ['F2'],
        text: 'Rook forces the bulkhead.',
      },
      { about: 'world', character: null, basis: [], text: ' The corridor goes quiet.' },
    ]);
    expect(problem).toBeUndefined();
    expect(shown).toBe('Rook forces the bulkhead. The corridor goes quiet.');
  });

  it('shows none of a segment whose tags fail', () => {
    const { shown, problem } = run([
      { about: 'world', character: null, basis: [], text: 'The bulkhead gives.' },
      {
        about: 'character_does',
        character: 'Rook',
        basis: ['F1'],
        text: 'Rook steps through the gap.',
      },
      { about: 'world', character: null, basis: [], text: 'Dust settles.' },
    ]);
    expect(problem).toMatch(/did not declare/);
    expect(shown).toBe('The bulkhead gives.');
  });

  it('never shows a player character’s name in a world segment, whatever the chunking', () => {
    for (const size of [1, 2, 3, 5, 8, 13, 200]) {
      const { shown, problem } = run(
        [{ about: 'world', character: null, basis: [], text: 'Sparks spray across Rook’s arm.' }],
        size,
      );
      expect(problem).toMatch(/named Rook/);
      // Not even its first letter.
      expect(shown).not.toContain('R');
    }
  });

  it('stops at a quotation mark below Full voice', () => {
    const { shown, problem } = run([
      {
        about: 'character_does',
        character: 'Rook',
        basis: ['F2'],
        text: 'Rook calls out, "Clear!"',
      },
    ]);
    expect(problem).toMatch(/quoted speech/);
    expect(shown).not.toContain('"');
    expect(shown).not.toContain('Clear');
  });

  it('holds text that arrives before its tags until the segment closes', () => {
    const released: string[] = [];
    const gate = new SegmentGate(ctx, (text) => released.push(text));
    feed(
      (c) => gate.write(c),
      '{"segments":[{"text":"The door opens.","about":"world","character":null,"basis":[]}]}',
      4,
    );
    expect(gate.problem).toBeUndefined();
    expect(released.join('')).toBe('The door opens.');
  });
});
