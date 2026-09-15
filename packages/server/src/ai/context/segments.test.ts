import type { CharacterId } from '@astrolabe/rules';
import type { EventId } from '@astrolabe/shared';
import { describe, expect, it } from 'vitest';

import type { BeatFact } from './describe-beat.js';
import {
  beatNarrationSchema,
  checkSegments,
  checkSegmentTags,
  checkSegmentText,
  joinSegments,
  renderFacts,
  resolveSegments,
  segmentInstructions,
  type Segment,
  type SegmentContext,
} from './segments.js';

const ROOK = 'aaaaaaaa-0000-4000-8000-000000000001' as CharacterId;
const JUNO = 'aaaaaaaa-0000-4000-8000-000000000002' as CharacterId;
const event = (n: number) => `bbbbbbbb-0000-4000-8000-${String(n).padStart(12, '0')}` as EventId;

const facts: readonly BeatFact[] = [
  {
    key: 'F1',
    kind: 'move',
    characterId: ROOK,
    eventId: event(1),
    text: 'Rook makes the move Face Danger with iron.',
  },
  {
    key: 'F2',
    kind: 'declared_action',
    characterId: ROOK,
    eventId: event(1),
    text: 'The player declared: "Rook forces the bulkhead."',
  },
  { key: 'F3', kind: 'roll', characterId: ROOK, eventId: event(2), text: 'Roll: a miss.' },
  { key: 'F4', kind: 'roll', eventId: event(3), text: 'Oracle result (32): You are harmed.' },
  { key: 'F5', kind: 'effect', characterId: ROOK, eventId: event(4), text: 'Rook: health -1.' },
];

const ctx = (latitude: SegmentContext['latitude'] = 'color'): SegmentContext => ({
  facts,
  latitude,
  characters: [
    { id: ROOK, callsign: 'Rook', name: 'Rook Ilari' },
    { id: JUNO, callsign: 'Juno', name: 'Juno Marr' },
  ],
});

const segment = (
  about: Segment['about'],
  character: string | null,
  basis: string[],
  text = 'Text.',
): Segment => ({ about, character, basis, text });

describe('segment tags (D-127)', () => {
  it('lets a character act only in a segment citing their own declared action', () => {
    expect(checkSegmentTags(segment('character_does', 'Rook', ['F2']), ctx())).toBeUndefined();
    expect(checkSegmentTags(segment('character_does', 'Rook', ['F1', 'F3']), ctx())).toBe(
      'It narrated Rook doing something the player did not declare for Rook in this beat.',
    );
    // Rook's declaration is not Juno's.
    expect(checkSegmentTags(segment('character_does', 'Juno', ['F2']), ctx())).toMatch(
      /Juno doing something the player did not declare/,
    );
  });

  it('requires what happens to a character to cite a fact about them', () => {
    expect(checkSegmentTags(segment('character_undergoes', 'Rook', ['F5']), ctx())).toBeUndefined();
    expect(checkSegmentTags(segment('character_undergoes', 'Rook', ['F4']), ctx())).toBe(
      'A segment about what happens to Rook cites no fact about Rook.',
    );
    expect(checkSegmentTags(segment('character_undergoes', 'Juno', ['F5']), ctx())).toMatch(
      /cites no fact about Juno/,
    );
  });

  it('allows a character to speak only at Full voice', () => {
    expect(checkSegmentTags(segment('character_says', 'Rook', []), ctx('color'))).toMatch(
      /only Full voice allows/,
    );
    expect(checkSegmentTags(segment('character_says', 'Rook', []), ctx('minimal'))).toMatch(
      /only Full voice allows/,
    );
    expect(
      checkSegmentTags(segment('character_says', 'Rook', []), ctx('full_voice')),
    ).toBeUndefined();
  });

  it('refuses unknown fact keys, missing characters and a world segment tagged with one', () => {
    expect(checkSegmentTags(segment('world', null, ['F9']), ctx())).toBe(
      'A segment cites F9, which is not a fact of this beat.',
    );
    expect(checkSegmentTags(segment('character_undergoes', null, ['F5']), ctx())).toMatch(
      /names no player character/,
    );
    expect(checkSegmentTags(segment('character_undergoes', 'Kestrel', ['F5']), ctx())).toMatch(
      /not a player character/,
    );
    expect(checkSegmentTags(segment('world', 'Rook', []), ctx())).toMatch(
      /world segment was tagged/,
    );
    expect(checkSegmentTags(segment('world', null, []), ctx())).toBeUndefined();
  });
});

describe('segment text (D-127)', () => {
  it('refuses a world segment that names a player character by callsign or name', () => {
    const world = segment('world', null, []);
    expect(checkSegmentText(world, 'The bulkhead groans open.', ctx())).toBeUndefined();
    expect(checkSegmentText(world, 'Sparks spray across Rook’s arm.', ctx())).toMatch(
      /A world segment named Rook/,
    );
    expect(checkSegmentText(world, 'Marr’s bot whirs.', ctx())).toMatch(/named Juno/);
    // A word containing a name is not the name, and neither is a lowercase rook.
    expect(checkSegmentText(world, 'A rook circles the Rookery.', ctx())).toBeUndefined();
  });

  it('refuses quoted speech in a character segment below Full voice', () => {
    const does = segment('character_does', 'Rook', ['F2']);
    expect(checkSegmentText(does, 'Rook shouts, "Now!"', ctx('color'))).toMatch(/quoted speech/);
    expect(checkSegmentText(does, 'Rook shouts, “Now!”', ctx('minimal'))).toMatch(/quoted speech/);
    expect(checkSegmentText(does, 'Rook shouts, "Now!"', ctx('full_voice'))).toBeUndefined();
    // A non-player character may speak at any latitude.
    expect(
      checkSegmentText(segment('world', null, []), 'The pilot says, "Clear."', ctx()),
    ).toBeUndefined();
  });

  it('what it cannot catch: an undeclared action mislabelled as undergoing', () => {
    // Round 20's spike, un-hardened: an undeclared action passes these checks
    // when it is labelled as something that happens to Rook. D-128 covers it.
    const mislabelled = segment(
      'character_undergoes',
      'Rook',
      ['F5'],
      'Rook braces against the housing, breathes through it.',
    );
    expect(checkSegments([mislabelled], ctx())).toBeUndefined();
  });
});

describe('segmented passages (D-127)', () => {
  it('offers only this beat’s fact keys and the campaign’s callsigns in the schema', () => {
    const schema = beatNarrationSchema(ctx());
    const ok = { segments: [segment('character_does', 'Rook', ['F2'], 'Rook forces it.')] };
    expect(schema.safeParse(ok).success).toBe(true);
    expect(schema.safeParse({ segments: [segment('world', null, ['F6'])] }).success).toBe(false);
    expect(
      schema.safeParse({ segments: [segment('character_does', 'Kestrel', ['F2'])] }).success,
    ).toBe(false);
    // character_does and character_says stay offered at every latitude.
    expect(
      beatNarrationSchema(ctx('minimal')).safeParse({
        segments: [segment('character_says', 'Rook', [])],
      }).success,
    ).toBe(true);
    expect(schema.safeParse({ segments: [] }).success).toBe(false);
  });

  it('renders keyed facts with their kind and character', () => {
    expect(renderFacts(ctx()).split('\n')).toEqual([
      '[F1] (move, Rook) Rook makes the move Face Danger with iron.',
      '[F2] (declared action, Rook) The player declared: "Rook forces the bulkhead."',
      '[F3] (roll, Rook) Roll: a miss.',
      '[F4] (roll) Oracle result (32): You are harmed.',
      '[F5] (effect, Rook) Rook: health -1.',
    ]);
  });

  it('describes character_says by latitude, and says when nothing was declared', () => {
    expect(segmentInstructions(ctx('full_voice'), true)).toMatch(
      /character_says: what a player character says aloud/,
    );
    expect(segmentInstructions(ctx('color'), true)).toMatch(/This latitude does not allow it/);
    expect(segmentInstructions(ctx(), false)).toMatch(/No action was declared/);
    expect(segmentInstructions(ctx(), true)).not.toMatch(/No action was declared/);
  });

  it('joins the text and resolves each basis to its events, once each', () => {
    const segments = [
      segment('character_does', 'Rook', ['F1', 'F2'], ' Rook forces the bulkhead. '),
      segment('character_undergoes', 'Rook', ['F4', 'F5'], 'Sparks catch the arm.'),
      segment('world', null, [], 'The corridor goes quiet.'),
    ];
    expect(joinSegments(segments)).toBe(
      'Rook forces the bulkhead. Sparks catch the arm. The corridor goes quiet.',
    );
    expect(resolveSegments(segments, ctx())).toEqual([
      {
        about: 'character_does',
        characterId: ROOK,
        basis: [event(1)],
        text: 'Rook forces the bulkhead.',
      },
      {
        about: 'character_undergoes',
        characterId: ROOK,
        basis: [event(3), event(4)],
        text: 'Sparks catch the arm.',
      },
      { about: 'world', characterId: null, basis: [], text: 'The corridor goes quiet.' },
    ]);
  });

  it('checks every segment of a finished passage', () => {
    expect(
      checkSegments(
        [
          segment('world', null, [], 'The door opens.'),
          segment('character_does', 'Rook', ['F3'], 'Rook runs.'),
        ],
        ctx(),
      ),
    ).toMatch(/did not declare/);
    expect(checkSegments([segment('world', null, [], '   ')], ctx())).toBe(
      'The passage was empty.',
    );
  });
});
