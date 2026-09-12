import { describe, expect, it } from 'vitest';

import type { CharacterId, MoveId } from '../schema/ids.js';
import { resolveEffectTarget } from './resolve-effect-target.js';

const rook = 'rook' as CharacterId;
const vesna = 'vesna' as CharacterId;

describe('resolveEffectTarget', () => {
  it('resolves to the actor when there is no aided ally', () => {
    expect(
      resolveEffectTarget(
        'actor',
        { moveId: 'move:adventure/face-danger', actorId: rook },
        'strong_hit',
      ),
    ).toBe(rook);
  });

  it('redirects an actor-targeted effect to the aided ally on a hit (D-62, Beat 5)', () => {
    const invocation = {
      moveId: 'move:adventure/secure-an-advantage' as MoveId,
      actorId: rook,
      aidingAllyId: vesna,
    };
    expect(resolveEffectTarget('actor', invocation, 'strong_hit')).toBe(vesna);
    expect(resolveEffectTarget('actor', invocation, 'weak_hit')).toBe(vesna);
  });

  it('does not redirect on a miss — the aiding character keeps their own consequences', () => {
    const invocation = {
      moveId: 'move:adventure/secure-an-advantage' as MoveId,
      actorId: rook,
      aidingAllyId: vesna,
    };
    expect(resolveEffectTarget('actor', invocation, 'miss')).toBe(rook);
  });

  it('resolves an aided_ally-targeted effect to the ally whenever one is set', () => {
    const invocation = {
      moveId: 'move:adventure/secure-an-advantage' as MoveId,
      actorId: rook,
      aidingAllyId: vesna,
    };
    expect(resolveEffectTarget('aided_ally', invocation, 'miss')).toBe(vesna);
  });

  it('falls back to the actor for an aided_ally target when no ally is set', () => {
    expect(
      resolveEffectTarget(
        'aided_ally',
        { moveId: 'move:adventure/face-danger', actorId: rook },
        'strong_hit',
      ),
    ).toBe(rook);
  });
});
